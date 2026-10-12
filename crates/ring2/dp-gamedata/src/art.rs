use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use deadlock_data::art::{Art, ArtArchive, HeroArtKind, ItemArtKind, MinimapArtKind, RankArtKind};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::catalog::{archive_stamp, HeroEntry, Install, SteamInstall};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeroImage {
    Sm,
    Card,
    Mm,
}

impl HeroImage {
    const ALL: [HeroImage; 3] = [HeroImage::Sm, HeroImage::Card, HeroImage::Mm];

    fn suffix(self) -> &'static str {
        match self {
            HeroImage::Sm => "sm",
            HeroImage::Card => "card",
            HeroImage::Mm => "mm",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RankImage {
    Lg,
    Chalk,
}

impl RankImage {
    const ALL: [RankImage; 2] = [RankImage::Lg, RankImage::Chalk];

    fn suffix(self) -> &'static str {
        match self {
            RankImage::Lg => "lg",
            RankImage::Chalk => "chalk",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum ItemImage {
    Icon,
    Shop,
}

impl ItemImage {
    fn suffix(self) -> &'static str {
        match self {
            ItemImage::Icon => "icon",
            ItemImage::Shop => "shop",
        }
    }
}

/// World-space radius of the playable map; the minimap image spans `2 * MINIMAP_RADIUS` units.
pub const MINIMAP_RADIUS: f32 = 10752.0;

/// A minimap marker icon. The set is closed on purpose: the frontend names icons by variant, so no
/// free-form stem reaches the file system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum MinimapIcon {
    BossHealth,
    BossHealthFill,
    BossHealthT2,
    BossHealthFillT2,
    BossHealthFinal,
    BossHealthFinalFill,
    BossHealthFinalStage2,
    BossHealthFinalStage2Fill,
    BossHealthDead,
    SuperNeutralMarker,
    NeutralSmall,
    NeutralMedium,
    NeutralLarge,
    NeutralVault,
    MinimapShop,
    SoulJarMarker,
    SoulJarMarkerReturn,
    SoulJarMarkerReturnEnemy,
    SoulJarMarkerReturnPulse,
    PlayerMarkerSelf,
    PlayerMarkerSelfSpecHighlight,
    PlayerCone,
}

impl MinimapIcon {
    pub const ALL: [MinimapIcon; 22] = [
        MinimapIcon::BossHealth,
        MinimapIcon::BossHealthFill,
        MinimapIcon::BossHealthT2,
        MinimapIcon::BossHealthFillT2,
        MinimapIcon::BossHealthFinal,
        MinimapIcon::BossHealthFinalFill,
        MinimapIcon::BossHealthFinalStage2,
        MinimapIcon::BossHealthFinalStage2Fill,
        MinimapIcon::BossHealthDead,
        MinimapIcon::SuperNeutralMarker,
        MinimapIcon::NeutralSmall,
        MinimapIcon::NeutralMedium,
        MinimapIcon::NeutralLarge,
        MinimapIcon::NeutralVault,
        MinimapIcon::MinimapShop,
        MinimapIcon::SoulJarMarker,
        MinimapIcon::SoulJarMarkerReturn,
        MinimapIcon::SoulJarMarkerReturnEnemy,
        MinimapIcon::SoulJarMarkerReturnPulse,
        MinimapIcon::PlayerMarkerSelf,
        MinimapIcon::PlayerMarkerSelfSpecHighlight,
        MinimapIcon::PlayerCone,
    ];

    /// The game's file-name stem, without the `_psd` suffix.
    pub fn stem(self) -> &'static str {
        match self {
            MinimapIcon::BossHealth => "boss_health",
            MinimapIcon::BossHealthFill => "boss_health_fill",
            MinimapIcon::BossHealthT2 => "boss_health_t2",
            MinimapIcon::BossHealthFillT2 => "boss_health_fill_t2",
            MinimapIcon::BossHealthFinal => "boss_health_final",
            MinimapIcon::BossHealthFinalFill => "boss_health_final_fill",
            MinimapIcon::BossHealthFinalStage2 => "boss_health_final_stage2",
            MinimapIcon::BossHealthFinalStage2Fill => "boss_health_final_stage2_fill",
            MinimapIcon::BossHealthDead => "boss_health_dead",
            MinimapIcon::SuperNeutralMarker => "super_neutral_marker",
            MinimapIcon::NeutralSmall => "neutral_small",
            MinimapIcon::NeutralMedium => "neutral_medium",
            MinimapIcon::NeutralLarge => "neutral_large",
            MinimapIcon::NeutralVault => "neutral_vault",
            MinimapIcon::MinimapShop => "minimap_shop",
            MinimapIcon::SoulJarMarker => "soul_jar_marker",
            MinimapIcon::SoulJarMarkerReturn => "soul_jar_marker_return",
            MinimapIcon::SoulJarMarkerReturnEnemy => "soul_jar_marker_return_enemy",
            MinimapIcon::SoulJarMarkerReturnPulse => "soul_jar_marker_return_pulse",
            MinimapIcon::PlayerMarkerSelf => "player_marker_self",
            MinimapIcon::PlayerMarkerSelfSpecHighlight => "player_marker_self_spec_highlight",
            MinimapIcon::PlayerCone => "player_cone",
        }
    }
}

/// A local image for a minimap icon.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MinimapIconArt {
    pub icon: MinimapIcon,
    pub path: String,
}

