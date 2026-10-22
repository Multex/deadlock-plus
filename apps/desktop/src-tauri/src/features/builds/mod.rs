mod error;
mod plan;
pub mod views;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use dp_builds::drafts;
use dp_builds::history::{self, Version};
use dp_builds::paths::{self, Target};
use dp_builds::queue::{self, FlushReport, QueueError, QueuedSave};
use dp_builds::save::{save_with, SaveError, SaveOp};
use dp_gamedata::{GameData, HeroEntry, HeroTable, HeroVdata};
use dp_sync::LockExt;
use tauri::{AppHandle, Emitter, Manager};

use crate::features::error::{AppError, ErrorKey};
use crate::features::gamedata::GameVdata;
use error::BuildsError;
use plan::{HeroInfo, Heroes, Planned};
use views::{FlushView, SaveResult};

pub const FLUSHED_EVENT: &str = "builds://flushed";

/// Every write of the build file and the queue goes through this: the queue file has no lock of its own.
static SAVE_LOCK: Mutex<()> = Mutex::new(());

/// Every write of the drafts file. Taken after `SAVE_LOCK` when both are held, never before it.
static DRAFT_LOCK: Mutex<()> = Mutex::new(());

struct Dirs {
    backups: PathBuf,
    drafts: PathBuf,
    history: PathBuf,
    queue: PathBuf,
}

impl Dirs {
    fn under(app_data: &Path) -> Self {
        let root = app_data.join("builds");
        Self {
            backups: root.join("backups"),
            drafts: root.join("drafts"),
            history: root.join("history"),
            queue: root.join("queue"),
        }
    }
}

fn app_dirs(app: &AppHandle) -> Result<Dirs, AppError> {
    app.path().app_data_dir().map(|dir| Dirs::under(&dir)).map_err(AppError::io)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn read_file(path: &Path) -> Result<Option<Vec<u8>>, AppError> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::new(BuildsError::ReadFailed).param("path", path.display()).detail(e)),
    }
}

/// A hero missing from `heroes.vdata` (or every hero, while the game cannot be read) has no ability slots.
fn heroes(entries: &[HeroEntry], table: Option<&HeroTable>) -> Heroes {
    Heroes(
        entries
            .iter()
            .map(|h| HeroInfo { id: h.id, class_name: h.class_name.clone(), abilities: hero_ability_ids(table, h.id) })
            .collect(),
    )
}

/// The hero's 4 ability slots from `heroes.vdata`, ultimate last.
fn hero_ability_ids(table: Option<&HeroTable>, hero_id: u32) -> Option<[u32; 4]> {
    table?.abilities.get(&hero_id).copied()
}

fn installed_heroes(data: &GameData, vdata: &HeroVdata) -> Heroes {
    heroes(&data.heroes("en"), vdata.table().as_deref())
}

/// Writes now, or queues the save while the game runs (it would drop a write on its next save).
fn submit(
    dirs: &Dirs,
    target: &Target,
    now: u64,
    planned: Planned,
    game_running: &dyn Fn() -> bool,
) -> Result<SaveResult, AppError> {
    let account = target.account_id32;
    match save_with(game_running, &target.path, &dirs.backups, account, now, &planned.ops) {
        Ok(outcome) => {
            if matches!(outcome, dp_builds::save::SaveOutcome::Written { .. }) {
                record_history(dirs, account, now, &planned);
            }
            Ok(plan::save_result(planned.build_id, outcome))
        }
        Err(SaveError::GameRunning) => {
            let build_id = planned.build_id;
            let save =
                QueuedSave { id: String::new(), queued_at: now, label: planned.label, build_id, ops: planned.ops };
            let id = queue::enqueue(&dirs.queue, account, save)?;
            Ok(SaveResult::Queued { id, build_id })
        }
        Err(e) => Err(e.into()),
    }
}

/// History is a convenience: the build file already holds the save, so a failure here is logged only.
fn record_history(dirs: &Dirs, account: u32, now: u64, planned: &Planned) {
    for op in &planned.ops {
        let result = match op {
            SaveOp::Upsert { blob, .. } => match dp_builds::file::peek_build_id(blob) {
                Some(id) => history::record(
                    &dirs.history,
                    account,
                    id,
                    Version { saved_at: now, blob: blob.clone(), name: planned.label.clone(), note: None },
                ),
                None => Ok(()),
            },
            SaveOp::Delete { id, .. } => history::forget(&dirs.history, account, *id),
            _ => Ok(()),
        };
        if let Err(e) = result {
            log::warn!("build history for {} not updated: {e}", planned.build_id);
        }
    }
}

