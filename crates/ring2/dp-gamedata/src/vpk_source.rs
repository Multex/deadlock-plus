use std::path::Path;

use deadlock_data::vdata::{ABILITIES_PATH, ARCHIVE};
use source2::ext::VpkResourceKv3;
use source2::resource::BlockKind;
use source2::vpk::Vpk;
use source2_kv3::Document;

use crate::progression::HeroesSource;
use crate::shop::ShopSource;

pub use deadlock_data::vdata::HEROES_PATH;

/// Reads compiled vdata straight out of the install's `pak01_dir.vpk`.
pub struct VpkVdataSource;

impl VpkVdataSource {
    fn read_vdata(&self, citadel_dir: &Path, path: &str) -> Result<Document, String> {
        let archive = citadel_dir.join(ARCHIVE);
        let vpk = Vpk::open(&archive).map_err(|e| format!("{}: {e}", archive.display()))?;
        vpk.read_resource_kv3(path, BlockKind::DATA).map_err(|e| format!("{path}: {e}"))
    }
}

impl HeroesSource for VpkVdataSource {
    fn read(&self, citadel_dir: &Path) -> Result<Document, String> {
        self.read_vdata(citadel_dir, HEROES_PATH)
    }

    fn read_abilities(&self, citadel_dir: &Path) -> Result<Document, String> {
        self.read_vdata(citadel_dir, ABILITIES_PATH)
    }
}

impl ShopSource for VpkVdataSource {
    fn read(&self, citadel_dir: &Path, path: &str) -> Result<Document, String> {
        self.read_vdata(citadel_dir, path)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::catalog::{Install, SteamInstall};
    use crate::progression::{ability_id, HeroTable};
    use crate::shop::{shop_items, ShopSlot, ABILITIES_PATH, GENERIC_DATA_PATH};

    /// The installed game, or `None` to skip: these tests only read the archive.
    fn installed() -> Option<PathBuf> {
        let dir = std::env::var_os("DEADLOCK_CITADEL_DIR").map(PathBuf::from).or_else(|| SteamInstall.citadel_dir());
        let dir = dir.filter(|d| d.join(deadlock_data::vdata::ARCHIVE).is_file());
        if dir.is_none() {
            eprintln!("skipped: no installed Deadlock");
        }
        dir
    }

    #[test]
    fn a_missing_archive_is_an_error_naming_it() {
        let dir = std::env::temp_dir().join(format!("dp-gamedata-vpk-missing-{}", std::process::id()));
        let err = HeroesSource::read(&VpkVdataSource, &dir).unwrap_err();
        assert!(err.contains("pak01_dir.vpk"), "{err}");
    }

    #[test]
    fn the_installed_level_table_matches_the_known_facts() {
        let Some(dir) = installed() else { return };
        let doc = HeroesSource::read(&VpkVdataSource, &dir).expect("heroes.vdata reads");
        let table = HeroTable::from_document(&doc).expect("heroes.vdata parses");
        let levels = &table.progression.levels;
        assert_eq!(levels.len(), 36);
        let unlock_souls: Vec<u32> = levels.iter().filter(|l| l.unlocks > 0).map(|l| l.souls).collect();
        assert_eq!(unlock_souls, [0, 500, 1400, 3200]);
        assert_eq!(levels.iter().map(|l| l.ap).sum::<u32>(), 32);
        assert_eq!(levels.last().map(|l| l.souls), Some(48_600));
    }

    #[test]
    fn the_installed_heroes_carry_their_ability_ids() {
        let Some(dir) = installed() else { return };
        let doc = HeroesSource::read(&VpkVdataSource, &dir).expect("heroes.vdata reads");
        let table = HeroTable::from_document(&doc).expect("heroes.vdata parses");
        assert_eq!(table.abilities.get(&1), Some(&[491_391_007, 3_516_947_824, 1_593_133_799, 1_142_270_357]));
        assert_eq!(table.abilities.get(&2), Some(&[1_065_103_387, 1_074_714_947, 539_192_269, 2_061_574_352]));
        assert!(table.popular_items.contains_key(&1));
    }

    #[test]
    fn the_installed_table_carries_bullet_damage() {
        let Some(dir) = installed() else { return };
        let heroes = HeroesSource::read(&VpkVdataSource, &dir).expect("heroes.vdata reads");
        let abilities = HeroesSource::read_abilities(&VpkVdataSource, &dir).expect("abilities.vdata reads");
        let table = HeroTable::from_documents(&heroes, Some(&abilities)).expect("heroes.vdata parses");
        assert_eq!(table.stats[&2].bullet_damage, Some(10.8));
    }

    #[test]
    fn the_installed_shop_matches_the_known_items_and_tier_counts() {
        let Some(dir) = installed() else { return };
        let abilities = ShopSource::read(&VpkVdataSource, &dir, ABILITIES_PATH).expect("abilities.vdata reads");
        let generic = ShopSource::read(&VpkVdataSource, &dir, GENERIC_DATA_PATH).expect("generic_data.vdata reads");
        let items = shop_items(&abilities, &generic).expect("shop parses");
        let by_id = |id: u32| items.iter().find(|i| i.id == id).unwrap_or_else(|| panic!("{id} missing"));

        let extra_spirit = by_id(968_099_481);
        assert_eq!((extra_spirit.slot, extra_spirit.tier, extra_spirit.cost), (ShopSlot::Spirit, 1, 800));
        assert_eq!(by_id(ability_id("upgrade_soaring_spirit")).components, [968_099_481]);

        let shopable = |tier: u8| items.iter().filter(|i| i.shopable && i.tier == tier).count();
        assert_eq!([shopable(1), shopable(2), shopable(3), shopable(4)], [23, 43, 46, 44]);
    }
}
