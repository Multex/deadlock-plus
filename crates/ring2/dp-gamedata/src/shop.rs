use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::SystemTime;

use serde::Serialize;
use source2_kv3::{Document, Object, Value};
use ts_rs::TS;

use crate::ability_tooltip::{localised_abilities, raw_abilities, AbilityTooltip, RawAbility, ABILITY_BUNDLES};
use crate::catalog::{archive_stamp, Install, SteamInstall};
use crate::item_stats::{labelled, raw_item_stats, stat_localisation, ItemStats, RawItem};
use crate::locale::game_language;
use crate::progression::ability_id;
use crate::tooltip::bundle_localisation;
use crate::vpk_source::VpkVdataSource;

pub use deadlock_data::vdata::ABILITIES_PATH;
pub const GENERIC_DATA_PATH: &str = "scripts/generic_data.vdata_c";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ShopSlot {
    Weapon,
    Vitality,
    Spirit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ShopItem {
    pub id: u32,
    pub class_name: String,
    pub slot: ShopSlot,
    pub tier: u8,
    pub cost: u32,
    pub active: bool,
    pub components: Vec<u32>,
    pub disabled: bool,
    pub shopable: bool,
    pub imbue: bool,
    /// `EShopFilter*` tags the vdata adds on top of the ones the game computes, minus the disabled ones.
    pub shop_filters: Vec<String>,
    /// `EShopFilter*` tags the vdata removes from the computed ones.
    pub disabled_shop_filters: Vec<String>,
}

/// Every shop item in `abilities.vdata`, disabled ones included; `shopable` says which the shop offers.
/// Compiled vdata already holds each entry's inherited fields, so no `_multibase` chain is followed.
pub fn shop_items(abilities: &Document, generic_data: &Document) -> Result<Vec<ShopItem>, String> {
    let prices = price_per_tier(generic_data)?;
    let root = abilities.root.as_object().ok_or("abilities.vdata: root is not an object")?;
    let mut items: Vec<ShopItem> =
        root.iter().filter_map(|(class_name, entry)| shop_item(class_name, entry.as_object()?, &prices)).collect();
    items.sort_by_key(|i| i.id);
    Ok(items)
}

/// Indexed by tier; index 0 is unused.
fn price_per_tier(generic_data: &Document) -> Result<Vec<u32>, String> {
    let table = generic_data
        .root
        .get("m_nItemPricePerTier")
        .and_then(Value::as_array)
        .ok_or("generic_data.vdata: no m_nItemPricePerTier")?;
    table.iter().map(|v| v.as_u32().ok_or_else(|| "generic_data.vdata: a tier price is not a number".into())).collect()
}

fn shop_item(class_name: &str, entry: &Object, prices: &[u32]) -> Option<ShopItem> {
    // `_not_pickable` marks the per-slot and per-tier templates the real items inherit from.
    if entry.get("m_eAbilityType").and_then(Value::as_str) != Some("EAbilityType_Item")
        || entry.contains_key("_not_pickable")
    {
        return None;
    }
    let slot = match entry.get("m_eItemSlotType").and_then(Value::as_str)? {
        "EItemSlotType_WeaponMod" => ShopSlot::Weapon,
        "EItemSlotType_Armor" => ShopSlot::Vitality,
        "EItemSlotType_Tech" => ShopSlot::Spirit,
        _ => return None,
    };
    let tier: u8 = entry.get("m_iItemTier")?.as_str()?.strip_prefix("EModTier_")?.parse().ok()?;
    let cost = *prices.get(usize::from(tier))?;
    let text = |key: &str| entry.get(key).and_then(Value::as_str).unwrap_or_default();
    let disabled = flag(entry, "m_bDisabled");
    let components = entry
        .get("m_vecComponentItems")
        .and_then(Value::as_array)
        .unwrap_or_default()
        .iter()
        .filter_map(Value::as_str)
        .map(ability_id)
        .collect();
    let disabled_shop_filters = filter_flags(text("m_eDisableShopFilters"));
    let shop_filters = filter_flags(text("m_eAdditionalShopFilters"))
        .into_iter()
        .filter(|f| !disabled_shop_filters.contains(f))
        .collect();
    Some(ShopItem {
        id: ability_id(class_name),
        class_name: class_name.to_string(),
        slot,
        tier,
        cost,
        active: entry
            .get("m_eAbilityActivation")
            .and_then(Value::as_str)
            .is_some_and(|a| a != "CITADEL_ABILITY_ACTIVATION_PASSIVE"),
        components,
        disabled,
        shopable: !disabled && !text("m_strShopIconLarge").is_empty(),
        imbue: text("m_TargetAbilityEffectsToApply").starts_with("CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE"),
        shop_filters,
        disabled_shop_filters,
    })
}

/// A flags enum compiles to one string, `"A | B"`, or `""` for none.
fn filter_flags(flags: &str) -> Vec<String> {
    flags.split('|').map(str::trim).filter(|f| !f.is_empty()).map(String::from).collect()
}

/// The compiled file stores `m_bDisabled` as a bool, an integer or the string `"true"`, varying by item.
fn flag(entry: &Object, key: &str) -> bool {
    entry
        .get(key)
        .is_some_and(|v| v.as_bool().or_else(|| v.as_u64().map(|n| n != 0)).unwrap_or(v.as_str() == Some("true")))
}

pub trait ShopSource: Send + Sync + 'static {
    /// A compiled vdata file such as [`ABILITIES_PATH`] of the install in `citadel_dir`, as a KV3 document.
    fn read(&self, citadel_dir: &Path, path: &str) -> Result<Document, String>;
}