/// Why the local minimap is unavailable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum MinimapError {
    /// No installed game to read from.
    NoInstall,
    /// The game is installed but the texture could not be opened or decoded.
    ExtractFailed,
}

/// Most class names one `ability_art` / `item_art` call decodes; the rest are ignored.
pub const MAX_CLASS_BATCH: usize = 200;

/// Where decoded images come from. Each `write_*` returns whether `dest` now holds a complete PNG;
/// a missing texture and an undecodable one are both `false`.
pub trait ArtSource: Send + Sync + 'static {
    fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> bool;
    fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> bool;
    fn write_ability(&self, class_name: &str, dest: &Path) -> bool;
    fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> bool;
    fn write_minimap(&self, dest: &Path) -> bool;
    fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> bool;
}

struct ArchiveSource(ArtArchive);

impl ArchiveSource {
    fn write(&self, art: &Art<'_>, dest: &Path, what: &str) -> bool {
        if !self.0.contains(art) {
            return false;
        }
        match self.0.write_png(art, dest) {
            Ok(()) => true,
            Err(e) => {
                log::debug!("no local art for {what}: {e}");
                false
            }
        }
    }
}

impl ArtSource for ArchiveSource {
    fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> bool {
        let kind = match image {
            HeroImage::Sm => HeroArtKind::Sm,
            HeroImage::Card => HeroArtKind::Card,
            HeroImage::Mm => HeroArtKind::Mm,
        };
        self.write(&Art::hero(class_name, kind), dest, &format!("{class_name} {}", image.suffix()))
    }

    fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> bool {
        let kind = match image {
            RankImage::Lg => RankArtKind::Large,
            RankImage::Chalk => RankArtKind::Chalk,
        };
        self.write(&Art::rank(tier, kind), dest, &format!("rank {tier} {}", image.suffix()))
    }

    fn write_ability(&self, class_name: &str, dest: &Path) -> bool {
        self.write(&Art::ability(class_name), dest, class_name)
    }

    fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> bool {
        let kind = match image {
            ItemImage::Icon => ItemArtKind::Icon,
            ItemImage::Shop => ItemArtKind::Shop,
        };
        self.write(&Art::item(class_name, kind), dest, &format!("{class_name} {}", image.suffix()))
    }

    fn write_minimap(&self, dest: &Path) -> bool {
        self.write(&Art::minimap(MinimapArtKind::Mid), dest, "minimap")
    }

    fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> bool {
        let Ok(kind) = MinimapArtKind::icon(icon.stem()) else { return false };
        self.write(&Art::minimap(kind), dest, icon.stem())
    }
}

type Opener = Box<dyn Fn(&Path) -> Option<Arc<dyn ArtSource>> + Send + Sync>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct HeroArt {
    pub id: u32,
    pub sm: Option<String>,
    pub card: Option<String>,
    /// The minimap head: a transparent cutout.
    pub mm: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct RankArt {
    pub tier: u8,
    pub lg: Option<String>,
    pub chalk: Option<String>,
}

/// A local image for an ability or item, by its class name in the game's ability table.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ClassArt {
    pub class_name: String,
    pub path: String,
}

struct Build {
    dir: Option<PathBuf>,
    fingerprint: Option<String>,
    source: Option<Option<Arc<dyn ArtSource>>>,
    failed: HashSet<String>,
}

struct Shared<I> {
    install: I,
    root: PathBuf,
    opener: Opener,
    state: Mutex<Option<Build>>,
}

/// PNG files decoded from the installed game, one directory per game build under `root`.
pub struct ArtCache<I: Install = SteamInstall> {
    shared: Arc<Shared<I>>,
}

impl<I: Install> Clone for ArtCache<I> {
    fn clone(&self) -> Self {
        Self { shared: Arc::clone(&self.shared) }
    }
}

impl ArtCache {
    pub fn new(root: PathBuf) -> Self {
        Self::with_opener(SteamInstall, root, Box::new(open_archive))
    }
}

fn open_archive(citadel_dir: &Path) -> Option<Arc<dyn ArtSource>> {
    match ArtArchive::open(citadel_dir) {
        Ok(archive) => Some(Arc::new(ArchiveSource(archive))),
        Err(e) => {
            log::debug!("game art unavailable: {e}");
            None
        }
    }
}

