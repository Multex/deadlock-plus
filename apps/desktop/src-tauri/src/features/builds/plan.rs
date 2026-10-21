use dp_builds::file::{peek_build_id, BuildsFile, Section, LOCAL_ID_LIMIT};
use dp_builds::model::{self, AbilityOrderWarning, BuildView, CurrencyChangeView};
use dp_builds::queue::{FlushReport, QueuedSave, QueuedSaveView};
use dp_builds::save::{Conflict, SaveOp, SaveOutcome};
use dp_builds::wire::HeroBuildResult;

use super::error::{save_error_key, BuildsError};
use super::views::{ConflictView, FlushView, LastUsedBuild, LocalBuild, LocalBuilds, SaveRequest, SaveResult};
use crate::features::error::{AppError, ErrorKey};

pub struct HeroInfo {
    pub id: u32,
    pub class_name: String,
    /// The 4 ability slots, ultimate last.
    pub abilities: Option<[u32; 4]>,
}

#[derive(Default)]
pub struct Heroes(pub Vec<HeroInfo>);

impl Heroes {
    fn get(&self, id: u32) -> Option<&HeroInfo> {
        self.0.iter().find(|h| h.id == id)
    }

    pub fn class_name(&self, id: u32) -> Option<&str> {
        self.get(id).map(|h| h.class_name.as_str())
    }

    pub fn abilities(&self, id: u32) -> Option<[u32; 4]> {
        self.get(id)?.abilities
    }
}

pub fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn decode_hex(text: &str) -> Option<Vec<u8>> {
    if !text.is_ascii() || !text.len().is_multiple_of(2) {
        return None;
    }
    (0..text.len()).step_by(2).map(|i| u8::from_str_radix(&text[i..i + 2], 16).ok()).collect()
}

pub fn decode_base(hex: &str) -> Result<(Vec<u8>, HeroBuildResult), AppError> {
    let blob = decode_hex(hex).ok_or(BuildsError::BadBase)?;
    let build = HeroBuildResult::decode(&blob).map_err(|e| AppError::new(BuildsError::BadBase).detail(e))?;
    if build.hero_build.as_ref().and_then(|h| h.hero_build_id).is_none() {
        return Err(BuildsError::BadBase.into());
    }
    Ok((blob, build))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Planned {
    pub label: String,
    pub build_id: u32,
    pub ops: Vec<SaveOp>,
}

pub struct Ctx<'a> {
    pub file: &'a BuildsFile,
    pub queued: &'a [QueuedSave],
    /// Set while the save will be queued: its bases are then what the queue leaves in the file, so
    /// the queue can chain it onto the saves before it.
    pub chain_queued: bool,
    pub heroes: &'a Heroes,
    pub account: u32,
    pub now: u32,
    pub language: u32,
}

impl Ctx<'_> {
    /// The section's entries once the queued saves (when chained) have run.
    fn entries(&self, section: Section) -> Vec<(u32, Vec<u8>)> {
        let mut entries: Vec<(u32, Vec<u8>)> =
            self.file.entries(section).into_iter().filter_map(|b| Some((peek_build_id(b)?, b.to_vec()))).collect();
        let queued = if self.chain_queued { self.queued } else { &[] };
        for op in queued.iter().flat_map(|s| &s.ops) {
            let (at, id, blob) = match op {
                SaveOp::Upsert { section, blob, .. } => (*section, peek_build_id(blob), Some(blob)),
                SaveOp::Delete { section, id, .. } => (*section, Some(*id), None),
                SaveOp::Favourite { blob } => (Section::Favorites, peek_build_id(blob), Some(blob)),
                SaveOp::Unfavourite { id } => (Section::Favorites, Some(*id), None),
                SaveOp::SetLastUsed { .. } => continue,
            };
            let Some(id) = id.filter(|_| at == section) else { continue };
            entries.retain(|(x, _)| *x != id);
            if let Some(blob) = blob {
                entries.push((id, blob.clone()));
            }
        }
        entries
    }
}

/// Published builds are edited through `SavedLastUsed`, the only place the game keeps local edits of
/// them; the user then presses Publish in game.
fn target_section(section: Section, id: u32) -> Section {
    if id >= LOCAL_ID_LIMIT {
        Section::SavedLastUsed
    } else {
        section
    }
}

pub fn plan_save(request: SaveRequest, ctx: &Ctx) -> Result<Planned, AppError> {
    match request {
        SaveRequest::Edit { section, base, build } => {
            let section = Section::from(section);
            let (blob, base) = decode_base(&base)?;
            let base_view = model::view(&base);
            let mut build = build;
            build.hero_build_id = base_view.hero_build_id;
            build.last_updated_timestamp = Some(ctx.now);
            let target = target_section(section, build.hero_build_id);
            let guard = if target == section {
                Some(blob)
            } else {
                ctx.entries(target).into_iter().find(|(id, _)| *id == build.hero_build_id).map(|(_, b)| b)
            };
            upsert(target, guard, &base, &base_view, build, ctx)
        }
        SaveRequest::New { build } => {
            let id = next_local_id(ctx.file, ctx.queued).ok_or(BuildsError::NoLocalId)?;
            created(model::new_local(id, ctx.account, build.hero_id, ctx.language, ctx.now), build, ctx)
        }
        SaveRequest::CopyView { build } => {
            let id = next_local_id(ctx.file, ctx.queued).ok_or(BuildsError::NoLocalId)?;
            created(model::copy_from_view(&build, id, ctx.account, ctx.language, ctx.now), build, ctx)
        }
        SaveRequest::Copy { source, build } => {
            let (_, source) = decode_base(&source)?;
            let id = next_local_id(ctx.file, ctx.queued).ok_or(BuildsError::NoLocalId)?;
            created(model::copy_as_new(&source, id, ctx.account, ctx.now), build, ctx)
        }
    }
}