/// Drafts are a convenience too: the save already happened, so a failure here is logged only.
fn drafts_after_save(dirs: &Dirs, account: u32, result: &SaveResult, draft_id: Option<&str>) {
    let (SaveResult::Written { build_id, .. } | SaveResult::Queued { build_id, .. }) = result else { return };
    let _guard = DRAFT_LOCK.lock_or_recover();
    if let Some(id) = draft_id {
        if let Err(e) = drafts::remove(&dirs.drafts, account, id) {
            log::warn!("draft {id} not removed after its save: {e}");
        }
    }
    if let Err(e) = drafts::clear_for_build(&dirs.drafts, account, *build_id) {
        log::warn!("drafts of build {build_id} not removed after its save: {e}");
    }
}

struct SaveInputs {
    heroes: Heroes,
    language: u32,
}

fn save_planned(
    dirs: &Dirs,
    inputs: SaveInputs,
    make: impl FnOnce(&plan::Ctx) -> Result<Planned, AppError>,
) -> Result<SaveResult, AppError> {
    save_planned_for(dirs, inputs, make).map(|(_, result)| result)
}

/// Plans against the file as it is now, under the save lock, then writes or queues. Also returns the
/// account it saved for.
fn save_planned_for(
    dirs: &Dirs,
    inputs: SaveInputs,
    make: impl FnOnce(&plan::Ctx) -> Result<Planned, AppError>,
) -> Result<(u32, SaveResult), AppError> {
    let _guard = SAVE_LOCK.lock_or_recover();
    let target = paths::current_target()?;
    let running = paths::game_running_now();
    let bytes = read_file(&target.path)?;
    let file = match &bytes {
        Some(bytes) => dp_builds::file::BuildsFile::parse(bytes)?,
        None => dp_builds::file::BuildsFile::empty(),
    };
    let queued = queue::pending(&dirs.queue, target.account_id32)?;
    let now = now_secs();
    let ctx = plan::Ctx {
        file: &file,
        queued: &queued,
        chain_queued: running,
        heroes: &inputs.heroes,
        account: target.account_id32,
        now: u32::try_from(now).unwrap_or(u32::MAX),
        language: inputs.language,
    };
    let planned = make(&ctx)?;
    Ok((target.account_id32, submit(dirs, &target, now, planned, &paths::game_running_now)?))
}

fn flush_report(dirs: &Dirs) -> Result<Result<FlushReport, QueueError>, AppError> {
    let _guard = SAVE_LOCK.lock_or_recover();
    let target = paths::current_target()?;
    let account = target.account_id32;
    Ok(queue::flush(
        &dirs.queue,
        account,
        &target.path,
        &dirs.backups,
        now_secs(),
        &paths::game_running_now,
        &dirs.history,
    ))
}

fn queue_failed(error: &QueueError) -> FlushView {
    log::warn!("build queue could not be flushed: {error}");
    FlushView::Failed { code: BuildsError::QueueFailed.code() }
}

fn flush_now(dirs: &Dirs) -> Result<FlushView, AppError> {
    Ok(match flush_report(dirs)? {
        Ok(report) => plan::flush_view(report),
        Err(e) => queue_failed(&e),
    })
}

/// Writes the queued saves once Deadlock closes, and tells the page what happened.
pub fn on_game_probe(app: &AppHandle, last: Option<bool>, running: bool) {
    if !plan::should_flush(last, running) {
        return;
    }
    let Ok(dirs) = app_dirs(app) else { return };
    let app = app.clone();
    let spawned = std::thread::Builder::new().name("builds-flush".into()).spawn(move || {
        let view = match flush_report(&dirs) {
            Ok(Ok(FlushReport::Nothing)) => return,
            Ok(Ok(report)) => plan::flush_view(report),
            Ok(Err(e)) => queue_failed(&e),
            Err(e) => {
                log::debug!("build queue not flushed: {e}");
                return;
            }
        };
        if let Err(e) = app.emit(FLUSHED_EVENT, view) {
            log::warn!("could not emit {FLUSHED_EVENT}: {e}");
        }
    });
    if let Err(e) = spawned {
        log::warn!("could not start the build queue flush: {e}");
    }
}