fn fingerprint(dir: &Path) -> Option<String> {
    let nanos = archive_stamp(dir)?.duration_since(UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{nanos:x}"))
}

fn file_safe(class_name: &str) -> bool {
    !class_name.is_empty() && class_name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

impl<I: Install> ArtCache<I> {
    pub fn with_opener(install: I, root: PathBuf, opener: Opener) -> Self {
        Self { shared: Arc::new(Shared { install, root, opener, state: Mutex::new(None) }) }
    }

    /// Local `sm`, `card` and `mm` files per hero, decoding what the cache lacks. Heroes with no local
    /// image are left out; this never fails.
    pub fn hero_art(&self, heroes: &[HeroEntry]) -> Vec<HeroArt> {
        self.with_build(|build, build_dir| {
            let mut out = Vec::new();
            for hero in heroes {
                if !file_safe(&hero.class_name) {
                    continue;
                }
                let mut entry = HeroArt { id: hero.id, sm: None, card: None, mm: None };
                for image in HeroImage::ALL {
                    let name = format!("{}_{}.png", hero.class_name, image.suffix());
                    let found = self.ensure(build, build_dir, name, |s, p| s.write_hero(&hero.class_name, image, p));
                    match image {
                        HeroImage::Sm => entry.sm = found,
                        HeroImage::Card => entry.card = found,
                        HeroImage::Mm => entry.mm = found,
                    }
                }
                if entry.sm.is_some() || entry.card.is_some() || entry.mm.is_some() {
                    out.push(entry);
                }
            }
            out
        })
        .unwrap_or_default()
    }

    /// Local `lg` and `chalk` badge files per rank tier, decoding what the cache lacks. Tiers with no
    /// local badge are left out; this never fails.
    pub fn rank_art(&self, tiers: &[u8]) -> Vec<RankArt> {
        self.with_build(|build, build_dir| {
            let mut out = Vec::new();
            for &tier in tiers {
                let mut entry = RankArt { tier, lg: None, chalk: None };
                for image in RankImage::ALL {
                    let name = format!("rank{tier:02}_{}.png", image.suffix());
                    let found = self.ensure(build, build_dir, name, |s, p| s.write_rank(tier, image, p));
                    match image {
                        RankImage::Lg => entry.lg = found,
                        RankImage::Chalk => entry.chalk = found,
                    }
                }
                if entry.lg.is_some() || entry.chalk.is_some() {
                    out.push(entry);
                }
            }
            out
        })
        .unwrap_or_default()
    }

    /// Local icons for the named abilities, decoding what the cache lacks. Abilities whose icon is
    /// missing, vector-only or undecodable are left out; this never fails.
    pub fn ability_art(&self, class_names: &[String]) -> Vec<ClassArt> {
        self.class_art(class_names, |class| format!("ability_{class}.png"), |s, class, p| s.write_ability(class, p))
    }

    /// Local icon or shop images for the named items, with the same rules as `ability_art`.
    pub fn item_art(&self, class_names: &[String], image: ItemImage) -> Vec<ClassArt> {
        self.class_art(
            class_names,
            |class| format!("item_{class}_{}.png", image.suffix()),
            |s, class, p| s.write_item(class, image, p),
        )
    }

    /// The local minimap image, decoding it when the cache lacks it. A failure is a value, never a panic.
    pub fn minimap_art(&self) -> Result<String, MinimapError> {
        self.with_build(|build, build_dir| {
            self.ensure(build, build_dir, "minimap_mid.png".to_string(), |s, p| s.write_minimap(p))
                .ok_or(MinimapError::ExtractFailed)
        })
        .unwrap_or(Err(MinimapError::NoInstall))
    }

    /// Local files for the requested minimap icons, decoding what the cache lacks. Icons the game does
    /// not have or that will not decode are left out; this never fails.
    pub fn minimap_icons(&self, icons: &[MinimapIcon]) -> Vec<MinimapIconArt> {
        self.with_build(|build, build_dir| {
            let mut seen = HashSet::new();
            let mut out = Vec::new();
            for &icon in icons.iter().take(MinimapIcon::ALL.len()) {
                if !seen.insert(icon) {
                    continue;
                }
                let name = format!("minimap_icon_{}.png", icon.stem());
                if let Some(path) = self.ensure(build, build_dir, name, |s, p| s.write_minimap_icon(icon, p)) {
                    out.push(MinimapIconArt { icon, path });
                }
            }
            out
        })
        .unwrap_or_default()
    }

    /// Where a minimap downloaded because the local one is unavailable is kept. It sits in the store
    /// root, so it is removed whenever a game build takes over the store.
    pub fn remote_minimap_path(&self) -> PathBuf {
        self.shared.root.join("minimap_remote.png")
    }

    fn class_art(
        &self,
        class_names: &[String],
        file_name: impl Fn(&str) -> String,
        write: impl Fn(&dyn ArtSource, &str, &Path) -> bool,
    ) -> Vec<ClassArt> {
        self.with_build(|build, build_dir| {
            let mut seen = HashSet::new();
            let mut out = Vec::new();
            for class in class_names.iter().take(MAX_CLASS_BATCH) {
                if !file_safe(class) || !seen.insert(class.as_str()) {
                    continue;
                }
                let found = self.ensure(build, build_dir, file_name(class), |s, p| write(s, class, p));
                if let Some(path) = found {
                    out.push(ClassArt { class_name: class.clone(), path });
                }
            }
            out
        })
        .unwrap_or_default()
    }

    /// Runs `f` on the current build and its directory, starting a fresh build when the game changed.
    /// `None` when there is no installed game to decode from.
    fn with_build<R>(&self, f: impl FnOnce(&mut Build, &Path) -> R) -> Option<R> {
        let mut guard = self.shared.state.lock().unwrap_or_else(|e| e.into_inner());
        let dir = self.shared.install.citadel_dir();
        let fingerprint = dir.as_deref().and_then(fingerprint);
        let stale = guard.as_ref().is_none_or(|b| b.dir != dir || b.fingerprint != fingerprint);
        if stale {
            self.evict_except(fingerprint.as_deref());
            *guard = Some(Build { dir, fingerprint, source: None, failed: HashSet::new() });
        }
        let build = guard.as_mut().expect("set above");
        let build_dir = build.fingerprint.as_ref().map(|f| self.shared.root.join(f))?;
        Some(f(build, &build_dir))
    }

    fn ensure(
        &self,
        build: &mut Build,
        build_dir: &Path,
        name: String,
        write: impl FnOnce(&dyn ArtSource, &Path) -> bool,
    ) -> Option<String> {
        let path = build_dir.join(&name);
        let ready = path.is_file() || {
            !build.failed.contains(&name) && {
                let citadel = build.dir.clone();
                let source =
                    build.source.get_or_insert_with(|| citadel.as_deref().and_then(|dir| (self.shared.opener)(dir)));
                let written = source.as_deref().is_some_and(|s| write(s, &path));
                if !written {
                    build.failed.insert(name);
                }
                written
            }
        };
        ready.then(|| path.to_string_lossy().into_owned())
    }

    fn evict_except(&self, keep: Option<&str>) {
        let Ok(entries) = std::fs::read_dir(&self.shared.root) else { return };
        for entry in entries.flatten() {
            if Some(entry.file_name().to_string_lossy().as_ref()) == keep {
                continue;
            }
            let path = entry.path();
            let removed = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
            if let Err(e) = removed {
                log::debug!("could not remove old art {}: {e}", path.display());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{HeroEntry, Install};
    use std::collections::HashSet;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::SystemTime;

    struct FakeInstall(Mutex<Option<PathBuf>>);

    impl Install for FakeInstall {
        fn citadel_dir(&self) -> Option<PathBuf> {
            self.0.lock().unwrap().clone()
        }
    }

    #[derive(Default)]
    struct FakeSource {
        writes: AtomicUsize,
        failing: HashSet<&'static str>,
        failing_tiers: HashSet<u8>,
    }

    impl ArtSource for FakeSource {
        fn write_hero(&self, class_name: &str, _image: HeroImage, dest: &Path) -> bool {
            self.writes.fetch_add(1, Ordering::Relaxed);
            if self.failing.contains(class_name) {
                return false;
            }
            fs::create_dir_all(dest.parent().unwrap()).unwrap();
            fs::write(dest, b"png").is_ok()
        }

        fn write_rank(&self, tier: u8, _image: RankImage, dest: &Path) -> bool {
            self.writes.fetch_add(1, Ordering::Relaxed);
            if self.failing_tiers.contains(&tier) {
                return false;
            }
            fs::create_dir_all(dest.parent().unwrap()).unwrap();
            fs::write(dest, b"png").is_ok()
        }

        fn write_ability(&self, class_name: &str, dest: &Path) -> bool {
            self.write_class(class_name, dest)
        }

        fn write_item(&self, class_name: &str, _image: ItemImage, dest: &Path) -> bool {
            self.write_class(class_name, dest)
        }

        fn write_minimap(&self, dest: &Path) -> bool {
            self.write_class("minimap", dest)
        }

        fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> bool {
            self.write_class(icon.stem(), dest)
        }
    }

    impl FakeSource {
        fn write_class(&self, class_name: &str, dest: &Path) -> bool {
            self.writes.fetch_add(1, Ordering::Relaxed);
            if self.failing.contains(class_name) {
                return false;
            }
            fs::create_dir_all(dest.parent().unwrap()).unwrap();
            fs::write(dest, b"png").is_ok()
        }
    }

    struct Rig {
        base: PathBuf,
        citadel: PathBuf,
        root: PathBuf,
        source: Arc<FakeSource>,
        opens: Arc<AtomicUsize>,
    }

    impl Rig {
        fn new(name: &str, failing: &[&'static str]) -> Self {
            let base = std::env::temp_dir().join(format!("dp-gamedata-art-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&base);
            let citadel = base.join("citadel");
            let root = base.join("cache");
            fs::create_dir_all(&citadel).unwrap();
            fs::write(citadel.join("pak01_dir.vpk"), b"x").unwrap();
            let source = Arc::new(FakeSource { failing: failing.iter().copied().collect(), ..Default::default() });
            Self { base, citadel, root, source, opens: Arc::new(AtomicUsize::new(0)) }
        }

        fn cache(&self) -> ArtCache<FakeInstall> {
            let source = Arc::clone(&self.source);
            let opens = Arc::clone(&self.opens);
            ArtCache::with_opener(
                FakeInstall(Mutex::new(Some(self.citadel.clone()))),
                self.root.clone(),
                Box::new(move |_| {
                    opens.fetch_add(1, Ordering::Relaxed);
                    Some(Arc::clone(&source) as Arc<dyn ArtSource>)
                }),
            )
        }

        fn touch_archive(&self, secs: u64) {
            let file = fs::OpenOptions::new().write(true).open(self.citadel.join("pak01_dir.vpk")).unwrap();
            file.set_modified(SystemTime::now() + std::time::Duration::from_secs(secs)).unwrap();
        }
    }

    impl Drop for Rig {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.base).ok();
        }
    }

    fn hero(id: u32, class: &str) -> HeroEntry {
        HeroEntry {
            id,
            class_name: class.to_string(),
            name: class.to_string(),
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
    fn decoded_art_is_returned_as_files_under_the_build_directory() {
        let rig = Rig::new("paths", &[]);
        let art = rig.cache().hero_art(&[hero(1, "hero_inferno")]);
        assert_eq!(art.len(), 1);
        assert_eq!(art[0].id, 1);
        let sm = PathBuf::from(art[0].sm.as_ref().unwrap());
        let card = PathBuf::from(art[0].card.as_ref().unwrap());
        assert!(sm.is_file() && card.is_file());
        assert!(sm.starts_with(&rig.root) && card.starts_with(&rig.root));
        assert_eq!(sm.file_name().unwrap(), "hero_inferno_sm.png");
        assert_eq!(card.file_name().unwrap(), "hero_inferno_card.png");
        assert_eq!(sm.parent(), card.parent());
        let mm = PathBuf::from(art[0].mm.as_ref().unwrap());
        assert_eq!(mm.file_name().unwrap(), "hero_inferno_mm.png");
        assert!(mm.is_file());
        assert_eq!(mm.parent(), sm.parent());
        assert_ne!(sm.parent().unwrap(), rig.root);
    }

    #[test]
    fn a_second_call_decodes_nothing_more() {
        let rig = Rig::new("idempotent", &[]);
        let cache = rig.cache();
        let heroes = [hero(1, "hero_inferno")];
        let first = cache.hero_art(&heroes);
        let writes = rig.source.writes.load(Ordering::Relaxed);
        assert_eq!(writes, 3);
        assert_eq!(cache.hero_art(&heroes), first);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), writes);
        assert_eq!(rig.opens.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn cached_files_serve_a_new_session_without_opening_the_archive() {
        let rig = Rig::new("warm", &[]);
        let heroes = [hero(1, "hero_inferno")];
        let first = rig.cache().hero_art(&heroes);
        let opens = rig.opens.load(Ordering::Relaxed);
        assert_eq!(rig.cache().hero_art(&heroes), first);
        assert_eq!(rig.opens.load(Ordering::Relaxed), opens);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 3);
    }

    #[test]
    fn a_failed_decode_means_no_local_art_for_that_hero_only() {
        let rig = Rig::new("failing", &["hero_vindicta"]);
        let cache = rig.cache();
        let heroes = [hero(1, "hero_inferno"), hero(2, "hero_vindicta")];
        let art = cache.hero_art(&heroes);
        assert_eq!(art.len(), 1);
        assert_eq!(art[0].id, 1);
        let writes = rig.source.writes.load(Ordering::Relaxed);
        assert_eq!(cache.hero_art(&heroes), art);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), writes, "failures are not retried within a build");
    }

    #[test]
    fn one_image_failing_keeps_the_other() {
        let rig = Rig::new("half", &[]);
        let source = Arc::new(FakeSource::default());
        let cache = ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(move |_| Some(Arc::new(CardOnly(Arc::clone(&source))) as Arc<dyn ArtSource>)),
        );
        let art = cache.hero_art(&[hero(1, "hero_inferno")]);
        assert_eq!(art.len(), 1);
        assert!(art[0].sm.is_none());
        assert!(art[0].card.is_some());
    }

    struct MmOnly(Arc<FakeSource>);

    impl ArtSource for MmOnly {
        fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> bool {
            image == HeroImage::Mm && self.0.write_hero(class_name, image, dest)
        }

        fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> bool {
            self.0.write_rank(tier, image, dest)
        }

        fn write_ability(&self, class_name: &str, dest: &Path) -> bool {
            self.0.write_ability(class_name, dest)
        }

        fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> bool {
            self.0.write_item(class_name, image, dest)
        }

        fn write_minimap(&self, dest: &Path) -> bool {
            self.0.write_minimap(dest)
        }

        fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> bool {
            self.0.write_minimap_icon(icon, dest)
        }
    }

    #[test]
    fn a_hero_with_only_a_minimap_head_still_has_art() {
        let rig = Rig::new("mm-only", &[]);
        let source = Arc::new(FakeSource::default());
        let cache = ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(move |_| Some(Arc::new(MmOnly(Arc::clone(&source))) as Arc<dyn ArtSource>)),
        );
        let art = cache.hero_art(&[hero(1, "hero_inferno")]);
        assert_eq!(art.len(), 1);
        assert!(art[0].sm.is_none() && art[0].card.is_none());
        assert!(art[0].mm.is_some());
    }

    struct CardOnly(Arc<FakeSource>);

    impl ArtSource for CardOnly {
        fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> bool {
            image == HeroImage::Card && self.0.write_hero(class_name, image, dest)
        }

        fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> bool {
            self.0.write_rank(tier, image, dest)
        }

        fn write_ability(&self, class_name: &str, dest: &Path) -> bool {
            self.0.write_ability(class_name, dest)
        }

        fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> bool {
            self.0.write_item(class_name, image, dest)
        }

        fn write_minimap(&self, dest: &Path) -> bool {
            self.0.write_minimap(dest)
        }

        fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> bool {
            self.0.write_minimap_icon(icon, dest)
        }
    }

    struct ChalkOnly(Arc<FakeSource>);

    impl ArtSource for ChalkOnly {
        fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> bool {
            self.0.write_hero(class_name, image, dest)
        }

        fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> bool {
            image == RankImage::Chalk && self.0.write_rank(tier, image, dest)
        }

        fn write_ability(&self, class_name: &str, dest: &Path) -> bool {
            self.0.write_ability(class_name, dest)
        }

        fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> bool {
            self.0.write_item(class_name, image, dest)
        }

        fn write_minimap(&self, dest: &Path) -> bool {
            self.0.write_minimap(dest)
        }

        fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> bool {
            self.0.write_minimap_icon(icon, dest)
        }
    }

    #[test]
    fn rank_badges_are_files_named_by_tier_beside_the_hero_art() {
        let rig = Rig::new("rank-paths", &[]);
        let cache = rig.cache();
        let hero = cache.hero_art(&[hero(1, "hero_inferno")]);
        let ranks = cache.rank_art(&[5, 11]);
        assert_eq!(ranks.iter().map(|r| r.tier).collect::<Vec<_>>(), vec![5, 11]);
        let lg = PathBuf::from(ranks[0].lg.as_ref().unwrap());
        let chalk = PathBuf::from(ranks[0].chalk.as_ref().unwrap());
        assert_eq!(lg.file_name().unwrap(), "rank05_lg.png");
        assert_eq!(chalk.file_name().unwrap(), "rank05_chalk.png");
        assert!(lg.is_file() && chalk.is_file());
        assert_eq!(lg.parent(), PathBuf::from(hero[0].sm.as_ref().unwrap()).parent());
    }

    #[test]
    fn rank_art_is_decoded_once_per_build() {
        let rig = Rig::new("rank-idempotent", &[]);
        let cache = rig.cache();
        let first = cache.rank_art(&[3]);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
        assert_eq!(cache.rank_art(&[3]), first);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
        assert_eq!(rig.cache().rank_art(&[3]), first);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn a_tier_with_no_badge_is_left_out_and_not_retried() {
        let rig = Rig::new("rank-missing", &[]);
        let source = Arc::new(FakeSource { failing_tiers: HashSet::from([4]), ..Default::default() });
        let counted = Arc::clone(&source);
        let cache = ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(move |_| Some(Arc::clone(&source) as Arc<dyn ArtSource>)),
        );
        let ranks = cache.rank_art(&[3, 4]);
        assert_eq!(ranks.iter().map(|r| r.tier).collect::<Vec<_>>(), vec![3]);
        let writes = counted.writes.load(Ordering::Relaxed);
        cache.rank_art(&[3, 4]);
        assert_eq!(counted.writes.load(Ordering::Relaxed), writes);
    }

    #[test]
    fn one_badge_failing_keeps_the_other() {
        let rig = Rig::new("rank-half", &[]);
        let source = Arc::new(FakeSource::default());
        let cache = ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(move |_| Some(Arc::new(ChalkOnly(Arc::clone(&source))) as Arc<dyn ArtSource>)),
        );
        let ranks = cache.rank_art(&[1]);
        assert_eq!(ranks.len(), 1);
        assert!(ranks[0].lg.is_none());
        assert!(ranks[0].chalk.is_some());
    }

    #[test]
    fn without_an_install_there_are_no_rank_badges() {
        let rig = Rig::new("rank-noinstall", &[]);
        let cache =
            ArtCache::with_opener(FakeInstall(Mutex::new(None)), rig.root.clone(), Box::new(|_| panic!("no install")));
        assert!(cache.rank_art(&[1]).is_empty());
    }

    fn names(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn ability_and_item_icons_are_files_in_the_build_directory_without_name_clashes() {
        let rig = Rig::new("class-paths", &[]);
        let cache = rig.cache();
        let hero = cache.hero_art(&[hero(1, "hero_inferno")]);
        let ability = cache.ability_art(&names(&["ability_dash"]));
        let icon = cache.item_art(&names(&["upgrade_a"]), ItemImage::Icon);
        let shop = cache.item_art(&names(&["upgrade_a"]), ItemImage::Shop);
        let file = |a: &[ClassArt]| PathBuf::from(&a[0].path);
        assert_eq!(a_name(&ability[0]), "ability_dash");
        assert_eq!(file(&ability).file_name().unwrap(), "ability_ability_dash.png");
        assert_eq!(file(&icon).file_name().unwrap(), "item_upgrade_a_icon.png");
        assert_eq!(file(&shop).file_name().unwrap(), "item_upgrade_a_shop.png");
        for f in [file(&ability), file(&icon), file(&shop)] {
            assert!(f.is_file());
            assert_eq!(f.parent(), PathBuf::from(hero[0].sm.as_ref().unwrap()).parent());
        }
    }

    fn a_name(a: &ClassArt) -> &str {
        &a.class_name
    }

    #[test]
    fn only_the_requested_classes_are_decoded_and_each_once() {
        let rig = Rig::new("class-lazy", &[]);
        let cache = rig.cache();
        let first = cache.item_art(&names(&["upgrade_a", "upgrade_b"]), ItemImage::Icon);
        assert_eq!(first.len(), 2);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
        cache.item_art(&names(&["upgrade_b", "upgrade_c"]), ItemImage::Icon);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 3);
        assert_eq!(rig.cache().item_art(&names(&["upgrade_a"]), ItemImage::Icon), first[..1]);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 3);
    }

    #[test]
    fn classes_without_a_local_image_are_left_out_and_not_retried() {
        let rig = Rig::new("class-missing", &["ability_svg"]);
        let cache = rig.cache();
        let out = cache.ability_art(&names(&["ability_svg", "ability_png"]));
        assert_eq!(out.iter().map(|a| a.class_name.as_str()).collect::<Vec<_>>(), vec!["ability_png"]);
        let writes = rig.source.writes.load(Ordering::Relaxed);
        cache.ability_art(&names(&["ability_svg"]));
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), writes);
    }

    #[test]
    fn class_batches_are_bounded_deduplicated_and_file_safe() {
        let rig = Rig::new("class-bound", &[]);
        let cache = rig.cache();
        let many: Vec<String> = (0..MAX_CLASS_BATCH + 50).map(|i| format!("upgrade_{i}")).collect();
        assert_eq!(cache.item_art(&many, ItemImage::Icon).len(), MAX_CLASS_BATCH);
        let out = cache.ability_art(&names(&["../evil", "ability_a", "ability_a", ""]));
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn without_an_install_there_are_no_class_images() {
        let rig = Rig::new("class-noinstall", &[]);
        let cache =
            ArtCache::with_opener(FakeInstall(Mutex::new(None)), rig.root.clone(), Box::new(|_| panic!("no install")));
        assert!(cache.ability_art(&names(&["ability_a"])).is_empty());
        assert!(cache.item_art(&names(&["upgrade_a"]), ItemImage::Shop).is_empty());
    }

    #[test]
    fn a_new_build_evicts_older_builds_and_redecodes() {
        let rig = Rig::new("evict", &[]);
        let cache = rig.cache();
        let heroes = [hero(1, "hero_inferno")];
        let old = cache.hero_art(&heroes);
        let old_dir = PathBuf::from(old[0].sm.clone().unwrap()).parent().unwrap().to_path_buf();
        rig.touch_archive(120);
        let new = cache.hero_art(&heroes);
        let new_dir = PathBuf::from(new[0].sm.clone().unwrap()).parent().unwrap().to_path_buf();
        assert_ne!(old_dir, new_dir);
        assert!(!old_dir.exists());
        assert!(new_dir.join("hero_inferno_sm.png").is_file());
        assert_eq!(fs::read_dir(&rig.root).unwrap().count(), 1);
    }

    #[test]
    fn stale_builds_left_on_disk_are_removed_on_first_use() {
        let rig = Rig::new("leftover", &[]);
        let stale = rig.root.join("0-0");
        fs::create_dir_all(&stale).unwrap();
        fs::write(stale.join("x.png"), b"png").unwrap();
        rig.cache().hero_art(&[hero(1, "hero_inferno")]);
        assert!(!stale.exists());
    }

    #[test]
    fn without_an_install_there_is_no_local_art() {
        let rig = Rig::new("noinstall", &[]);
        let cache =
            ArtCache::with_opener(FakeInstall(Mutex::new(None)), rig.root.clone(), Box::new(|_| panic!("no install")));
        assert!(cache.hero_art(&[hero(1, "hero_inferno")]).is_empty());
    }

    #[test]
    fn an_archive_that_will_not_open_means_no_local_art() {
        let rig = Rig::new("noopen", &[]);
        let cache = ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(|_| None),
        );
        assert!(cache.hero_art(&[hero(1, "hero_inferno")]).is_empty());
    }

    #[test]
    fn class_names_that_are_not_file_safe_get_no_art() {
        let rig = Rig::new("unsafe", &[]);
        let art = rig.cache().hero_art(&[hero(1, "../evil"), hero(2, "hero_a\\b"), hero(3, "hero_inferno")]);
        assert_eq!(art.iter().map(|a| a.id).collect::<Vec<_>>(), vec![3]);
    }

    #[test]
    fn the_minimap_is_a_file_beside_the_other_art() {
        let rig = Rig::new("minimap-path", &[]);
        let cache = rig.cache();
        let hero = cache.hero_art(&[hero(1, "hero_inferno")]);
        let path = PathBuf::from(cache.minimap_art().unwrap());
        assert_eq!(path.file_name().unwrap(), "minimap_mid.png");
        assert!(path.is_file());
        assert_eq!(path.parent(), PathBuf::from(hero[0].sm.as_ref().unwrap()).parent());
    }

    #[test]
    fn the_minimap_is_decoded_once_per_build() {
        let rig = Rig::new("minimap-once", &[]);
        let cache = rig.cache();
        let first = cache.minimap_art().unwrap();
        assert_eq!(cache.minimap_art().unwrap(), first);
        assert_eq!(rig.cache().minimap_art().unwrap(), first);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn a_new_build_redecodes_the_minimap() {
        let rig = Rig::new("minimap-build", &[]);
        let cache = rig.cache();
        let old = PathBuf::from(cache.minimap_art().unwrap());
        rig.touch_archive(120);
        let new = PathBuf::from(cache.minimap_art().unwrap());
        assert_ne!(old.parent(), new.parent());
        assert!(!old.exists());
        assert!(new.is_file());
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn a_minimap_that_will_not_decode_is_a_typed_failure_and_not_retried() {
        let rig = Rig::new("minimap-fail", &["minimap"]);
        let cache = rig.cache();
        assert_eq!(cache.minimap_art(), Err(MinimapError::ExtractFailed));
        assert_eq!(cache.minimap_art(), Err(MinimapError::ExtractFailed));
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn an_archive_that_will_not_open_fails_the_minimap_without_panicking() {
        let rig = Rig::new("minimap-noopen", &[]);
        let cache = ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(|_| None),
        );
        assert_eq!(cache.minimap_art(), Err(MinimapError::ExtractFailed));
    }

    #[test]
    fn without_an_install_the_minimap_reports_no_install() {
        let rig = Rig::new("minimap-noinstall", &[]);
        let cache =
            ArtCache::with_opener(FakeInstall(Mutex::new(None)), rig.root.clone(), Box::new(|_| panic!("no install")));
        assert_eq!(cache.minimap_art(), Err(MinimapError::NoInstall));
    }

    #[test]
    fn the_remote_minimap_lives_in_the_store_root_and_goes_when_a_build_starts() {
        let rig = Rig::new("minimap-remote", &[]);
        let cache = rig.cache();
        let remote = cache.remote_minimap_path();
        assert_eq!(remote.parent(), Some(rig.root.as_path()));
        fs::create_dir_all(&rig.root).unwrap();
        fs::write(&remote, b"png").unwrap();
        cache.minimap_art().unwrap();
        assert!(!remote.exists());
    }

    fn from_wire(value: &str) -> Option<MinimapIcon> {
        use serde::de::value::{Error, StrDeserializer};
        MinimapIcon::deserialize(StrDeserializer::<Error>::new(value)).ok()
    }

    fn icon_names(art: &[MinimapIconArt]) -> Vec<MinimapIcon> {
        art.iter().map(|a| a.icon).collect()
    }

    #[test]
    fn the_icon_allow_list_names_only_stems_the_game_reader_accepts() {
        assert_eq!(MinimapIcon::ALL.len(), 22);
        let stems: HashSet<&str> = MinimapIcon::ALL.iter().map(|i| i.stem()).collect();
        assert_eq!(stems.len(), MinimapIcon::ALL.len(), "stems are unique");
        for icon in MinimapIcon::ALL {
            assert!(MinimapArtKind::icon(icon.stem()).is_ok(), "{}", icon.stem());
            assert_eq!(from_wire(icon.stem()), Some(icon));
        }
    }

    #[test]
    fn a_stem_outside_the_allow_list_does_not_deserialize() {
        for stem in ["../evil", "boss_health_psd", "BOSS_HEALTH", "", "powerup_weapon"] {
            assert_eq!(from_wire(stem), None, "{stem}");
        }
    }

    #[test]
    fn minimap_icons_are_files_in_the_build_directory_named_by_stem() {
        let rig = Rig::new("icon-paths", &[]);
        let cache = rig.cache();
        let hero = cache.hero_art(&[hero(1, "hero_inferno")]);
        let out = cache.minimap_icons(&[MinimapIcon::BossHealth, MinimapIcon::NeutralVault]);
        assert_eq!(icon_names(&out), vec![MinimapIcon::BossHealth, MinimapIcon::NeutralVault]);
        let first = PathBuf::from(&out[0].path);
        assert_eq!(first.file_name().unwrap(), "minimap_icon_boss_health.png");
        assert_eq!(PathBuf::from(&out[1].path).file_name().unwrap(), "minimap_icon_neutral_vault.png");
        assert!(first.is_file());
        assert_eq!(first.parent(), PathBuf::from(hero[0].sm.as_ref().unwrap()).parent());
    }

    #[test]
    fn minimap_icons_are_decoded_once_per_build_and_only_when_asked_for() {
        let rig = Rig::new("icon-once", &[]);
        let cache = rig.cache();
        let first = cache.minimap_icons(&[MinimapIcon::PlayerCone, MinimapIcon::PlayerCone]);
        assert_eq!(first.len(), 1);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 1);
        assert_eq!(cache.minimap_icons(&[MinimapIcon::PlayerCone]), first);
        assert_eq!(rig.cache().minimap_icons(&[MinimapIcon::PlayerCone]), first);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn an_icon_that_will_not_decode_is_left_out_and_not_retried() {
        let rig = Rig::new("icon-missing", &["boss_health_dead"]);
        let cache = rig.cache();
        let out = cache.minimap_icons(&[MinimapIcon::BossHealthDead, MinimapIcon::MinimapShop]);
        assert_eq!(icon_names(&out), vec![MinimapIcon::MinimapShop]);
        let writes = rig.source.writes.load(Ordering::Relaxed);
        cache.minimap_icons(&[MinimapIcon::BossHealthDead]);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), writes);
    }

    #[test]
    fn the_whole_allow_list_decodes_in_one_call() {
        let rig = Rig::new("icon-all", &[]);
        let out = rig.cache().minimap_icons(&MinimapIcon::ALL);
        assert_eq!(out.len(), MinimapIcon::ALL.len());
    }

    #[test]
    fn without_an_install_there_are_no_minimap_icons() {
        let rig = Rig::new("icon-noinstall", &[]);
        let cache =
            ArtCache::with_opener(FakeInstall(Mutex::new(None)), rig.root.clone(), Box::new(|_| panic!("no install")));
        assert!(cache.minimap_icons(&[MinimapIcon::BossHealth]).is_empty());
    }

    #[test]
    #[ignore = "needs DEADLOCK_CITADEL_DIR pointing at an installed game"]
    fn a_real_install_decodes_every_allow_listed_minimap_icon() {
        let dir = std::env::var("DEADLOCK_CITADEL_DIR").expect("DEADLOCK_CITADEL_DIR");
        let archive = ArtArchive::open(&dir).unwrap();
        let mut failed = Vec::new();
        for icon in MinimapIcon::ALL {
            let art = Art::minimap(MinimapArtKind::icon(icon.stem()).unwrap());
            let ok = archive.contains(&art) && archive.image(&art).is_ok_and(|i| i.width > 0 && i.height > 0);
            if !ok {
                failed.push(icon.stem());
            }
        }
        assert!(failed.is_empty(), "icons that did not decode: {failed:?}");
    }

    #[test]
    #[ignore = "needs DEADLOCK_CITADEL_DIR pointing at an installed game"]
    fn a_real_install_decodes_a_hero_minimap_head() {
        let dir = std::env::var("DEADLOCK_CITADEL_DIR").expect("DEADLOCK_CITADEL_DIR");
        let archive = ArtArchive::open(&dir).unwrap();
        let art = Art::hero("hero_inferno", HeroArtKind::Mm);
        assert!(archive.contains(&art), "{}", archive.path(&art));
        let image = archive.image(&art).unwrap();
        assert!(image.width > 0 && image.height > 0);
        let alpha: Vec<u8> = image.rgba.iter().skip(3).step_by(4).copied().collect();
        assert!(alpha.contains(&0), "a cutout has transparent pixels");
        assert!(alpha.iter().any(|&a| a > 0));
    }
}