struct Memo {
    dir: Option<PathBuf>,
    stamp: Option<SystemTime>,
    items: Option<Arc<Vec<ShopItem>>>,
    stats: Option<HashMap<u32, RawItem>>,
    labelled: HashMap<&'static str, Arc<Vec<ItemStats>>>,
    abilities: Option<HashMap<u32, RawAbility>>,
    ability_tooltips: HashMap<&'static str, Arc<Vec<AbilityTooltip>>>,
}

pub struct ShopVdata<I: Install = SteamInstall, S: ShopSource = VpkVdataSource> {
    install: I,
    source: S,
    /// Failures are memoized too: the archive is re-read only once the install or its build changes.
    memo: Mutex<Option<Memo>>,
}

impl Default for ShopVdata {
    fn default() -> Self {
        Self::new(SteamInstall, VpkVdataSource)
    }
}

impl<I: Install, S: ShopSource> ShopVdata<I, S> {
    pub fn new(install: I, source: S) -> Self {
        Self { install, source, memo: Mutex::new(None) }
    }

    pub fn items(&self) -> Option<Arc<Vec<ShopItem>>> {
        self.current().as_ref().and_then(|m| m.items.clone())
    }

    /// The tooltip stats of every item, labelled in the game language for `locale`.
    pub fn item_stats(&self, locale: &str) -> Option<Arc<Vec<ItemStats>>> {
        let language = game_language(locale);
        let mut guard = self.current();
        let memo = guard.as_mut()?;
        if let Some(list) = memo.labelled.get(language) {
            return Some(Arc::clone(list));
        }
        let (dir, stats) = (memo.dir.as_deref()?, memo.stats.as_ref()?);
        let list = Arc::new(labelled(stats, &stat_localisation(dir, language)));
        memo.labelled.insert(language, Arc::clone(&list));
        Some(list)
    }

    /// The hero ability tooltips, labelled in the game language for `locale`.
    pub fn ability_tooltips(&self, locale: &str) -> Option<Arc<Vec<AbilityTooltip>>> {
        let language = game_language(locale);
        let mut guard = self.current();
        let memo = guard.as_mut()?;
        if let Some(list) = memo.ability_tooltips.get(language) {
            return Some(Arc::clone(list));
        }
        let (dir, abilities) = (memo.dir.as_deref()?, memo.abilities.as_ref()?);
        let list = Arc::new(localised_abilities(abilities, &bundle_localisation(dir, language, &ABILITY_BUNDLES)));
        memo.ability_tooltips.insert(language, Arc::clone(&list));
        Some(list)
    }