/// The new build's identity comes from `fresh`, never from the draft, which may still carry the
/// fields of the build it was made from.
fn created(fresh: HeroBuildResult, mut build: BuildView, ctx: &Ctx) -> Result<Planned, AppError> {
    let base = model::view(&fresh);
    build.hero_build_id = base.hero_build_id;
    build.author_account_id = base.author_account_id;
    build.version = base.version;
    build.origin_build_id = base.origin_build_id;
    build.publish_timestamp = base.publish_timestamp;
    build.last_updated_timestamp = base.last_updated_timestamp;
    build.favorited = false;
    upsert(Section::Unpublished, None, &fresh, &base, build, ctx)
}

fn upsert(
    section: Section,
    guard: Option<Vec<u8>>,
    base: &HeroBuildResult,
    base_view: &BuildView,
    build: BuildView,
    ctx: &Ctx,
) -> Result<Planned, AppError> {
    let hero_class = ctx
        .heroes
        .class_name(build.hero_id)
        .ok_or_else(|| AppError::new(BuildsError::UnknownHero).param("hero", build.hero_id))?
        .to_string();
    check_ability_order(&build.ability_order, &base_view.ability_order, ctx.heroes.abilities(build.hero_id))?;
    let id = build.hero_build_id;
    let blob = model::apply(base, &build).encode();
    let mut ops = Vec::new();
    if section == Section::SavedLastUsed {
        // The game keeps one `SavedLastUsed` entry per hero.
        for (other, old) in ctx.entries(Section::SavedLastUsed) {
            if other != id && hero_of(&old) == Some(build.hero_id) {
                ops.push(SaveOp::Delete { section, id: other, base: Some(old) });
            }
        }
    }
    ops.push(SaveOp::Upsert { section, blob, base: guard, hero_class: Some(hero_class) });
    Ok(Planned { label: build.name, build_id: id, ops })
}

fn hero_of(blob: &[u8]) -> Option<u32> {
    HeroBuildResult::decode(blob).ok()?.hero_build?.hero_id
}

fn name_of(blob: &[u8]) -> String {
    HeroBuildResult::decode(blob).ok().and_then(|r| r.hero_build?.name).unwrap_or_default()
}

pub fn plan_delete(section: Section, id: u32, base: &str) -> Result<Planned, AppError> {
    if id >= LOCAL_ID_LIMIT {
        return Err(BuildsError::PublishedDeleteInGame.into());
    }
    let (blob, _) = decode_base(base)?;
    if peek_build_id(&blob) != Some(id) {
        return Err(BuildsError::BadBase.into());
    }
    Ok(Planned { label: name_of(&blob), build_id: id, ops: vec![SaveOp::Delete { section, id, base: Some(blob) }] })
}

pub fn plan_favourite(
    file: &BuildsFile,
    base: Option<&str>,
    id: Option<u32>,
    published: Option<&BuildView>,
) -> Result<Planned, AppError> {
    let source = match (base, published, id) {
        (Some(hex), _, _) => decode_base(hex)?.1,
        (None, Some(view), _) => published_from_view(view)?,
        (None, None, Some(id)) => {
            let blob = [Section::Unpublished, Section::SavedLastUsed, Section::Favorites]
                .into_iter()
                .find_map(|s| file.get(s, id))
                .ok_or(BuildsError::BuildNotFound)?;
            HeroBuildResult::decode(blob).map_err(|e| AppError::new(BuildsError::BadFile).detail(e))?
        }
        (None, None, None) => return Err(BuildsError::BuildNotFound.into()),
    };
    let mut view = model::view(&source);
    view.favorited = true;
    let blob = model::apply(&source, &view).encode();
    Ok(Planned { label: view.name, build_id: view.hero_build_id, ops: vec![SaveOp::Favourite { blob }] })
}

/// A published build that exists only on deadlock-api, as the blob the GC would have sent: its id,
/// version, origin, publish time and tags as published. The header fields are written even at their
/// defaults, as the game writes them; a blob's unknown bytes cannot be recovered from a view.
fn published_from_view(view: &BuildView) -> Result<HeroBuildResult, AppError> {
    if view.hero_build_id < LOCAL_ID_LIMIT {
        return Err(BuildsError::BadBase.into());
    }
    let mut out = model::apply(&HeroBuildResult::default(), view);
    let h = out.hero_build.get_or_insert_with(Default::default);
    h.hero_build_id = Some(view.hero_build_id);
    h.hero_id = Some(view.hero_id);
    h.author_account_id = Some(view.author_account_id);
    h.name = Some(view.name.clone());
    h.description = Some(view.description.clone());
    h.language = Some(view.language);
    h.version = Some(view.version);
    Ok(out)
}

pub fn plan_unfavourite(file: &BuildsFile, id: u32) -> Planned {
    let label = file.get(Section::Favorites, id).map(name_of).unwrap_or_default();
    Planned { label, build_id: id, ops: vec![SaveOp::Unfavourite { id }] }
}

/// The file's next id, above any id a queued save already took.
pub fn next_local_id(file: &BuildsFile, queued: &[QueuedSave]) -> Option<u32> {
    let from_file = file.next_local_id()?;
    let taken = queued
        .iter()
        .flat_map(|s| &s.ops)
        .filter_map(|op| match op {
            SaveOp::Upsert { blob, .. } | SaveOp::Favourite { blob } => peek_build_id(blob),
            _ => None,
        })
        .filter(|&id| id < LOCAL_ID_LIMIT)
        .max();
    match taken {
        Some(id) => Some(from_file.max(id + 1)).filter(|&id| id < LOCAL_ID_LIMIT),
        None => Some(from_file),
    }
}