pub mod commands {
    use super::*;
    use crate::features::i18n::I18nState;
    use dp_builds::drafts::DraftView;
    use dp_builds::model::BuildView;
    use tauri::State;
    use views::{BuildBackup, BuildSection, LocalBuilds, ResolveChoice, SaveRequest};

    async fn blocking<T: Send + 'static>(
        work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
    ) -> Result<T, AppError> {
        tauri::async_runtime::spawn_blocking(work).await.map_err(AppError::internal)?
    }

    fn save_inputs(data: &GameData, vdata: &HeroVdata, locale: &str) -> SaveInputs {
        SaveInputs {
            heroes: installed_heroes(data, vdata),
            language: plan::proto_language(dp_gamedata::game_language(locale)),
        }
    }

    fn no_heroes() -> SaveInputs {
        SaveInputs { heroes: Heroes::default(), language: 0 }
    }

    #[tauri::command]
    pub async fn builds_local(
        app: AppHandle,
        data: State<'_, GameData>,
        vdata: State<'_, GameVdata>,
    ) -> Result<LocalBuilds, AppError> {
        let dirs = app_dirs(&app)?;
        let data = data.inner().clone();
        let vdata = Arc::clone(&vdata.heroes);
        blocking(move || {
            let target = paths::current_target()?;
            let bytes = read_file(&target.path)?;
            let queued = queue::pending(&dirs.queue, target.account_id32)?;
            plan::local_builds(
                bytes.as_deref(),
                &installed_heroes(&data, &vdata),
                &queued,
                target.account_id32,
                paths::game_running_recent(),
            )
        })
        .await
    }

    #[tauri::command]
    pub async fn builds_save(
        app: AppHandle,
        data: State<'_, GameData>,
        vdata: State<'_, GameVdata>,
        i18n: State<'_, I18nState>,
        request: SaveRequest,
        draft_id: Option<String>,
    ) -> Result<SaveResult, AppError> {
        let dirs = app_dirs(&app)?;
        let data = data.inner().clone();
        let vdata = Arc::clone(&vdata.heroes);
        let locale = i18n.locale();
        blocking(move || {
            let inputs = save_inputs(&data, &vdata, &locale);
            let (account, result) = save_planned_for(&dirs, inputs, |ctx| plan::plan_save(request, ctx))?;
            drafts_after_save(&dirs, account, &result, draft_id.as_deref());
            Ok(result)
        })
        .await
    }

    /// Newest first.
    #[tauri::command]
    pub async fn builds_drafts(app: AppHandle) -> Result<Vec<DraftView>, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            let target = paths::current_target()?;
            Ok(drafts::list(&dirs.drafts, target.account_id32)?)
        })
        .await
    }

    /// Autosave: stores the draft under its id, or under a new one when `id` is empty.
    #[tauri::command]
    pub async fn builds_draft_save(app: AppHandle, draft: DraftView) -> Result<DraftView, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            let target = paths::current_target()?;
            let _guard = DRAFT_LOCK.lock_or_recover();
            Ok(drafts::upsert(&dirs.drafts, target.account_id32, draft, now_secs())?)
        })
        .await
    }

    #[tauri::command]
    pub async fn builds_draft_delete(app: AppHandle, id: String) -> Result<bool, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            let target = paths::current_target()?;
            let _guard = DRAFT_LOCK.lock_or_recover();
            Ok(drafts::remove(&dirs.drafts, target.account_id32, &id)?)
        })
        .await
    }

    #[tauri::command]
    pub async fn builds_delete(
        app: AppHandle,
        section: BuildSection,
        id: u32,
        base: String,
    ) -> Result<SaveResult, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || save_planned(&dirs, no_heroes(), |_| plan::plan_delete(section.into(), id, &base))).await
    }

    #[tauri::command]
    pub async fn builds_favourite(
        app: AppHandle,
        base: Option<String>,
        id: Option<u32>,
        view: Option<BuildView>,
    ) -> Result<SaveResult, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            save_planned(&dirs, no_heroes(), |ctx| plan::plan_favourite(ctx.file, base.as_deref(), id, view.as_ref()))
        })
        .await
    }

    #[tauri::command]
    pub async fn builds_unfavourite(app: AppHandle, id: u32) -> Result<SaveResult, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || save_planned(&dirs, no_heroes(), |ctx| Ok(plan::plan_unfavourite(ctx.file, id)))).await
    }

    #[tauri::command]
    pub async fn builds_queue_cancel(app: AppHandle, id: String) -> Result<bool, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            let _guard = SAVE_LOCK.lock_or_recover();
            let target = paths::current_target()?;
            Ok(queue::cancel(&dirs.queue, target.account_id32, &id)?)
        })
        .await
    }

    /// Resolves one queued save, then tries the queue again (it writes at once if the game is closed).
    #[tauri::command]
    pub async fn builds_queue_resolve(
        app: AppHandle,
        id: String,
        choice: ResolveChoice,
    ) -> Result<FlushView, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            {
                let _guard = SAVE_LOCK.lock_or_recover();
                let target = paths::current_target()?;
                let choice = match choice {
                    ResolveChoice::Ours => queue::Choice::KeepOurs,
                    ResolveChoice::Game => queue::Choice::KeepGame,
                };
                queue::resolve_conflict(&dirs.queue, target.account_id32, &target.path, &id, choice)?;
            }
            flush_now(&dirs)
        })
        .await
    }

    #[tauri::command]
    pub async fn builds_flush(app: AppHandle) -> Result<FlushView, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || flush_now(&dirs)).await
    }

    #[tauri::command]
    pub async fn builds_history(
        app: AppHandle,
        build_id: u32,
    ) -> Result<Vec<dp_builds::history::BuildVersionMeta>, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            let target = paths::current_target()?;
            Ok(history::list(&dirs.history, target.account_id32, build_id)?)
        })
        .await
    }

    #[tauri::command]
    pub async fn builds_history_get(app: AppHandle, build_id: u32, version_id: String) -> Result<BuildView, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            let target = paths::current_target()?;
            let version = history::get(&dirs.history, target.account_id32, build_id, &version_id)?
                .ok_or(BuildsError::VersionNotFound)?;
            let decoded = dp_builds::wire::HeroBuildResult::decode(&version.blob)
                .map_err(|e| AppError::new(BuildsError::HistoryFailed).detail(e))?;
            Ok(dp_builds::model::view(&decoded))
        })
        .await
    }

    #[tauri::command]
    pub async fn builds_backups(app: AppHandle) -> Result<Vec<BuildBackup>, AppError> {
        let dirs = app_dirs(&app)?;
        blocking(move || {
            let target = paths::current_target()?;
            Ok(dp_builds::backup::list_backups(&dirs.backups, target.account_id32)
                .into_iter()
                .map(|b| BuildBackup { path: b.path.to_string_lossy().into_owned(), timestamp: b.timestamp })
                .collect())
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_builds::drafts::{self, DraftSource, DraftView};
    use dp_builds::file::{BuildsFile, Section};
    use dp_builds::model;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-builds-feature-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn planned(id: u32) -> Planned {
        let blob = model::new_local(id, 7, 1, 0, 100).encode();
        Planned {
            label: "mine".into(),
            build_id: id,
            ops: vec![SaveOp::Upsert {
                section: Section::Unpublished,
                blob,
                base: None,
                hero_class: Some("hero_inferno".into()),
            }],
        }
    }

    fn hero(id: u32, class_name: &str) -> HeroEntry {
        HeroEntry {
            id,
            class_name: class_name.into(),
            name: class_name.into(),
            localised: true,
            selectable: true,
            in_development: false,
            disabled: false,
            pre_release: false,
            portrait: None,
            card: None,
        }
    }

    #[test]
    fn heroes_take_their_ability_slots_from_the_game_data() {
        let entries = [hero(1, "hero_inferno"), hero(2, "hero_gigawatt")];
        let table = HeroTable {
            progression: dp_gamedata::HeroProgression { levels: Vec::new() },
            abilities: [(1, [11, 12, 13, 14])].into(),
            popular_items: Default::default(),
            stats: Default::default(),
        };
        let known = heroes(&entries, Some(&table));
        assert_eq!(known.abilities(1), Some([11, 12, 13, 14]));
        assert_eq!(known.abilities(2), None);
        assert_eq!(known.class_name(2), Some("hero_gigawatt"));
        assert_eq!(heroes(&entries, None).abilities(1), None);
    }

    #[test]
    fn dirs_live_in_a_builds_folder_in_app_data() {
        let dirs = Dirs::under(Path::new("A"));
        assert_eq!(dirs.backups, Path::new("A").join("builds").join("backups"));
        assert_eq!(dirs.drafts, Path::new("A").join("builds").join("drafts"));
        assert_eq!(dirs.history, Path::new("A").join("builds").join("history"));
        assert_eq!(dirs.queue, Path::new("A").join("builds").join("queue"));
    }

    #[test]
    fn a_save_with_the_game_closed_writes_the_file_and_its_history() {
        let root = temp_dir("write");
        let dirs = Dirs::under(&root);
        let target = Target { account_id32: 7, path: root.join("cfg").join("cached_hero_builds.kv3") };
        std::fs::create_dir_all(target.path.parent().unwrap()).unwrap();
        let result = submit(&dirs, &target, 1_000, planned(1), &|| false).unwrap();
        assert_eq!(result, SaveResult::Written { build_id: 1, backup: None });
        let file = BuildsFile::parse(&std::fs::read(&target.path).unwrap()).unwrap();
        assert!(file.get(Section::Unpublished, 1).is_some());
        assert_eq!(file.last_used("hero_inferno"), Some(1));
        assert_eq!(history::list(&dirs.history, 7, 1).unwrap().len(), 1);
        assert!(queue::pending(&dirs.queue, 7).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_save_while_the_game_runs_is_queued_and_the_file_is_untouched() {
        let root = temp_dir("queue");
        let dirs = Dirs::under(&root);
        let target = Target { account_id32: 7, path: root.join("cached_hero_builds.kv3") };
        let result = submit(&dirs, &target, 1_000, planned(1), &|| true).unwrap();
        let SaveResult::Queued { id, build_id: 1 } = result else { panic!("{result:?}") };
        let pending = queue::pending(&dirs.queue, 7).unwrap();
        assert_eq!((pending.len(), pending[0].id.as_str(), pending[0].label.as_str()), (1, id.as_str(), "mine"));
        assert!(!target.path.exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    fn store_draft(dirs: &Dirs, name: &str, source: DraftSource) -> String {
        let build = model::BuildView { hero_id: 1, name: name.into(), ..Default::default() };
        let draft = DraftView { id: String::new(), updated_at: 0, hero_id: 0, source, build };
        drafts::upsert(&dirs.drafts, 7, draft, 1).unwrap().id
    }

    fn draft_names(dirs: &Dirs) -> Vec<String> {
        drafts::list(&dirs.drafts, 7).unwrap().into_iter().map(|d| d.build.name).collect()
    }

    #[test]
    fn a_written_or_queued_save_drops_its_draft_and_the_builds_edit_drafts() {
        let root = temp_dir("drafts");
        let dirs = Dirs::under(&root);
        let local = |build_id| DraftSource::Local { section: Section::Unpublished, build_id, base: String::new() };
        let saved = store_draft(&dirs, "new", DraftSource::New);
        store_draft(&dirs, "other", DraftSource::New);
        store_draft(&dirs, "edit 4", local(4));
        store_draft(&dirs, "edit 5", local(5));
        drafts_after_save(&dirs, 7, &SaveResult::Conflict { conflicts: Vec::new() }, Some(&saved));
        drafts_after_save(&dirs, 7, &SaveResult::Unchanged { build_id: 4 }, Some(&saved));
        assert_eq!(draft_names(&dirs).len(), 4);
        drafts_after_save(&dirs, 7, &SaveResult::Written { build_id: 4, backup: None }, Some(&saved));
        assert_eq!(draft_names(&dirs), vec!["edit 5", "other"]);
        drafts_after_save(&dirs, 7, &SaveResult::Queued { id: "q".into(), build_id: 5 }, None);
        assert_eq!(draft_names(&dirs), vec!["other"]);
        let _ = std::fs::remove_dir_all(&root);
    }
}