    fn current(&self) -> MutexGuard<'_, Option<Memo>> {
        let dir = self.install.citadel_dir();
        let stamp = dir.as_deref().and_then(archive_stamp);
        let mut memo = self.memo.lock().unwrap_or_else(|e| e.into_inner());
        if memo.as_ref().is_some_and(|m| m.dir == dir && m.stamp == stamp) {
            return memo;
        }
        let (items, stats, abilities) = match dir.as_deref().map(|dir| (dir, self.source.read(dir, ABILITIES_PATH))) {
            None => (None, None, None),
            Some((_, Err(e))) => {
                log::warn!("shop items unavailable: {e}");
                (None, None, None)
            }
            Some((dir, Ok(abilities))) => {
                let items = self
                    .source
                    .read(dir, GENERIC_DATA_PATH)
                    .and_then(|generic| shop_items(&abilities, &generic))
                    .map_err(|e| log::warn!("shop items unavailable: {e}"))
                    .ok()
                    .map(Arc::new);
                (items, Some(raw_item_stats(&abilities)), Some(raw_abilities(&abilities)))
            }
        };
        *memo = Some(Memo {
            dir,
            stamp,
            items,
            stats,
            labelled: HashMap::new(),
            abilities,
            ability_tooltips: HashMap::new(),
        });
        memo
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const GENERIC: &str =
        "{ generic_data_type = \"CitadelGenericData_t\" m_nItemPricePerTier = [ 0, 800, 1600, 3200, 6400, 9999 ] }";

    fn doc(text: &str) -> Document {
        Document::from_text(text).expect("test document parses")
    }

    fn item(fields: &str) -> String {
        format!(
            "{{\n_class = \"citadel_item\"\nm_eAbilityType = \"EAbilityType_Item\"\n\
             m_eAbilityActivation = \"CITADEL_ABILITY_ACTIVATION_PASSIVE\"\n\
             m_strShopIconLarge = resource_name:\"file://{{images}}/items/x.psd\"\n{fields}\n}}"
        )
    }

    fn parse(body: &str) -> Vec<ShopItem> {
        shop_items(&doc(&format!("{{\n{body}\n}}")), &doc(GENERIC)).expect("items parse")
    }

    fn one(body: &str) -> ShopItem {
        let items = parse(body);
        assert_eq!(items.len(), 1, "{items:?}");
        items.into_iter().next().unwrap()
    }

    #[test]
    fn the_price_table_comes_from_generic_data() {
        assert_eq!(price_per_tier(&doc(GENERIC)).unwrap(), [0, 800, 1600, 3200, 6400, 9999]);
    }

    #[test]
    fn generic_data_without_a_price_table_is_an_error() {
        let abilities = doc(&format!("{{ x = {} }}", item("m_eItemSlotType = \"EItemSlotType_Tech\"")));
        assert!(shop_items(&abilities, &doc("{ generic_data_type = \"CitadelGenericData_t\" }")).is_err());
    }