/// An order the edit left as the game wrote it saves as it is, quirks and all; any change must be valid.
pub fn check_ability_order(
    edited: &[CurrencyChangeView],
    base: &[CurrencyChangeView],
    abilities: Option<[u32; 4]>,
) -> Result<(), AppError> {
    if edited == base || edited.is_empty() {
        return Ok(());
    }
    let ids = abilities.ok_or(BuildsError::AbilitiesUnknown)?;
    model::validate_ability_order(edited, &ids)?;
    Ok(())
}

/// Empty while the hero's abilities are unknown: without them every step would read as unknown.
pub fn warning_codes(steps: &[CurrencyChangeView], abilities: Option<[u32; 4]>) -> Vec<String> {
    let Some(ids) = abilities else { return Vec::new() };
    let Ok(warnings) = model::ability_order_warnings(steps, &ids) else { return vec!["invalid".into()] };
    let mut codes: Vec<String> = Vec::new();
    for warning in warnings {
        let code = match warning {
            AbilityOrderWarning::UnknownAbility { .. } => "unknown_ability",
            AbilityOrderWarning::FreeUnlock { .. } => "free_unlock",
            AbilityOrderWarning::UltimateEarly { .. } => "ultimate_early",
            AbilityOrderWarning::Leftover { .. } => "leftover",
        };
        if !codes.iter().any(|c| c == code) {
            codes.push(code.into());
        }
    }
    codes
}

pub fn conflict_view(save_id: Option<String>, conflict: &Conflict) -> ConflictView {
    let as_view = |blob: &Option<Vec<u8>>| {
        let decoded = HeroBuildResult::decode(blob.as_deref()?);
        decoded.inspect_err(|e| log::warn!("conflicting build {} does not decode: {e}", conflict.id)).ok()
    };
    ConflictView {
        save_id,
        id: conflict.id,
        section: conflict.section.into(),
        ours: as_view(&conflict.ours).map(|r| model::view(&r)),
        game: as_view(&conflict.current).map(|r| model::view(&r)),
        base: as_view(&conflict.base).map(|r| model::view(&r)),
        game_blob: conflict.current.as_deref().map(encode_hex),
    }
}

pub fn save_result(build_id: u32, outcome: SaveOutcome) -> SaveResult {
    match outcome {
        SaveOutcome::Written { backup } => {
            SaveResult::Written { build_id, backup: backup.map(|p| p.to_string_lossy().into_owned()) }
        }
        SaveOutcome::Unchanged => SaveResult::Unchanged { build_id },
        SaveOutcome::Conflict(conflicts) => {
            SaveResult::Conflict { conflicts: conflicts.iter().map(|c| conflict_view(None, c)).collect() }
        }
    }
}

pub fn flush_view(report: FlushReport) -> FlushView {
    match report {
        FlushReport::Nothing => FlushView::Saved { build_ids: Vec::new() },
        FlushReport::Saved { saves, .. } => FlushView::Saved { build_ids: saves.iter().map(|s| s.build_id).collect() },
        FlushReport::Conflict(conflicts) => FlushView::Conflict {
            conflicts: conflicts
                .iter()
                .map(|q| conflict_view(Some(q.save_id.clone()).filter(|id| !id.is_empty()), &q.conflict))
                .collect(),
        },
        FlushReport::GameRunning => FlushView::GameRunning,
        FlushReport::Failed(e) => {
            log::warn!("queued build saves not written: {e}");
            FlushView::Failed { code: save_error_key(&e).code() }
        }
    }
}

/// Also on the first probe with the game closed, for saves left queued when the app last quit.
pub fn should_flush(last: Option<bool>, running: bool) -> bool {
    !running && last != Some(false)
}

pub fn local_builds(
    bytes: Option<&[u8]>,
    heroes: &Heroes,
    queued: &[QueuedSave],
    account: u32,
    game_running: bool,
) -> Result<LocalBuilds, AppError> {
    let file = match bytes {
        Some(bytes) => BuildsFile::parse(bytes)?,
        None => BuildsFile::empty(),
    };
    let mut builds = Vec::new();
    for section in Section::ALL {
        for blob in file.entries(section) {
            let decoded = match HeroBuildResult::decode(blob) {
                Ok(decoded) => decoded,
                Err(e) => {
                    log::warn!("skipped a {} build that does not decode: {e}", section.key());
                    continue;
                }
            };
            let build = model::view(&decoded);
            let warnings = warning_codes(&build.ability_order, heroes.abilities(build.hero_id));
            builds.push(LocalBuild { section: section.into(), build, base: encode_hex(blob), warnings });
        }
    }
    let last_used = heroes
        .0
        .iter()
        .filter_map(|h| {
            Some(LastUsedBuild { hero_class: h.class_name.clone(), build_id: file.last_used(&h.class_name)? })
        })
        .collect();
    Ok(LocalBuilds {
        account_id: account,
        exists: bytes.is_some(),
        game_running,
        builds,
        last_used,
        queue: queued.iter().map(QueuedSaveView::from).collect(),
        next_local_id: next_local_id(&file, queued),
    })
}

