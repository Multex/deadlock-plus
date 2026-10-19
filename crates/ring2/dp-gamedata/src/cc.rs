use std::collections::BTreeMap;
use std::path::Path;

pub use deadlock_data::vdata::{CcAbility, CcKind, CcOwner};

const BUNDLED: &str = include_str!("../data/cc_abilities.tsv");

/// The abilities and items that apply hard crowd control, keyed by class name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CcSet {
    abilities: BTreeMap<String, CcAbility>,
    fingerprint: String,
}

impl CcSet {
    pub fn new(abilities: BTreeMap<String, CcAbility>) -> Self {
        let fingerprint = fingerprint(&abilities);
        Self { abilities, fingerprint }
    }

    pub fn bundled() -> Self {
        Self::new(parse_bundled(BUNDLED))
    }

    pub fn from_install(dir: &Path) -> deadlock_data::Result<Self> {
        deadlock_data::vdata::cc_abilities(dir).map(Self::new)
    }

    pub(crate) fn installed(dir: Option<&Path>) -> Self {
        Self::resolve(dir.map(Self::from_install))
    }

    fn resolve(read: Option<deadlock_data::Result<Self>>) -> Self {
        match read {
            Some(Ok(set)) => set,
            Some(Err(e)) => {
                log::warn!("installed crowd control list unavailable, using the bundled one: {e}");
                Self::bundled()
            }
            None => Self::bundled(),
        }
    }

    /// The bundled-file format: one `class<TAB>owner<TAB>kind:tier,kind:tier` row per ability, sorted by class.
    pub fn to_tsv(&self) -> String {
        let mut out = String::new();
        for (class, ability) in &self.abilities {
            let owner = match &ability.owner {
                CcOwner::Item => "item",
                CcOwner::Hero(hero) => hero,
            };
            let kinds: Vec<String> = ability.kinds.iter().map(|(k, t)| format!("{}:{t}", kind_name(*k))).collect();
            out.push_str(&format!("{class}\t{owner}\t{}\n", kinds.join(",")));
        }
        out
    }

    pub fn contains(&self, class_name: &str) -> bool {
        self.abilities.contains_key(class_name)
    }

    pub fn get(&self, class_name: &str) -> Option<&CcAbility> {
        self.abilities.get(class_name)
    }

    pub fn classes(&self) -> impl Iterator<Item = &str> {
        self.abilities.keys().map(String::as_str)
    }

    pub fn len(&self) -> usize {
        self.abilities.len()
    }

    pub fn is_empty(&self) -> bool {
        self.abilities.is_empty()
    }

    /// Stable across runs and platforms; changes when any class, kind or upgrade tier changes.
    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }
}

fn kind_name(kind: CcKind) -> &'static str {
    match kind {
        CcKind::Stun => "stun",
        CcKind::Immobilize => "immobilize",
        CcKind::Tether => "tether",
        CcKind::Silence => "silence",
        CcKind::Sleep => "sleep",
        CcKind::Knockup => "knockup",
        CcKind::Pull => "pull",
        CcKind::Disarm => "disarm",
        CcKind::Hex => "hex",
        CcKind::Freeze => "freeze",
        _ => "other",
    }
}

fn kind_from_name(name: &str) -> Option<CcKind> {
    [
        CcKind::Stun,
        CcKind::Immobilize,
        CcKind::Tether,
        CcKind::Silence,
        CcKind::Sleep,
        CcKind::Knockup,
        CcKind::Pull,
        CcKind::Disarm,
        CcKind::Hex,
        CcKind::Freeze,
    ]
    .into_iter()
    .find(|k| kind_name(*k) == name)
}