    #[test]
    fn an_item_takes_its_slot_tier_and_the_tier_price() {
        let body = format!(
            "upgrade_improved_spirit = {}",
            item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_1\"")
        );
        assert_eq!(
            one(&body),
            ShopItem {
                id: ability_id("upgrade_improved_spirit"),
                class_name: "upgrade_improved_spirit".into(),
                slot: ShopSlot::Spirit,
                tier: 1,
                cost: 800,
                active: false,
                components: vec![],
                disabled: false,
                shopable: true,
                imbue: false,
                shop_filters: vec![],
                disabled_shop_filters: vec![],
            }
        );
    }

    #[test]
    fn slots_map_to_weapon_vitality_and_spirit() {
        let body = format!(
            "a = {}\nb = {}\nc = {}",
            item("m_eItemSlotType = \"EItemSlotType_WeaponMod\"\nm_iItemTier = \"EModTier_2\""),
            item("m_eItemSlotType = \"EItemSlotType_Armor\"\nm_iItemTier = \"EModTier_3\""),
            item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_4\""),
        );
        let items = parse(&body);
        let get = |class: &str| items.iter().find(|i| i.class_name == class).unwrap();
        assert_eq!((get("a").slot, get("a").tier, get("a").cost), (ShopSlot::Weapon, 2, 1600));
        assert_eq!((get("b").slot, get("b").tier, get("b").cost), (ShopSlot::Vitality, 3, 3200));
        assert_eq!((get("c").slot, get("c").tier, get("c").cost), (ShopSlot::Spirit, 4, 6400));
    }

    #[test]
    fn an_upgrade_lists_its_components_by_id() {
        let body = format!(
            "upgrade_sharpshooter = {}",
            item(
                "m_eItemSlotType = \"EItemSlotType_WeaponMod\"\nm_iItemTier = \"EModTier_3\"\n\
                 m_vecComponentItems = [ \"upgrade_long_range\", \"upgrade_high_velocity_mag\" ]"
            )
        );
        assert_eq!(one(&body).components, [ability_id("upgrade_long_range"), ability_id("upgrade_high_velocity_mag")]);
    }

    #[test]
    fn any_activation_other_than_passive_is_active() {
        for (activation, active) in [
            ("CITADEL_ABILITY_ACTIVATION_PASSIVE", false),
            ("CITADEL_ABILITY_ACTIVATION_PRESS", true),
            ("CITADEL_ABILITY_ACTIVATION_INSTANT_CAST", true),
            ("CITADEL_ABILITY_ACTIVATION_INSTANT_CAST_TOGGLE", true),
        ] {
            let body = format!(
                "x = {}",
                item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_1\"")
                    .replace("CITADEL_ABILITY_ACTIVATION_PASSIVE", activation)
            );
            assert_eq!(one(&body).active, active, "{activation}");
        }
    }

    #[test]
    fn disabled_is_read_as_a_bool_an_integer_or_a_string() {
        // The compiled abilities file stores `m_bDisabled` all three ways.
        for (value, disabled) in
            [("true", true), ("1", true), ("\"true\"", true), ("false", false), ("0", false), ("\"false\"", false)]
        {
            let body = format!(
                "x = {}",
                item(&format!(
                    "m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_2\"\nm_bDisabled = {value}"
                ))
            );
            let parsed = one(&body);
            assert_eq!(parsed.disabled, disabled, "m_bDisabled = {value}");
            assert_eq!(parsed.shopable, !disabled, "m_bDisabled = {value}");
        }
    }

    #[test]
    fn an_item_without_a_shop_icon_is_not_shopable() {
        let body = "x = {\nm_eAbilityType = \"EAbilityType_Item\"\n\
                    m_eAbilityActivation = \"CITADEL_ABILITY_ACTIVATION_PASSIVE\"\n\
                    m_eItemSlotType = \"EItemSlotType_Armor\"\nm_iItemTier = \"EModTier_1\"\n}";
        let parsed = one(body);
        assert!(!parsed.disabled);
        assert!(!parsed.shopable);
    }

    #[test]
    fn imbue_items_are_flagged() {
        for (effect, imbue) in [
            ("CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE_ACTIVE", true),
            ("CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE_ACTIVE_NON_ULT", true),
            ("CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE_MODIFIER_VALUE", true),
            ("", false),
        ] {
            let body = format!(
                "x = {}",
                item(&format!(
                    "m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_2\"\n\
                     m_TargetAbilityEffectsToApply = \"{effect}\""
                ))
            );
            assert_eq!(one(&body).imbue, imbue, "{effect:?}");
        }
    }

    #[test]
    fn templates_abilities_and_slotless_entries_are_left_out() {
        let body = format!(
            "generic_data_type = \"CitadelAbilityVData\"\n\
             tech_upgrade_t1 = {}\n\
             ability_item_pickup_effects = {{\nm_eAbilityType = \"EAbilityType_Item\"\n}}\n\
             invalid_slot = {}\n\
             ability_fireball = {{\nm_eAbilityType = \"EAbilityType_Signature\"\n\
             m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_1\"\n}}\n\
             upgrade_improved_spirit = {}",
            item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_1\"\n_not_pickable = 2"),
            item("m_eItemSlotType = \"EItemSlotType_Invalid\"\nm_iItemTier = \"EModTier_1\""),
            item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_1\""),
        );
        let items = parse(&body);
        assert_eq!(items.iter().map(|i| i.class_name.as_str()).collect::<Vec<_>>(), ["upgrade_improved_spirit"]);
    }

    #[test]
    fn a_tier_past_the_price_table_is_left_out() {
        let body = format!("x = {}", item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_9\""));
        assert!(parse(&body).is_empty());
    }

    #[test]
    fn items_are_sorted_by_id() {
        let body = format!(
            "upgrade_boundless_spirit = {}\nupgrade_improved_spirit = {}\nupgrade_soaring_spirit = {}",
            item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_4\""),
            item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_1\""),
            item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_2\""),
        );
        let ids: Vec<u32> = parse(&body).iter().map(|i| i.id).collect();
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        assert_eq!(ids.len(), 3);
        assert_eq!(ids, sorted);
    }

    fn with_filters(fields: &str) -> ShopItem {
        one(&format!(
            "x = {}",
            item(&format!("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_2\"\n{fields}"))
        ))
    }

    #[test]
    fn additional_shop_filters_are_split_on_pipes() {
        // As build 6805 stores upgrade_phantom_strike's.
        let parsed = with_filters("m_eAdditionalShopFilters = \"EShopFilterTeleport | EShopFilterStatus_Grounded\"");
        assert_eq!(parsed.shop_filters, ["EShopFilterTeleport", "EShopFilterStatus_Grounded"]);
        assert!(parsed.disabled_shop_filters.is_empty());
    }

    #[test]
    fn disabled_shop_filters_are_listed_and_dropped_from_the_additional_ones() {
        let parsed = with_filters(
            "m_eAdditionalShopFilters = \"EShopFilterSpiritCooldownAndCharges | EShopFilterSpiritDamage\"\n\
             m_eDisableShopFilters = \"EShopFilterSpiritDamage\"",
        );
        assert_eq!(parsed.shop_filters, ["EShopFilterSpiritCooldownAndCharges"]);
        assert_eq!(parsed.disabled_shop_filters, ["EShopFilterSpiritDamage"]);
    }

    #[test]
    fn empty_or_missing_shop_filter_overrides_are_empty() {
        // Most items store `m_eAdditionalShopFilters = ""`.
        for fields in ["", "m_eAdditionalShopFilters = \"\"\nm_eDisableShopFilters = \"\""] {
            let parsed = with_filters(fields);
            assert!(parsed.shop_filters.is_empty(), "{fields:?}");
            assert!(parsed.disabled_shop_filters.is_empty(), "{fields:?}");
        }
    }

    struct FakeInstall(Mutex<Option<PathBuf>>);

    impl Install for FakeInstall {
        fn citadel_dir(&self) -> Option<PathBuf> {
            self.0.lock().unwrap().clone()
        }
    }

    struct FakeSource {
        reads: Arc<AtomicUsize>,
        abilities: Option<String>,
    }

    impl ShopSource for FakeSource {
        fn read(&self, _citadel_dir: &Path, path: &str) -> Result<Document, String> {
            self.reads.fetch_add(1, Ordering::Relaxed);
            let text = match path {
                ABILITIES_PATH => self.abilities.clone().ok_or("no archive")?,
                GENERIC_DATA_PATH => GENERIC.to_string(),
                other => return Err(format!("unexpected path {other}")),
            };
            Document::from_text(&text).map_err(|e| e.to_string())
        }
    }

    fn temp_install(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-gamedata-shop-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("pak01_dir.vpk"), b"not a real archive").unwrap();
        dir
    }

    fn one_item_abilities() -> String {
        format!(
            "{{ upgrade_improved_spirit = {} }}",
            item("m_eItemSlotType = \"EItemSlotType_Tech\"\nm_iItemTier = \"EModTier_1\"")
        )
    }

    fn vdata(dir: Option<&Path>, abilities: Option<String>) -> (ShopVdata<FakeInstall, FakeSource>, Arc<AtomicUsize>) {
        let reads = Arc::new(AtomicUsize::new(0));
        let install = FakeInstall(Mutex::new(dir.map(Path::to_path_buf)));
        (ShopVdata::new(install, FakeSource { reads: Arc::clone(&reads), abilities }), reads)
    }

    #[test]
    fn the_items_are_read_once_until_the_archive_changes() {
        let dir = temp_install("stamp");
        let (data, reads) = vdata(Some(&dir), Some(one_item_abilities()));
        let first = data.items().expect("the fake install has items");
        assert_eq!(first.len(), 1);
        assert!(Arc::ptr_eq(&first, &data.items().unwrap()));
        assert_eq!(reads.load(Ordering::Relaxed), 2);

        let file = fs::OpenOptions::new().write(true).open(dir.join("pak01_dir.vpk")).unwrap();
        file.set_modified(SystemTime::now() + std::time::Duration::from_secs(60)).unwrap();
        drop(file);
        data.items();
        assert_eq!(reads.load(Ordering::Relaxed), 4);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn without_an_install_there_are_no_items_and_nothing_is_read() {
        let (data, reads) = vdata(None, Some(one_item_abilities()));
        assert_eq!(data.items(), None);
        assert_eq!(reads.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn a_failed_read_is_not_retried_for_the_same_build() {
        let dir = temp_install("failed");
        let (data, reads) = vdata(Some(&dir), None);
        assert_eq!(data.items(), None);
        assert_eq!(data.items(), None);
        assert_eq!(reads.load(Ordering::Relaxed), 1);
        fs::remove_dir_all(dir).ok();
    }

    fn stat_abilities() -> String {
        format!(
            "{{ upgrade_health = {} }}",
            item(
                "m_eItemSlotType = \"EItemSlotType_Armor\"\nm_iItemTier = \"EModTier_1\"\n\
                 m_mapAbilityProperties = { BonusHealth = { m_strValue = \"210\"\n\
                 m_eProvidedPropertyType = \"MODIFIER_VALUE_HEALTH_MAX\" } }\n\
                 m_vecTooltipSectionInfo = [ { m_eAbilitySectionType = \"EArea_Innate\"\n\
                 m_vecSectionAttributes = [ { m_vecElevatedAbilityProperties = [ \"BonusHealth\" ] } ] } ]",
            )
        )
    }

    fn write_labels(dir: &Path, language: &str, label: &str) {
        let path = dir.join(deadlock_data::LocalizationFile::relative_path("citadel_attributes", language));
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, format!("\"lang\" {{ \"Tokens\" {{\n\"BonusHealth_label\" \"{label}\"\n}} }}")).unwrap();
    }

    #[test]
    fn item_stats_are_labelled_in_the_game_language_from_one_read() {
        let dir = temp_install("stats");
        write_labels(&dir, "english", "Bonus Health");
        write_labels(&dir, "german", "Bonuslebenspunkte");
        let (data, reads) = vdata(Some(&dir), Some(stat_abilities()));
        let german = data.item_stats("de").expect("the fake install has stats");
        assert_eq!(german.len(), 1);
        assert_eq!(german[0].item_id, ability_id("upgrade_health"));
        assert_eq!((german[0].stats[0].value, german[0].stats[0].label.as_str()), (210.0, "Bonuslebenspunkte"));
        assert_eq!(data.item_stats("en").unwrap()[0].stats[0].label, "Bonus Health");
        assert!(Arc::ptr_eq(&german, &data.item_stats("de-AT").unwrap()));
        assert!(data.items().is_some());
        assert_eq!(reads.load(Ordering::Relaxed), 2);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn without_an_install_there_are_no_item_stats() {
        let (data, reads) = vdata(None, Some(stat_abilities()));
        assert_eq!(data.item_stats("en"), None);
        assert_eq!(reads.load(Ordering::Relaxed), 0);
    }

    fn ability_abilities() -> String {
        "{ citadel_ability_lightning_ball = { m_eAbilityType = \"EAbilityType_Signature\"
            m_mapAbilityProperties = { AbilityCooldown = { m_strValue = \"26\" } }
            m_AbilityTooltipDetails = { m_vecAbilityInfoSections = [ ] } } }"
            .into()
    }

    fn write_hero_tokens(dir: &Path, language: &str, name: &str) {
        let path = dir.join(deadlock_data::LocalizationFile::relative_path("citadel_heroes", language));
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, format!("\"lang\" {{ \"Tokens\" {{\n\"citadel_ability_lightning_ball\" \"{name}\"\n}} }}"))
            .unwrap();
    }

    #[test]
    fn ability_tooltips_are_named_in_the_game_language_from_the_same_read() {
        let dir = temp_install("abilities");
        write_hero_tokens(&dir, "english", "Lightning Ball");
        write_hero_tokens(&dir, "german", "Blitzkugel");
        let (data, reads) = vdata(Some(&dir), Some(ability_abilities()));
        let german = data.ability_tooltips("de").expect("the fake install has abilities");
        assert_eq!(german.len(), 1);
        assert_eq!(
            (german[0].ability_id, german[0].name.as_str()),
            (ability_id("citadel_ability_lightning_ball"), "Blitzkugel")
        );
        assert_eq!(data.ability_tooltips("en").unwrap()[0].name, "Lightning Ball");
        assert!(Arc::ptr_eq(&german, &data.ability_tooltips("de-AT").unwrap()));
        data.item_stats("en");
        assert_eq!(reads.load(Ordering::Relaxed), 2);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn without_an_install_there_are_no_ability_tooltips() {
        let (data, reads) = vdata(None, Some(ability_abilities()));
        assert_eq!(data.ability_tooltips("en"), None);
        assert_eq!(reads.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn a_new_install_is_picked_up_after_none() {
        let dir = temp_install("late");
        let (data, _) = vdata(None, Some(one_item_abilities()));
        assert_eq!(data.items(), None);
        *data.install.0.lock().unwrap() = Some(dir.clone());
        assert!(data.items().is_some());
        fs::remove_dir_all(dir).ok();
    }
}