/// The proto's `language` number for a game language name (`english`, `schinese`, ...).
pub fn proto_language(game_language: &str) -> u32 {
    match game_language {
        "german" => 1,
        "french" => 2,
        "italian" => 3,
        "koreana" => 4,
        "spanish" => 5,
        "schinese" => 6,
        "tchinese" => 7,
        "russian" => 8,
        "thai" => 9,
        "japanese" => 10,
        "portuguese" => 11,
        "polish" => 12,
        "danish" => 13,
        "dutch" => 14,
        "finnish" => 15,
        "norwegian" => 16,
        "swedish" => 17,
        "hungarian" => 18,
        "czech" => 19,
        "romanian" => 20,
        "turkish" => 21,
        "brazilian" => 22,
        "bulgarian" => 23,
        "greek" => 24,
        "ukrainian" => 25,
        "latam" => 26,
        "vietnamese" => 27,
        "indonesian" => 28,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proto_language_matches_steam_elanguage() {
        let expected = [
            ("english", 0),
            ("german", 1),
            ("french", 2),
            ("italian", 3),
            ("koreana", 4),
            ("spanish", 5),
            ("schinese", 6),
            ("tchinese", 7),
            ("russian", 8),
            ("thai", 9),
            ("japanese", 10),
            ("portuguese", 11),
            ("polish", 12),
            ("hungarian", 18),
            ("czech", 19),
            ("turkish", 21),
            ("brazilian", 22),
            ("ukrainian", 25),
            ("latam", 26),
            ("indonesian", 28),
        ];
        for (name, number) in expected {
            assert_eq!(proto_language(name), number, "{name}");
        }
    }

    #[test]
    fn proto_language_covers_every_game_language_locale() {
        for (locale, number) in [("zh-TW", 7), ("es-419", 26), ("pt-BR", 22), ("hu", 18), ("id", 28), ("xx", 0)] {
            assert_eq!(proto_language(dp_gamedata::game_language(locale)), number, "{locale}");
        }
    }

    #[test]
    fn proto_language_unknown_is_english() {
        assert_eq!(proto_language("klingon"), 0);
        assert_eq!(proto_language(""), 0);
    }

    use crate::features::builds::views::{BuildSection, FlushView};
    use dp_builds::backup::WriteError;
    use dp_builds::model::{self, CURRENCY_ABILITY_POINTS, CURRENCY_ABILITY_UNLOCKS};
    use dp_builds::queue::QueuedConflict;
    use dp_builds::save::SaveError;
    use dp_builds::wire::{AbilityOrder, CurrencyChange, HeroBuild, ModCategory, ModEntry};
    use std::path::PathBuf;

    const ACCOUNT: u32 = 77;
    const NOW: u32 = 5_000;

    fn heroes() -> Heroes {
        Heroes(vec![
            HeroInfo { id: 1, class_name: "hero_inferno".into(), abilities: Some([11, 12, 13, 14]) },
            HeroInfo { id: 2, class_name: "hero_gigawatt".into(), abilities: None },
        ])
    }

    fn build(id: u32, hero: u32, name: &str) -> HeroBuildResult {
        let mut r = model::new_local(id, ACCOUNT, hero, 0, 100);
        r.hero_build.as_mut().unwrap().name = Some(name.into());
        r
    }

    fn blob(id: u32, hero: u32, name: &str) -> Vec<u8> {
        build(id, hero, name).encode()
    }

    fn file_with(entries: &[(Section, Vec<u8>)]) -> BuildsFile {
        let mut file = BuildsFile::empty();
        for (section, blob) in entries {
            file.upsert_sorted(*section, blob.clone()).unwrap();
        }
        file
    }

    fn ctx<'a>(file: &'a BuildsFile, queued: &'a [QueuedSave], heroes: &'a Heroes) -> Ctx<'a> {
        Ctx { file, queued, chain_queued: false, heroes, account: ACCOUNT, now: NOW, language: 9 }
    }

    fn decoded(op: &SaveOp) -> BuildView {
        let SaveOp::Upsert { blob, .. } = op else { panic!("not an upsert: {op:?}") };
        model::view(&HeroBuildResult::decode(blob).unwrap())
    }

    fn unlock(ability: u32) -> CurrencyChangeView {
        CurrencyChangeView { ability_id: ability, currency_type: CURRENCY_ABILITY_UNLOCKS, delta: -1, annotation: None }
    }

    fn point(ability: u32, delta: i32) -> CurrencyChangeView {
        CurrencyChangeView { ability_id: ability, currency_type: CURRENCY_ABILITY_POINTS, delta, annotation: None }
    }

    fn queued(ops: Vec<SaveOp>) -> QueuedSave {
        QueuedSave { id: "1-0".into(), queued_at: 1, label: String::new(), build_id: 0, ops }
    }

    #[test]
    fn hex_round_trips_and_a_bad_base_is_refused() {
        assert_eq!(encode_hex(&[0, 0xab, 0x10]), "00ab10");
        assert_eq!(decode_hex("00ab10"), Some(vec![0, 0xab, 0x10]));
        assert_eq!(decode_hex("0"), None);
        assert_eq!(decode_base("zz").unwrap_err().code(), "builds.bad_base");
        assert_eq!(decode_base("ff").unwrap_err().code(), "builds.bad_base");
        assert_eq!(decode_base("").unwrap_err().code(), "builds.bad_base");
        let good = blob(3, 1, "a");
        assert_eq!(decode_base(&encode_hex(&good)).unwrap().0, good);
    }

    #[test]
    fn editing_a_local_build_upserts_it_where_it_is_against_its_base() {
        let base = blob(4, 1, "old");
        let file = file_with(&[(Section::Unpublished, base.clone())]);
        let heroes = heroes();
        let mut edit = model::view(&build(4, 1, "old"));
        edit.name = "new".into();
        edit.hero_build_id = 999;
        let req = SaveRequest::Edit { section: BuildSection::Unpublished, base: encode_hex(&base), build: edit };
        let planned = plan_save(req, &ctx(&file, &[], &heroes)).unwrap();
        assert_eq!(planned.build_id, 4);
        assert_eq!(planned.label, "new");
        let [op] = planned.ops.as_slice() else { panic!("{:?}", planned.ops) };
        let SaveOp::Upsert { section, base: guard, hero_class, .. } = op else { panic!() };
        assert_eq!(*section, Section::Unpublished);
        assert_eq!(guard.as_deref(), Some(base.as_slice()));
        assert_eq!(hero_class.as_deref(), Some("hero_inferno"));
        let written = decoded(op);
        assert_eq!((written.hero_build_id, written.name.as_str()), (4, "new"));
        assert_eq!(written.last_updated_timestamp, Some(NOW));
    }

    #[test]
    fn editing_a_published_build_in_saved_last_used_stays_there() {
        let base = blob(5000, 1, "pub");
        let file = file_with(&[(Section::SavedLastUsed, base.clone())]);
        let heroes = heroes();
        let edit = model::view(&build(5000, 1, "pub2"));
        let req = SaveRequest::Edit { section: BuildSection::SavedLastUsed, base: encode_hex(&base), build: edit };
        let planned = plan_save(req, &ctx(&file, &[], &heroes)).unwrap();
        let [SaveOp::Upsert { section: Section::SavedLastUsed, base: Some(guard), .. }] = planned.ops.as_slice() else {
            panic!("{:?}", planned.ops)
        };
        assert_eq!(*guard, base);
    }

    #[test]
    fn editing_a_favourited_published_build_writes_saved_last_used_and_drops_the_heros_other_entry() {
        let fav = blob(5000, 1, "fav");
        let other = blob(6000, 1, "other");
        let other_hero = blob(7000, 2, "giga");
        let file = file_with(&[
            (Section::Favorites, fav.clone()),
            (Section::SavedLastUsed, other.clone()),
            (Section::SavedLastUsed, other_hero),
        ]);
        let heroes = heroes();
        let edit = model::view(&build(5000, 1, "fav edited"));
        let req = SaveRequest::Edit { section: BuildSection::Favorites, base: encode_hex(&fav), build: edit };
        let planned = plan_save(req, &ctx(&file, &[], &heroes)).unwrap();
        assert_eq!(planned.ops.len(), 2, "{:?}", planned.ops);
        assert_eq!(planned.ops[0], SaveOp::Delete { section: Section::SavedLastUsed, id: 6000, base: Some(other) });
        let SaveOp::Upsert { section, base, .. } = &planned.ops[1] else { panic!() };
        assert_eq!((*section, base), (Section::SavedLastUsed, &None));
        assert_eq!(decoded(&planned.ops[1]).name, "fav edited");
    }

    #[test]
    fn a_queued_published_edit_takes_its_base_from_the_queue() {
        let fav = blob(5000, 1, "fav");
        let first = blob(5000, 1, "first edit");
        let file = file_with(&[(Section::Favorites, fav.clone())]);
        let queue = [queued(vec![SaveOp::Upsert {
            section: Section::SavedLastUsed,
            blob: first.clone(),
            base: None,
            hero_class: None,
        }])];
        let heroes = heroes();
        let req = SaveRequest::Edit {
            section: BuildSection::Favorites,
            base: encode_hex(&fav),
            build: model::view(&build(5000, 1, "second")),
        };
        let mut c = ctx(&file, &queue, &heroes);
        c.chain_queued = true;
        let planned = plan_save(req.clone(), &c).unwrap();
        let [SaveOp::Upsert { base, .. }] = planned.ops.as_slice() else { panic!("{:?}", planned.ops) };
        assert_eq!(base.as_deref(), Some(first.as_slice()));
        c.chain_queued = false;
        let planned = plan_save(req, &c).unwrap();
        let [SaveOp::Upsert { base: None, .. }] = planned.ops.as_slice() else { panic!("{:?}", planned.ops) };
    }

    #[test]
    fn a_new_build_takes_the_next_local_id_and_keeps_its_language() {
        let file = file_with(&[(Section::Unpublished, blob(4, 1, "a")), (Section::Favorites, blob(9, 1, "b"))]);
        let heroes = heroes();
        let mut view = model::view(&build(0, 1, "fresh"));
        view.author_account_id = 1;
        view.origin_build_id = Some(123);
        view.version = 7;
        view.language = 0;
        let planned = plan_save(SaveRequest::New { build: view }, &ctx(&file, &[], &heroes)).unwrap();
        assert_eq!(planned.build_id, 10);
        let [op @ SaveOp::Upsert { section: Section::Unpublished, base: None, .. }] = planned.ops.as_slice() else {
            panic!("{:?}", planned.ops)
        };
        let written = decoded(op);
        assert_eq!(written.hero_build_id, 10);
        assert_eq!(written.author_account_id, ACCOUNT);
        assert_eq!((written.version, written.origin_build_id), (0, None));
        assert_eq!(written.language, 0, "English chosen in another app locale stays English");
        assert_eq!(written.name, "fresh");
        assert_eq!(written.last_updated_timestamp, Some(NOW));
    }

    #[test]
    fn a_copy_points_at_its_published_source() {
        let file = BuildsFile::empty();
        let heroes = heroes();
        let source = blob(5000, 1, "public");
        let view = model::view(&build(5000, 1, "my copy"));
        let req = SaveRequest::Copy { source: encode_hex(&source), build: view };
        let planned = plan_save(req, &ctx(&file, &[], &heroes)).unwrap();
        assert_eq!(planned.build_id, 1);
        let written = decoded(&planned.ops[0]);
        assert_eq!((written.hero_build_id, written.origin_build_id), (1, Some(5000)));
        assert_eq!(written.name, "my copy");
        assert!(!written.favorited);
    }

    #[test]
    fn a_view_copy_points_at_its_public_source() {
        let file = BuildsFile::empty();
        let heroes = heroes();
        let mut view = model::view(&build(5000, 1, "public"));
        view.publish_timestamp = Some(1_700_000_000);
        view.tags = vec![4];
        let planned = plan_save(SaveRequest::CopyView { build: view }, &ctx(&file, &[], &heroes)).unwrap();
        assert_eq!(planned.build_id, 1);
        let written = decoded(&planned.ops[0]);
        assert_eq!((written.hero_build_id, written.origin_build_id), (1, Some(5000)));
        assert_eq!((written.author_account_id, written.version), (ACCOUNT, 0));
        assert_eq!((written.publish_timestamp, written.tags), (Some(1_700_000_000), vec![4]));
        assert!(!written.favorited);
    }

    #[test]
    fn a_full_local_id_space_is_refused() {
        let file = file_with(&[(Section::Unpublished, blob(999, 1, "last"))]);
        let heroes = heroes();
        let req = SaveRequest::New { build: model::view(&build(0, 1, "x")) };
        assert_eq!(plan_save(req, &ctx(&file, &[], &heroes)).unwrap_err().code(), "builds.no_local_id");
    }

    #[test]
    fn next_local_id_skips_ids_the_queue_already_took() {
        let file = file_with(&[(Section::Unpublished, blob(4, 1, "a"))]);
        let queue = [queued(vec![
            SaveOp::Upsert { section: Section::Unpublished, blob: blob(5, 1, "q"), base: None, hero_class: None },
            SaveOp::Favourite { blob: blob(5001, 1, "pub") },
        ])];
        assert_eq!(next_local_id(&file, &queue), Some(6));
        assert_eq!(next_local_id(&file, &[]), Some(5));
    }

    #[test]
    fn a_hero_the_catalog_does_not_know_is_refused() {
        let file = BuildsFile::empty();
        let heroes = heroes();
        let req = SaveRequest::New { build: model::view(&build(0, 42, "x")) };
        assert_eq!(plan_save(req, &ctx(&file, &[], &heroes)).unwrap_err().code(), "builds.unknown_hero");
    }

    #[test]
    fn a_changed_ability_order_is_checked_strictly() {
        let ok = [unlock(11), point(11, -1)];
        let bad = [point(11, -1)];
        let ids = Some([11, 12, 13, 14]);
        assert!(check_ability_order(&ok, &[], ids).is_ok());
        assert_eq!(check_ability_order(&bad, &[], ids).unwrap_err().code(), "builds.invalid_ability_order");
        assert_eq!(check_ability_order(&ok, &[], None).unwrap_err().code(), "builds.abilities_unknown");
        // The game's own leftovers load as they are while the edit leaves them alone.
        assert!(check_ability_order(&bad, &bad, None).is_ok());
        assert!(check_ability_order(&[], &bad, None).is_ok());
    }

    #[test]
    fn a_save_with_an_invalid_new_order_is_refused() {
        let file = BuildsFile::empty();
        let heroes = heroes();
        let mut view = model::view(&build(0, 1, "x"));
        view.ability_order = vec![unlock(14)];
        let req = SaveRequest::New { build: view };
        assert_eq!(plan_save(req, &ctx(&file, &[], &heroes)).unwrap_err().code(), "builds.invalid_ability_order");
    }

    #[test]
    fn only_local_builds_can_be_deleted_here() {
        let base = blob(5000, 1, "pub");
        let err = plan_delete(Section::SavedLastUsed, 5000, &encode_hex(&base)).unwrap_err();
        assert_eq!(err.code(), "builds.published_delete_in_game");
        let base = blob(4, 1, "mine");
        let planned = plan_delete(Section::Unpublished, 4, &encode_hex(&base)).unwrap();
        assert_eq!(planned.ops, vec![SaveOp::Delete { section: Section::Unpublished, id: 4, base: Some(base) }]);
        assert_eq!(planned.label, "mine");
        assert_eq!(
            plan_delete(Section::Unpublished, 5, &encode_hex(&blob(4, 1, "x"))).unwrap_err().code(),
            "builds.bad_base"
        );
    }

    #[test]
    fn favouriting_by_id_copies_the_local_build_into_favorites() {
        let file = file_with(&[(Section::Unpublished, blob(4, 1, "mine"))]);
        let planned = plan_favourite(&file, None, Some(4), None).unwrap();
        let [SaveOp::Favourite { blob: fav }] = planned.ops.as_slice() else { panic!("{:?}", planned.ops) };
        let v = model::view(&HeroBuildResult::decode(fav).unwrap());
        assert!(v.favorited);
        assert_eq!((v.hero_build_id, planned.build_id), (4, 4));
        assert_eq!(plan_favourite(&file, None, Some(8), None).unwrap_err().code(), "builds.build_not_found");
        let from_blob = plan_favourite(&file, Some(&encode_hex(&blob(5000, 1, "pub"))), None, None).unwrap();
        assert_eq!(from_blob.build_id, 5000);
    }

    // A published build in the shape a view carries in full: no unknown bytes, and no field the view
    // reads the same whether it is absent or at its default.
    fn published(id: u32, language: u32) -> HeroBuildResult {
        let mut r = build(id, 1, "public");
        r.preference = None;
        let h = r.hero_build.as_mut().unwrap();
        h.author_account_id = Some(1_694_025_232);
        h.version = Some(77);
        h.language = Some(language);
        h.description = Some("desc".into());
        h.origin_build_id = Some(395_336);
        h.publish_timestamp = Some(1_700_000_000);
        h.tags = vec![3, 9];
        let d = h.details.as_mut().unwrap();
        d.mod_categories[0].mods = vec![ModEntry {
            ability_id: Some(21),
            annotation: Some("first".into()),
            sell_priority: Some(2),
            ..Default::default()
        }];
        d.mod_categories.push(ModCategory {
            mods: vec![ModEntry { ability_id: Some(22), ..Default::default() }],
            name: Some("Late".into()),
            description: Some(String::new()),
            width: Some(100.0),
            height: Some(162.75),
            optional: Some(true),
            unknown: Vec::new(),
        });
        d.ability_order = Some(AbilityOrder {
            currency_changes: vec![CurrencyChange {
                ability_id: Some(11),
                currency_type: Some(CURRENCY_ABILITY_UNLOCKS),
                delta: Some(-1),
                annotation: None,
                unknown: Vec::new(),
            }],
            unknown: Vec::new(),
        });
        r
    }

    #[test]
    fn favouriting_a_view_writes_what_favouriting_its_blob_writes() {
        let file = BuildsFile::empty();
        for language in [5, 0] {
            let source = published(5000, language);
            let from_blob = plan_favourite(&file, Some(&encode_hex(&source.encode())), None, None).unwrap();
            let from_view = plan_favourite(&file, None, None, Some(&model::view(&source))).unwrap();
            assert_eq!(from_view, from_blob, "language {language}");
            let [SaveOp::Favourite { blob }] = from_view.ops.as_slice() else { panic!("{:?}", from_view.ops) };
            let written = HeroBuildResult::decode(blob).unwrap();
            assert_eq!(written.preference.and_then(|p| p.favorited), Some(true));
            let h = written.hero_build.unwrap();
            assert_eq!((h.hero_build_id, h.version, h.language), (Some(5000), Some(77), Some(language)));
            assert_eq!(
                (h.origin_build_id, h.publish_timestamp, h.tags),
                (Some(395_336), Some(1_700_000_000), vec![3, 9])
            );
        }
    }
    // Written by our own research tool from deadlock-api JSON, never by the game.
    const TOOL_WRITTEN_FAVOURITE: u32 = 113_244;

    /// Game builds of different ages write an empty category description, a false `optional` and an
    /// empty ability order either explicitly or not at all; a view reads both the same, so it writes
    /// the new-build shape. Returns how many of each were folded.
    fn fold_presence(r: &mut HeroBuildResult) -> (usize, usize, usize) {
        let Some(d) = r.hero_build.as_mut().and_then(|h| h.details.as_mut()) else { return (0, 0, 0) };
        let empty_order = d.ability_order.as_ref().is_some_and(|a| *a == AbilityOrder::default());
        if empty_order {
            d.ability_order = None;
        }
        let (mut description, mut optional) = (0, 0);
        for c in &mut d.mod_categories {
            if c.description.is_none() {
                c.description = Some(String::new());
                description += 1;
            }
            if c.optional == Some(false) {
                c.optional = None;
                optional += 1;
            }
        }
        (description, optional, usize::from(empty_order))
    }

    fn header_of(r: &HeroBuildResult) -> String {
        let h = r.hero_build.clone().map(|h| HeroBuild { details: None, ..h });
        format!("{h:?} {:?} {:?}", r.preference, r.unknown)
    }

    /// Runs only when `DP_BUILDS_SAMPLES` names a directory of real `cached_hero_builds.kv3` copies.
    #[test]
    fn sample_published_favourites_rebuild_from_their_view_byte_for_byte() {
        let Some(dir) = std::env::var_os("DP_BUILDS_SAMPLES") else { return };
        let mut seen = std::collections::HashSet::new();
        let (mut exact, mut folded_builds) = (0, 0);
        let (mut folded_description, mut folded_optional, mut folded_order) = (0, 0, 0);
        let mut failures = Vec::new();
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_none_or(|e| e != "kv3") {
                continue;
            }
            let file = BuildsFile::parse(&std::fs::read(&path).unwrap()).unwrap();
            for blob in file.entries(Section::Favorites) {
                let Some(id) = peek_build_id(blob).filter(|&id| id >= LOCAL_ID_LIMIT) else { continue };
                if id == TOOL_WRITTEN_FAVOURITE || !seen.insert(blob.to_vec()) {
                    continue;
                }
                let mut game = HeroBuildResult::decode(blob).unwrap();
                // The game resets both on launch.
                game.num_favorites = Some(0);
                game.rollup_category = Some(0);
                let planned = plan_favourite(&file, None, None, Some(&model::view(&game))).unwrap();
                let [SaveOp::Favourite { blob: ours }] = planned.ops.as_slice() else { panic!("{:?}", planned.ops) };
                let ours = HeroBuildResult::decode(ours).unwrap();
                if header_of(&ours) != header_of(&game) {
                    failures.push(format!(
                        "{} {id} header: ours {} game {}",
                        path.display(),
                        header_of(&ours),
                        header_of(&game)
                    ));
                    continue;
                }
                match fold_presence(&mut game) {
                    (0, 0, 0) => exact += 1,
                    (description, optional, order) => {
                        folded_builds += 1;
                        folded_description += description;
                        folded_optional += optional;
                        folded_order += order;
                    }
                }
                if ours.encode() != game.encode() {
                    failures.push(format!("{} {id}: ours {ours:?} game {game:?}", path.display()));
                }
            }
        }
        eprintln!(
            "checked {} distinct published favourites: {exact} byte-equal, {folded_builds} equal once {folded_description} \
             absent descriptions, {folded_optional} explicit optional=false and {folded_order} empty ability orders are folded",
            seen.len()
        );
        assert!(!seen.is_empty());
        assert!(failures.is_empty(), "{} differ:\n{}", failures.len(), failures.join("\n"));
    }

    #[test]
    fn only_a_published_view_can_be_favourited() {
        let local = model::view(&build(4, 1, "mine"));
        let err = plan_favourite(&BuildsFile::empty(), None, None, Some(&local)).unwrap_err();
        assert_eq!(err.code(), "builds.bad_base");
    }

    #[test]
    fn unfavourite_removes_by_id() {
        let file = file_with(&[(Section::Favorites, blob(5000, 1, "pub"))]);
        let planned = plan_unfavourite(&file, 5000);
        assert_eq!(planned.ops, vec![SaveOp::Unfavourite { id: 5000 }]);
        assert_eq!(planned.label, "pub");
    }

    #[test]
    fn warnings_are_codes_and_need_the_heros_abilities() {
        let tail = [unlock(11), unlock(12), unlock(13), unlock(14), unlock(11)];
        assert_eq!(warning_codes(&tail, Some([11, 12, 13, 14])), vec!["leftover".to_string()]);
        let free = [CurrencyChangeView { delta: 0, ..unlock(11) }, CurrencyChangeView { delta: 0, ..unlock(12) }];
        assert_eq!(warning_codes(&free, Some([11, 12, 13, 14])), vec!["free_unlock".to_string()]);
        assert_eq!(warning_codes(&[point(11, -1)], Some([11, 12, 13, 14])), vec!["invalid".to_string()]);
        assert!(warning_codes(&tail, None).is_empty());
    }

    #[test]
    fn a_conflict_shows_every_side_as_a_build() {
        let c = Conflict {
            section: Section::Unpublished,
            id: 4,
            base: Some(blob(4, 1, "base")),
            current: Some(blob(4, 1, "game")),
            ours: Some(blob(4, 1, "ours")),
        };
        let v = conflict_view(Some("s".into()), &c);
        assert_eq!(v.section, BuildSection::Unpublished);
        assert_eq!(v.ours.unwrap().name, "ours");
        assert_eq!(v.game.unwrap().name, "game");
        assert_eq!(v.base.unwrap().name, "base");
        assert_eq!(v.game_blob, Some(encode_hex(&blob(4, 1, "game"))));
    }

    #[test]
    fn save_outcomes_become_results() {
        let written = save_result(4, SaveOutcome::Written { backup: Some(PathBuf::from("b.kv3")) });
        assert_eq!(written, SaveResult::Written { build_id: 4, backup: Some("b.kv3".into()) });
        assert_eq!(save_result(4, SaveOutcome::Unchanged), SaveResult::Unchanged { build_id: 4 });
        let c = Conflict { section: Section::Favorites, id: 4, base: None, current: None, ours: None };
        let SaveResult::Conflict { conflicts } = save_result(4, SaveOutcome::Conflict(vec![c])) else { panic!() };
        assert_eq!((conflicts[0].id, conflicts[0].save_id.clone()), (4, None));
    }

    #[test]
    fn flush_reports_become_views() {
        let saved = FlushReport::Saved {
            backup: None,
            saves: vec![
                QueuedSave { build_id: 4, ..queued(Vec::new()) },
                QueuedSave { build_id: 9, ..queued(Vec::new()) },
            ],
        };
        assert_eq!(flush_view(saved), FlushView::Saved { build_ids: vec![4, 9] });
        assert_eq!(flush_view(FlushReport::Nothing), FlushView::Saved { build_ids: Vec::new() });
        assert_eq!(flush_view(FlushReport::GameRunning), FlushView::GameRunning);
        let failed = FlushReport::Failed(SaveError::Write(WriteError::NoBackupName));
        assert_eq!(flush_view(failed), FlushView::Failed { code: "builds.no_backup_name".into() });
        let c = Conflict { section: Section::Unpublished, id: 4, base: None, current: None, ours: None };
        let report = FlushReport::Conflict(vec![QueuedConflict { save_id: "9-0".into(), conflict: c }]);
        let FlushView::Conflict { conflicts } = flush_view(report) else { panic!() };
        assert_eq!(conflicts[0].save_id.as_deref(), Some("9-0"));
    }

    #[test]
    fn the_queue_flushes_when_the_game_closes_or_is_closed_at_start() {
        assert!(should_flush(Some(true), false));
        assert!(should_flush(None, false));
        assert!(!should_flush(Some(false), false));
        assert!(!should_flush(None, true));
        assert!(!should_flush(Some(false), true));
    }

    #[test]
    fn a_missing_file_lists_nothing() {
        let local = local_builds(None, &heroes(), &[], ACCOUNT, true).unwrap();
        assert!(!local.exists && local.game_running);
        assert!(local.builds.is_empty() && local.last_used.is_empty() && local.queue.is_empty());
        assert_eq!(local.next_local_id, Some(1));
    }

    #[test]
    fn local_builds_list_every_section_with_its_exact_blob() {
        let mine = blob(4, 1, "mine");
        let mut file = file_with(&[(Section::Unpublished, mine.clone()), (Section::Favorites, blob(5000, 2, "fav"))]);
        file.set_last_used("hero_inferno", 4);
        let bytes = file.to_bytes().unwrap();
        let queue = [QueuedSave { build_id: 4, ..queued(Vec::new()) }];
        let local = local_builds(Some(&bytes), &heroes(), &queue, ACCOUNT, false).unwrap();
        assert!(local.exists);
        assert_eq!(local.builds.len(), 2);
        assert_eq!(local.builds[0].section, BuildSection::Favorites);
        let own = &local.builds[1];
        assert_eq!((own.section, own.build.name.as_str()), (BuildSection::Unpublished, "mine"));
        assert_eq!(own.base, encode_hex(&mine));
        assert_eq!(local.last_used.len(), 1);
        assert_eq!((local.last_used[0].hero_class.as_str(), local.last_used[0].build_id), ("hero_inferno", 4));
        assert_eq!(local.queue[0].build_id, 4);
        assert_eq!(local.next_local_id, Some(5));
        assert_eq!(local_builds(Some(b"junk"), &heroes(), &[], ACCOUNT, false).unwrap_err().code(), "builds.bad_file");
    }
}