/// One line per ability: `class<TAB>owner<TAB>kind:tier,kind:tier`, where owner is `item` or a hero class.
fn parse_bundled(text: &str) -> BTreeMap<String, CcAbility> {
    let mut out = BTreeMap::new();
    for line in text.lines().filter(|l| !l.trim().is_empty()) {
        let mut cols = line.split('\t');
        let (Some(class), Some(owner), Some(kinds)) = (cols.next(), cols.next(), cols.next()) else {
            log::warn!("bundled crowd control row is malformed: {line}");
            continue;
        };
        let owner = if owner == "item" { CcOwner::Item } else { CcOwner::Hero(owner.to_string()) };
        let kinds = kinds
            .split(',')
            .filter_map(|pair| {
                let (kind, tier) = pair.split_once(':')?;
                Some((kind_from_name(kind)?, tier.parse().ok()?))
            })
            .collect();
        out.insert(class.to_string(), CcAbility { owner, kinds });
    }
    out
}

fn fingerprint(abilities: &BTreeMap<String, CcAbility>) -> String {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = OFFSET;
    let mut feed = |bytes: &[u8]| {
        for b in bytes {
            hash = (hash ^ u64::from(*b)).wrapping_mul(PRIME);
        }
    };
    for (class, ability) in abilities {
        feed(class.as_bytes());
        feed(&[0]);
        for (kind, tier) in &ability.kinds {
            feed(kind_name(*kind).as_bytes());
            feed(&[b':', *tier, b',']);
        }
        feed(b"\n");
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(class: &str, kind: CcKind, tier: u8) -> BTreeMap<String, CcAbility> {
        BTreeMap::from([(class.to_string(), CcAbility { owner: CcOwner::Item, kinds: BTreeMap::from([(kind, tier)]) })])
    }

    #[test]
    fn the_bundled_set_has_hero_abilities_and_items_but_not_slows() {
        let set = CcSet::bundled();
        assert!(set.len() > 50);
        assert!(set.contains("ability_necro_gravestone"));
        assert!(set.contains("upgrade_target_stun"));
        assert!(!set.contains("citadel_ability_tangotether"));
        assert_eq!(set.get("upgrade_target_stun").unwrap().owner, CcOwner::Item);
        assert_eq!(set.get("ability_necro_gravestone").unwrap().owner, CcOwner::Hero("hero_necro".into()));
        assert_eq!(set.get("ability_artist_tether").unwrap().kinds.len(), 2);
    }

    #[test]
    fn the_bundled_file_round_trips_through_the_formatter() {
        assert_eq!(CcSet::bundled().to_tsv(), BUNDLED);
    }

    #[test]
    fn the_fingerprint_is_stable_for_the_same_set() {
        assert_eq!(CcSet::bundled().fingerprint(), CcSet::bundled().fingerprint());
        assert_eq!(CcSet::new(one("a", CcKind::Stun, 0)).fingerprint().len(), 16);
        assert_eq!(CcSet::new(one("a", CcKind::Stun, 0)).fingerprint(), "63103df84b7d9a14");
    }

    #[test]
    fn the_fingerprint_changes_when_one_entry_changes() {
        let base = CcSet::new(one("a", CcKind::Stun, 0));
        assert_ne!(base.fingerprint(), CcSet::new(one("b", CcKind::Stun, 0)).fingerprint());
        assert_ne!(base.fingerprint(), CcSet::new(one("a", CcKind::Silence, 0)).fingerprint());
        assert_ne!(base.fingerprint(), CcSet::new(one("a", CcKind::Stun, 2)).fingerprint());
        assert_ne!(base.fingerprint(), CcSet::new(BTreeMap::new()).fingerprint());
    }

    #[test]
    fn a_readable_install_replaces_the_bundled_set_without_merging() {
        let installed = CcSet::new(one("upgrade_new_stun", CcKind::Stun, 0));
        let set = CcSet::resolve(Some(Ok(installed.clone())));
        assert_eq!(set, installed);
        assert!(!set.contains("ability_necro_gravestone"));
    }

    #[test]
    fn an_unreadable_install_falls_back_to_the_bundled_set() {
        let dir = std::env::temp_dir().join(format!("dp-gamedata-cc-missing-{}", std::process::id()));
        assert_eq!(CcSet::installed(Some(&dir)), CcSet::bundled());
        assert_eq!(CcSet::installed(None), CcSet::bundled());
    }
}
