use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex, OnceLock, Weak};
use std::time::UNIX_EPOCH;

use deadlock_data::art::{Art, ArtArchive, HeroArtKind, Image, ItemArtKind, MinimapArtKind, RankArtKind};
use serde::{Deserialize, Serialize};
use source2::vpk::Vpk;
use ts_rs::TS;

use crate::build_tags::{self, BuildTag, BUILD_TAG_KEYS};
use crate::catalog::{archive_stamp, HeroEntry, Install, SteamInstall};
use crate::property_icons::{
    icon_rules, inline_attribute_rules, resolve_washes, IconRule, PropertyIconArt, BASE_STYLESHEET, STYLESHEET,
};
use crate::ui_art;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeroImage {
    Sm,
    Card,
    Mm,
    /// The card with the hero smug, as the game shows it after a win.
    CardGloat,
    /// The card with the hero battered, as the game shows it at low health.
    CardCritical,
}

impl HeroImage {
    /// The images `hero_art` serves, in its field order. The mood cards are fetched one by one instead.
    const ALL: [HeroImage; 3] = [HeroImage::Sm, HeroImage::Card, HeroImage::Mm];

    fn suffix(self) -> &'static str {
        match self {
            HeroImage::Sm => "sm",
            HeroImage::Card => "card",
            HeroImage::Mm => "mm",
            HeroImage::CardGloat => "card_gloat",
            HeroImage::CardCritical => "card_critical",
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

/// A fixed image the game's shop draws around and beside item cards. The set is closed on purpose: the
/// frontend names images by variant, so no free-form path reaches the archive or the file system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ShopUiImage {
    /// `#CardBacker` per slot and tier (`.ModTier<n>.isWeapon|isArmor|isTech`); tier 4 is the dark one.
    CardBackerWeaponT1,
    CardBackerWeaponT2,
    CardBackerWeaponT3,
    CardBackerWeaponT4,
    CardBackerVitalityT1,
    CardBackerVitalityT2,
    CardBackerVitalityT3,
    CardBackerVitalityT4,
    CardBackerSpiritT1,
    CardBackerSpiritT2,
    CardBackerSpiritT3,
    CardBackerSpiritT4,
    /// `#ModCard` background, drawn under the slot backer.
    CardBase,
    /// `#ModCard` opacity mask.
    CardBaseMask,
    /// `.paperTexture`, multiplied over the card; the game cycles 1-3 by child index (`3n+k`).
    #[serde(rename = "paper_texture_1")]
    PaperTexture1,
    #[serde(rename = "paper_texture_2")]
    PaperTexture2,
    #[serde(rename = "paper_texture_3")]
    PaperTexture3,
    /// `#ModIconImage` opacity masks on passive items in the shop lists (`#ShopModsContainer`, `3n+k`).
    #[serde(rename = "icon_mask_1")]
    IconMask1,
    #[serde(rename = "icon_mask_2")]
    IconMask2,
    #[serde(rename = "icon_mask_3")]
    IconMask3,
    /// `.tier_bg`, a white corner washed with the slot's bright colour.
    TierCorner,
    /// `#mod_tier_label` digits, washed `offBlack`.
    #[serde(rename = "tier_number_1")]
    TierNumber1,
    #[serde(rename = "tier_number_2")]
    TierNumber2,
    #[serde(rename = "tier_number_3")]
    TierNumber3,
    #[serde(rename = "tier_number_4")]
    TierNumber4,
    /// `.PopularityContainer .thumb_icon`, washed `armorColor`.
    PopularThumb,
    /// `.PopularItemPhase.Early|Mid|Late`.
    PhaseEarly,
    PhaseMid,
    PhaseLate,
    /// `.modStatusCol .recommended_icon`.
    RecommendedStar,
    /// The shop's item-type filter buttons (`#ItemCategoryFilters .Weapon|Spirit|Vitality .CategoryIcon`).
    SlotWeapon,
    SlotSpirit,
    SlotVitality,
    /// The six stat-category tabs (`.FilterCategory.<Name> .top_filter_img`).
    FilterPhysical,
    FilterSpirit,
    FilterDefense,
    FilterMobility,
    FilterDisruption,
    FilterMisc,
    /// `.top_filter_bg` of the hovered or open stat-category tab, washed with its colour.
    FilterTabFill,
    /// `#ModTooltipContainer` paper per slot (`.WeaponMod|ArmorMod|TechMod`), stretched over the whole tooltip.
    TooltipBackerWeapon,
    TooltipBackerVitality,
    TooltipBackerSpirit,
    /// The paper's opacity mask (its torn edge).
    TooltipBackerWeaponMask,
    TooltipBackerVitalityMask,
    TooltipBackerSpiritMask,
    /// The paper of a corrupted item (`.IsCorrupted`).
    TooltipBackerWeaponCorrupted,
    TooltipBackerVitalityCorrupted,
    TooltipBackerSpiritCorrupted,
    /// `.HeaderContainer` painted band behind the item name and cost.
    TooltipHeaderWeapon,
    TooltipHeaderVitality,
    TooltipHeaderSpirit,
    /// The band of a corrupted weapon item; the game has no corrupted band for the other slots.
    TooltipHeaderWeaponCorrupted,
    /// `.AffectedAbilitiesHeader` band over the abilities an item modifies.
    TooltipModifiesHeaderWeapon,
    TooltipModifiesHeaderVitality,
    TooltipModifiesHeaderSpirit,
    /// The background behind the abilities an item modifies.
    TooltipModifiesBgWeapon,
    TooltipModifiesBgVitality,
    TooltipModifiesBgSpirit,
    /// `.CooldownImage` in a section header.
    CooldownLarge,
    /// `.ChargeUpImage` in a section header.
    ChargeUpLarge,
    /// The souls glyph beside a cost.
    SoulIcon,
    /// Key stat arrows; the game calls weapon `courage` and vitality `fortitude`.
    KeystatArrowWeapon,
    KeystatArrowVitality,
    KeystatArrowSpirit,
    KeystatArrowMelee,
    KeystatArrowBoon,
    /// Arrows beside a value an item changes, by how much it changes.
    #[serde(rename = "modified_arrow_1")]
    ModifiedArrow1,
    #[serde(rename = "modified_arrow_2")]
    ModifiedArrow2,
    #[serde(rename = "modified_arrow_3")]
    ModifiedArrow3,
    ArrowDelta,
    /// `.ModPurchasedCheck` on an owned item.
    PurchasedCheck,
    Checkmark,
    /// The fifth `#mod_tier_label` digit.
    #[serde(rename = "tier_number_5")]
    TierNumber5,
    /// Hero ability tooltip `.TexturePanel`.
    AbilityTooltipBg,
    /// The texture layered over the ability tooltip.
    AbilityTooltipTexture,
    /// Ability upgrade cards (`.abilityUpgradeContent`) by state.
    AbilityUpgradeRectDefault,
    AbilityUpgradeRectCantAfford,
    AbilityUpgradeRectAvailable,
    /// Ability upgrade cards in the radial ability details, by state.
    AbilityUpgradeBackerDefault,
    AbilityUpgradeBackerCantAfford,
    AbilityUpgradeBackerAvailable,
    AbilityUpgradeBackerOwned,
    /// `.abilityPointBolt`, the ability point cost mark.
    AbilityPoint,
    /// The check on a bought ability upgrade.
    AbilityUpgradeCheck,
    /// Slot stat marks (`#TierBonusStatImage`, `.ScalingStatImage`), e.g. beside a value that scales with Spirit Power.
    StatIconWeapon,
    StatIconVitality,
    StatIconSpirit,
}

impl ShopUiImage {
    pub const ALL: [ShopUiImage; 88] = [
        ShopUiImage::CardBackerWeaponT1,
        ShopUiImage::CardBackerWeaponT2,
        ShopUiImage::CardBackerWeaponT3,
        ShopUiImage::CardBackerWeaponT4,
        ShopUiImage::CardBackerVitalityT1,
        ShopUiImage::CardBackerVitalityT2,
        ShopUiImage::CardBackerVitalityT3,
        ShopUiImage::CardBackerVitalityT4,
        ShopUiImage::CardBackerSpiritT1,
        ShopUiImage::CardBackerSpiritT2,
        ShopUiImage::CardBackerSpiritT3,
        ShopUiImage::CardBackerSpiritT4,
        ShopUiImage::CardBase,
        ShopUiImage::CardBaseMask,
        ShopUiImage::PaperTexture1,
        ShopUiImage::PaperTexture2,
        ShopUiImage::PaperTexture3,
        ShopUiImage::IconMask1,
        ShopUiImage::IconMask2,
        ShopUiImage::IconMask3,
        ShopUiImage::TierCorner,
        ShopUiImage::TierNumber1,
        ShopUiImage::TierNumber2,
        ShopUiImage::TierNumber3,
        ShopUiImage::TierNumber4,
        ShopUiImage::PopularThumb,
        ShopUiImage::PhaseEarly,
        ShopUiImage::PhaseMid,
        ShopUiImage::PhaseLate,
        ShopUiImage::RecommendedStar,
        ShopUiImage::SlotWeapon,
        ShopUiImage::SlotSpirit,
        ShopUiImage::SlotVitality,
        ShopUiImage::FilterPhysical,
        ShopUiImage::FilterSpirit,
        ShopUiImage::FilterDefense,
        ShopUiImage::FilterMobility,
        ShopUiImage::FilterDisruption,
        ShopUiImage::FilterMisc,
        ShopUiImage::FilterTabFill,
        ShopUiImage::TooltipBackerWeapon,
        ShopUiImage::TooltipBackerVitality,
        ShopUiImage::TooltipBackerSpirit,
        ShopUiImage::TooltipBackerWeaponMask,
        ShopUiImage::TooltipBackerVitalityMask,
        ShopUiImage::TooltipBackerSpiritMask,
        ShopUiImage::TooltipBackerWeaponCorrupted,
        ShopUiImage::TooltipBackerVitalityCorrupted,
        ShopUiImage::TooltipBackerSpiritCorrupted,
        ShopUiImage::TooltipHeaderWeapon,
        ShopUiImage::TooltipHeaderVitality,
        ShopUiImage::TooltipHeaderSpirit,
        ShopUiImage::TooltipHeaderWeaponCorrupted,
        ShopUiImage::TooltipModifiesHeaderWeapon,
        ShopUiImage::TooltipModifiesHeaderVitality,
        ShopUiImage::TooltipModifiesHeaderSpirit,
        ShopUiImage::TooltipModifiesBgWeapon,
        ShopUiImage::TooltipModifiesBgVitality,
        ShopUiImage::TooltipModifiesBgSpirit,
        ShopUiImage::CooldownLarge,
        ShopUiImage::ChargeUpLarge,
        ShopUiImage::SoulIcon,
        ShopUiImage::KeystatArrowWeapon,
        ShopUiImage::KeystatArrowVitality,
        ShopUiImage::KeystatArrowSpirit,
        ShopUiImage::KeystatArrowMelee,
        ShopUiImage::KeystatArrowBoon,
        ShopUiImage::ModifiedArrow1,
        ShopUiImage::ModifiedArrow2,
        ShopUiImage::ModifiedArrow3,
        ShopUiImage::ArrowDelta,
        ShopUiImage::PurchasedCheck,
        ShopUiImage::Checkmark,
        ShopUiImage::TierNumber5,
        ShopUiImage::AbilityTooltipBg,
        ShopUiImage::AbilityTooltipTexture,
        ShopUiImage::AbilityUpgradeRectDefault,
        ShopUiImage::AbilityUpgradeRectCantAfford,
        ShopUiImage::AbilityUpgradeRectAvailable,
        ShopUiImage::AbilityUpgradeBackerDefault,
        ShopUiImage::AbilityUpgradeBackerCantAfford,
        ShopUiImage::AbilityUpgradeBackerAvailable,
        ShopUiImage::AbilityUpgradeBackerOwned,
        ShopUiImage::AbilityPoint,
        ShopUiImage::AbilityUpgradeCheck,
        ShopUiImage::StatIconWeapon,
        ShopUiImage::StatIconVitality,
        ShopUiImage::StatIconSpirit,
    ];

    /// The wire name, also the cache file stem.
    pub fn key(self) -> &'static str {
        self.entry().0
    }

    /// The compiled file in `pak01_dir.vpk`, as the shop's stylesheets reference it.
    /// The tooltip backgrounds: the largest images by far, so the slowest to decode.
    fn large(self) -> bool {
        matches!(
            self,
            ShopUiImage::TooltipBackerWeapon
                | ShopUiImage::TooltipBackerVitality
                | ShopUiImage::TooltipBackerSpirit
                | ShopUiImage::TooltipBackerWeaponCorrupted
                | ShopUiImage::TooltipBackerVitalityCorrupted
                | ShopUiImage::TooltipBackerSpiritCorrupted
                | ShopUiImage::TooltipModifiesBgWeapon
                | ShopUiImage::TooltipModifiesBgVitality
                | ShopUiImage::TooltipModifiesBgSpirit
        )
    }

    pub fn compiled_path(self) -> &'static str {
        self.entry().1
    }

    fn entry(self) -> (&'static str, &'static str) {
        macro_rules! cards {
            ($file:literal) => {
                concat!("panorama/images/shop/catalog/cards/", $file)
            };
        }
        macro_rules! images {
            ($file:literal) => {
                concat!("panorama/images/", $file)
            };
        }
        macro_rules! filters {
            ($file:literal) => {
                concat!("panorama/images/shop/catalog/filters/", $file)
            };
        }
        match self {
            ShopUiImage::CardBackerWeaponT1 => ("card_backer_weapon_t1", cards!("card_backer_weapon_t1_psd.vtex_c")),
            ShopUiImage::CardBackerWeaponT2 => ("card_backer_weapon_t2", cards!("card_backer_weapon_t2_psd.vtex_c")),
            ShopUiImage::CardBackerWeaponT3 => ("card_backer_weapon_t3", cards!("card_backer_weapon_t3_psd.vtex_c")),
            ShopUiImage::CardBackerWeaponT4 => ("card_backer_weapon_t4", cards!("card_backer_weapon_t4_psd.vtex_c")),
            ShopUiImage::CardBackerVitalityT1 => {
                ("card_backer_vitality_t1", cards!("card_backer_vitality_t1_psd.vtex_c"))
            }
            ShopUiImage::CardBackerVitalityT2 => {
                ("card_backer_vitality_t2", cards!("card_backer_vitality_t2_psd.vtex_c"))
            }
            ShopUiImage::CardBackerVitalityT3 => {
                ("card_backer_vitality_t3", cards!("card_backer_vitality_t3_psd.vtex_c"))
            }
            ShopUiImage::CardBackerVitalityT4 => {
                ("card_backer_vitality_t4", cards!("card_backer_vitality_t4_psd.vtex_c"))
            }
            ShopUiImage::CardBackerSpiritT1 => ("card_backer_spirit_t1", cards!("card_backer_spirit_t1_psd.vtex_c")),
            ShopUiImage::CardBackerSpiritT2 => ("card_backer_spirit_t2", cards!("card_backer_spirit_t2_psd.vtex_c")),
            ShopUiImage::CardBackerSpiritT3 => ("card_backer_spirit_t3", cards!("card_backer_spirit_t3_psd.vtex_c")),
            ShopUiImage::CardBackerSpiritT4 => ("card_backer_spirit_t4", cards!("card_backer_spirit_t4_psd.vtex_c")),
            ShopUiImage::CardBase => ("card_base", "panorama/images/shop/card_backer_psd.vtex_c"),
            ShopUiImage::CardBaseMask => ("card_base_mask", "panorama/images/shop/card_backer_png.vtex_c"),
            ShopUiImage::PaperTexture1 => ("paper_texture_1", cards!("shopitem_papertexture01_psd.vtex_c")),
            ShopUiImage::PaperTexture2 => ("paper_texture_2", cards!("shopitem_papertexture02_psd.vtex_c")),
            ShopUiImage::PaperTexture3 => ("paper_texture_3", cards!("shopitem_papertexture03_psd.vtex_c")),
            ShopUiImage::IconMask1 => ("icon_mask_1", cards!("icon_mask01_psd.vtex_c")),
            ShopUiImage::IconMask2 => ("icon_mask_2", cards!("icon_mask02_psd.vtex_c")),
            ShopUiImage::IconMask3 => ("icon_mask_3", cards!("icon_mask03_psd.vtex_c")),
            ShopUiImage::TierCorner => ("tier_corner", "panorama/images/shop/tier_corner_cap.vsvg_c"),
            ShopUiImage::TierNumber1 => ("tier_number_1", "panorama/images/upgrades/tier_numbers_small_01.vsvg_c"),
            ShopUiImage::TierNumber2 => ("tier_number_2", "panorama/images/upgrades/tier_numbers_small_02.vsvg_c"),
            ShopUiImage::TierNumber3 => ("tier_number_3", "panorama/images/upgrades/tier_numbers_small_03.vsvg_c"),
            ShopUiImage::TierNumber4 => ("tier_number_4", "panorama/images/upgrades/tier_numbers_small_04.vsvg_c"),
            ShopUiImage::PopularThumb => ("popular_thumb", filters!("icon_recommend_up.vsvg_c")),
            ShopUiImage::PhaseEarly => ("phase_early", filters!("icon_early_game_png.vtex_c")),
            ShopUiImage::PhaseMid => ("phase_mid", filters!("icon_mid_game_png.vtex_c")),
            ShopUiImage::PhaseLate => ("phase_late", filters!("icon_late_game_png.vtex_c")),
            ShopUiImage::RecommendedStar => {
                ("recommended_star", "panorama/images/upgrades/recommended_star_psd.vtex_c")
            }
            ShopUiImage::SlotWeapon => ("slot_weapon", "panorama/images/hud/core/core_weapon_icon_psd.vtex_c"),
            ShopUiImage::SlotSpirit => ("slot_spirit", "panorama/images/hud/core/core_spirit_icon_psd.vtex_c"),
            ShopUiImage::SlotVitality => ("slot_vitality", "panorama/images/hud/core/core_armor_icon_psd.vtex_c"),
            ShopUiImage::FilterPhysical => ("filter_physical", filters!("sigil_physical_psd.vtex_c")),
            ShopUiImage::FilterSpirit => ("filter_spirit", filters!("sigil_magic_psd.vtex_c")),
            ShopUiImage::FilterDefense => ("filter_defense", filters!("sigil_defense_psd.vtex_c")),
            ShopUiImage::FilterMobility => ("filter_mobility", filters!("sigil_mobility_psd.vtex_c")),
            ShopUiImage::FilterDisruption => ("filter_disruption", filters!("sigil_disruption_psd.vtex_c")),
            ShopUiImage::FilterMisc => ("filter_misc", filters!("sigil_misc_psd.vtex_c")),
            ShopUiImage::FilterTabFill => ("filter_tab_fill", filters!("top_level_filter_fill.vsvg_c")),
            ShopUiImage::TooltipBackerWeapon => {
                ("tooltip_backer_weapon", images!("tooltips/items/tooltip_backer_weapon_psd.vtex_c"))
            }
            ShopUiImage::TooltipBackerVitality => {
                ("tooltip_backer_vitality", images!("tooltips/items/tooltip_backer_vitality_psd.vtex_c"))
            }
            ShopUiImage::TooltipBackerSpirit => {
                ("tooltip_backer_spirit", images!("tooltips/items/tooltip_backer_spirit_psd.vtex_c"))
            }
            ShopUiImage::TooltipBackerWeaponMask => {
                ("tooltip_backer_weapon_mask", images!("tooltips/items/tooltip_backer_weapon_mask_psd.vtex_c"))
            }
            ShopUiImage::TooltipBackerVitalityMask => {
                ("tooltip_backer_vitality_mask", images!("tooltips/items/tooltip_backer_vitality_mask_psd.vtex_c"))
            }
            ShopUiImage::TooltipBackerSpiritMask => {
                ("tooltip_backer_spirit_mask", images!("tooltips/items/tooltip_backer_spirit_mask_psd.vtex_c"))
            }
            ShopUiImage::TooltipBackerWeaponCorrupted => (
                "tooltip_backer_weapon_corrupted",
                images!("tooltips/items/tooltip_backer_weapon_corrupted_psd.vtex_c"),
            ),
            ShopUiImage::TooltipBackerVitalityCorrupted => (
                "tooltip_backer_vitality_corrupted",
                images!("tooltips/items/tooltip_backer_vitality_corrupted_psd.vtex_c"),
            ),
            ShopUiImage::TooltipBackerSpiritCorrupted => (
                "tooltip_backer_spirit_corrupted",
                images!("tooltips/items/tooltip_backer_spirit_corrupted_psd.vtex_c"),
            ),
            ShopUiImage::TooltipHeaderWeapon => {
                ("tooltip_header_weapon", images!("shop/catalog/catalog_tooltip_header_weapon_psd.vtex_c"))
            }
            ShopUiImage::TooltipHeaderVitality => {
                ("tooltip_header_vitality", images!("shop/catalog/catalog_tooltip_header_vitality_psd.vtex_c"))
            }
            ShopUiImage::TooltipHeaderSpirit => {
                ("tooltip_header_spirit", images!("shop/catalog/catalog_tooltip_header_spirit_psd.vtex_c"))
            }
            ShopUiImage::TooltipHeaderWeaponCorrupted => (
                "tooltip_header_weapon_corrupted",
                images!("shop/catalog/catalog_tooltip_header_weapon_corrupted_psd.vtex_c"),
            ),
            ShopUiImage::TooltipModifiesHeaderWeapon => (
                "tooltip_modifies_header_weapon",
                images!("shop/catalog/catalog_tooltip_modifies_header_weapon_psd.vtex_c"),
            ),
            ShopUiImage::TooltipModifiesHeaderVitality => (
                "tooltip_modifies_header_vitality",
                images!("shop/catalog/catalog_tooltip_modifies_header_vitality_psd.vtex_c"),
            ),
            ShopUiImage::TooltipModifiesHeaderSpirit => (
                "tooltip_modifies_header_spirit",
                images!("shop/catalog/catalog_tooltip_modifies_header_spirit_psd.vtex_c"),
            ),
            ShopUiImage::TooltipModifiesBgWeapon => {
                ("tooltip_modifies_bg_weapon", images!("shop/catalog/catalog_tooltip_bg_modifies_weapon_psd.vtex_c"))
            }
            ShopUiImage::TooltipModifiesBgVitality => (
                "tooltip_modifies_bg_vitality",
                images!("shop/catalog/catalog_tooltip_bg_modifies_vitality_psd.vtex_c"),
            ),
            ShopUiImage::TooltipModifiesBgSpirit => {
                ("tooltip_modifies_bg_spirit", images!("shop/catalog/catalog_tooltip_bg_modifies_spirit_psd.vtex_c"))
            }
            ShopUiImage::CooldownLarge => ("cooldown_large", images!("upgrades/property_cooldown_large_psd.vtex_c")),
            ShopUiImage::ChargeUpLarge => ("charge_up_large", images!("upgrades/property_chargeup_large_psd.vtex_c")),
            ShopUiImage::SoulIcon => ("soul_icon", images!("hud/icons/icon_soul.vsvg_c")),
            ShopUiImage::KeystatArrowWeapon => {
                ("keystat_arrow_weapon", images!("shop/keystat_courage_arrow_png.vtex_c"))
            }
            ShopUiImage::KeystatArrowVitality => {
                ("keystat_arrow_vitality", images!("shop/keystat_fortitude_arrow_png.vtex_c"))
            }
            ShopUiImage::KeystatArrowSpirit => {
                ("keystat_arrow_spirit", images!("shop/keystat_spirit_arrow_png.vtex_c"))
            }
            ShopUiImage::KeystatArrowMelee => ("keystat_arrow_melee", images!("shop/keystat_melee_arrow_png.vtex_c")),
            ShopUiImage::KeystatArrowBoon => ("keystat_arrow_boon", images!("shop/keystat_boon_arrow_png.vtex_c")),
            ShopUiImage::ModifiedArrow1 => ("modified_arrow_1", images!("shop/tooltip_modified_arrow_1.vsvg_c")),
            ShopUiImage::ModifiedArrow2 => ("modified_arrow_2", images!("shop/tooltip_modified_arrow_2.vsvg_c")),
            ShopUiImage::ModifiedArrow3 => ("modified_arrow_3", images!("shop/tooltip_modified_arrow_3.vsvg_c")),
            ShopUiImage::ArrowDelta => ("arrow_delta", images!("upgrades/arrow_delta_psd.vtex_c")),
            ShopUiImage::PurchasedCheck => ("purchased_check", images!("shop/purchased_check_png.vtex_c")),
            ShopUiImage::Checkmark => ("checkmark", images!("icons/icon_checkmark.vsvg_c")),
            ShopUiImage::TierNumber5 => ("tier_number_5", images!("upgrades/tier_numbers_small_05.vsvg_c")),
            ShopUiImage::AbilityTooltipBg => {
                ("ability_tooltip_bg", images!("tooltips/ability/ability_tooltip_bg_png.vtex_c"))
            }
            ShopUiImage::AbilityTooltipTexture => {
                ("ability_tooltip_texture", images!("tooltips/ability/ability_texture_layer_png.vtex_c"))
            }
            ShopUiImage::AbilityUpgradeRectDefault => {
                ("ability_upgrade_rect_default", images!("tooltips/ability/ap_rect_default_png.vtex_c"))
            }
            ShopUiImage::AbilityUpgradeRectCantAfford => {
                ("ability_upgrade_rect_cant_afford", images!("tooltips/ability/ap_rect_cant_afford_png.vtex_c"))
            }
            ShopUiImage::AbilityUpgradeRectAvailable => {
                ("ability_upgrade_rect_available", images!("tooltips/ability/ap_rect_available_png.vtex_c"))
            }
            ShopUiImage::AbilityUpgradeBackerDefault => {
                ("ability_upgrade_backer_default", images!("tooltips/ability/ap_backer_default_png.vtex_c"))
            }
            ShopUiImage::AbilityUpgradeBackerCantAfford => {
                ("ability_upgrade_backer_cant_afford", images!("tooltips/ability/ap_backer_cantafford_png.vtex_c"))
            }
            ShopUiImage::AbilityUpgradeBackerAvailable => {
                ("ability_upgrade_backer_available", images!("tooltips/ability/ap_backer_available_png.vtex_c"))
            }
            ShopUiImage::AbilityUpgradeBackerOwned => {
                ("ability_upgrade_backer_owned", images!("tooltips/ability/ap_backer_owned_png.vtex_c"))
            }
            ShopUiImage::AbilityPoint => ("ability_point", images!("hud/ap_icon.vsvg_c")),
            ShopUiImage::AbilityUpgradeCheck => {
                ("ability_upgrade_check", images!("hud/ability_upgrade_check_psd.vtex_c"))
            }
            ShopUiImage::StatIconWeapon => ("stat_icon_weapon", images!("hud/core/icon_courage.vsvg_c")),
            ShopUiImage::StatIconVitality => ("stat_icon_vitality", images!("hud/core/icon_fortitude.vsvg_c")),
            ShopUiImage::StatIconSpirit => ("stat_icon_spirit", images!("hud/core/icon_spirit.vsvg_c")),
        }
    }
}

/// A local file for a shop UI image: PNG for a texture, SVG for a vector image.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ShopUiArt {
    pub image: ShopUiImage,
    pub path: String,
}

/// Most class names one `ability_art` / `item_art` call decodes; the rest are ignored.
pub const MAX_CLASS_BATCH: usize = 200;

/// Why an `ArtSource` call produced nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Miss {
    /// The archive lacks the file or its data will not decode; asking again gives the same answer
    /// until the game build changes.
    Absent,
    /// A read or write failed in a way that can pass, such as a file held open by another program.
    Transient,
}

/// Where decoded images come from. Each `write_*` returns `Ok` once `dest` holds a complete PNG.
pub trait ArtSource: Send + Sync + 'static {
    fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> Result<(), Miss>;
    /// Writes the hero's backdrop, a half-size PNG of the game's 4096x2312 art. A separate call because
    /// decoding it costs far more than the other hero images together.
    fn write_backdrop(&self, _class_name: &str, _dest: &Path) -> Result<(), Miss> {
        Err(Miss::Absent)
    }
    fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> Result<(), Miss>;
    fn write_ability(&self, class_name: &str, dest: &Path) -> Result<(), Miss>;
    fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> Result<(), Miss>;
    fn write_minimap(&self, dest: &Path) -> Result<(), Miss>;
    fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> Result<(), Miss>;
    /// Writes the browser-ready form of a compiled Panorama image named by its archive path.
    fn write_ui(&self, compiled_path: &str, dest: &Path) -> Result<(), Miss>;
    /// The CSS source of a compiled Panorama stylesheet.
    fn ui_stylesheet(&self, _compiled_path: &str) -> Result<String, Miss> {
        Err(Miss::Absent)
    }
}

/// The game's hero-select stylesheet; each `.hero_<class>` rule names that hero's backdrop texture.
const BACKDROP_STYLESHEET: &str = "panorama/styles/hero_backgrounds/hero_background_default.vcss_c";

struct ArchiveSource {
    art: ArtArchive,
    /// `ArtArchive` keeps its own archive handle private, so UI images need a second one.
    vpk: Vpk,
    /// Backdrop texture per hero class, read from `BACKDROP_STYLESHEET` on first use.
    backdrops: OnceLock<HashMap<String, String>>,
}

impl ArchiveSource {
    fn backdrop_paths(&self) -> Result<&HashMap<String, String>, Miss> {
        if let Some(paths) = self.backdrops.get() {
            return Ok(paths);
        }
        let css = self.ui_stylesheet(BACKDROP_STYLESHEET)?;
        Ok(self.backdrops.get_or_init(|| backdrop_paths(&css)))
    }

    fn read_ui(&self, compiled_path: &str) -> Result<Vec<u8>, Miss> {
        self.vpk.read_path(compiled_path).map_err(|e| {
            log::debug!("no game UI file {compiled_path}: {e}");
            match e {
                source2::vpk::Error::Io { .. } => Miss::Transient,
                _ => Miss::Absent,
            }
        })
    }

    fn write(&self, art: &Art<'_>, dest: &Path, what: &str) -> Result<(), Miss> {
        if !self.art.contains(art) {
            return Err(Miss::Absent);
        }
        self.art.write_png(art, dest).map_err(|e| {
            log::debug!("no local art for {what}: {e}");
            match e {
                deadlock_data::Error::Io { .. } => Miss::Transient,
                _ => Miss::Absent,
            }
        })
    }
}

impl ArtSource for ArchiveSource {
    fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> Result<(), Miss> {
        let kind = match image {
            HeroImage::Sm => HeroArtKind::Sm,
            HeroImage::Card => HeroArtKind::Card,
            HeroImage::Mm => HeroArtKind::Mm,
            HeroImage::CardGloat => HeroArtKind::CardGloat,
            HeroImage::CardCritical => HeroArtKind::CardCritical,
        };
        self.write(&Art::hero(class_name, kind), dest, &format!("{class_name} {}", image.suffix()))
    }

    fn write_backdrop(&self, class_name: &str, dest: &Path) -> Result<(), Miss> {
        let compiled = self.backdrop_paths()?.get(class_name).ok_or(Miss::Absent)?;
        let bytes = self.read_ui(compiled)?;
        let png = ui_art::decoded_image(compiled, &bytes)
            .and_then(|image| downscale_half(&image).to_png().map_err(|e| format!("{compiled}: {e}")))
            .map_err(|e| {
                log::debug!("no local backdrop for {class_name}: {e}");
                Miss::Absent
            })?;
        write_whole(dest, &png).map_err(|e| {
            log::debug!("no local backdrop for {class_name}: {}: {e}", dest.display());
            Miss::Transient
        })
    }

    fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> Result<(), Miss> {
        let kind = match image {
            RankImage::Lg => RankArtKind::Large,
            RankImage::Chalk => RankArtKind::Chalk,
        };
        self.write(&Art::rank(tier, kind), dest, &format!("rank {tier} {}", image.suffix()))
    }

    fn write_ability(&self, class_name: &str, dest: &Path) -> Result<(), Miss> {
        self.write(&Art::ability(class_name), dest, class_name)
    }

    fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> Result<(), Miss> {
        let kind = match image {
            ItemImage::Icon => ItemArtKind::Icon,
            ItemImage::Shop => ItemArtKind::Shop,
        };
        self.write(&Art::item(class_name, kind), dest, &format!("{class_name} {}", image.suffix()))
    }

    fn write_minimap(&self, dest: &Path) -> Result<(), Miss> {
        self.write(&Art::minimap(MinimapArtKind::Mid), dest, "minimap")
    }

    fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> Result<(), Miss> {
        let Ok(kind) = MinimapArtKind::icon(icon.stem()) else { return Err(Miss::Absent) };
        self.write(&Art::minimap(kind), dest, icon.stem())
    }

    fn write_ui(&self, compiled_path: &str, dest: &Path) -> Result<(), Miss> {
        let bytes = self.read_ui(compiled_path)?;
        let file = ui_art::browser_image(compiled_path, &bytes).map_err(|e| {
            log::debug!("no local UI art: {e}");
            Miss::Absent
        })?;
        write_whole(dest, &file).map_err(|e| {
            log::debug!("no local UI art: {}: {e}", dest.display());
            Miss::Transient
        })
    }

    fn ui_stylesheet(&self, compiled_path: &str) -> Result<String, Miss> {
        let bytes = self.read_ui(compiled_path)?;
        ui_art::stylesheet(compiled_path, &bytes).map_err(|e| {
            log::debug!("no game stylesheet: {e}");
            Miss::Absent
        })
    }
}

/// Hero class to compiled backdrop path, from the hero-select stylesheet's
/// `.hero_<class> #CustomHeroBackground #HeroBackground` rules.
fn backdrop_paths(css: &str) -> HashMap<String, String> {
    const SELECTOR: &str = "#CustomHeroBackground #HeroBackground";
    const DIR: &str = "images/heroes/backgrounds/";
    let mut out = HashMap::new();
    for rule in css.split('}') {
        let Some((selector, body)) = rule.split_once('{') else { continue };
        let Some(class) = selector.trim().strip_suffix(SELECTOR).and_then(|c| c.trim().strip_prefix('.')) else {
            continue;
        };
        if !class.starts_with("hero_") || class.contains(char::is_whitespace) {
            continue;
        }
        let Some(file) = body.split_once(DIR).and_then(|(_, rest)| rest.split_once(".vtex")) else { continue };
        out.insert(class.to_string(), format!("panorama/{DIR}{}.vtex_c", file.0));
    }
    out
}

/// Halves each side by averaging 2x2 blocks. Colour is weighted by alpha so the hidden colour of a transparent
/// pixel never bleeds into a cutout's edge. An odd last row or column is dropped.
fn downscale_half(image: &Image) -> Image {
    let (width, height) = ((image.width / 2).max(1), (image.height / 2).max(1));
    let at = |x: u32, y: u32| {
        let i = (y.min(image.height - 1) as usize * image.width as usize + x.min(image.width - 1) as usize) * 4;
        &image.rgba[i..i + 4]
    };
    let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            let block = [at(2 * x, 2 * y), at(2 * x + 1, 2 * y), at(2 * x, 2 * y + 1), at(2 * x + 1, 2 * y + 1)];
            let weight: u32 = block.iter().map(|p| u32::from(p[3])).sum();
            if weight == 0 {
                rgba.extend_from_slice(&[0; 4]);
                continue;
            }
            for channel in 0..3 {
                let sum: u32 = block.iter().map(|p| u32::from(p[channel]) * u32::from(p[3])).sum();
                rgba.push(((sum + weight / 2) / weight) as u8);
            }
            rgba.push(((weight + 2) / 4) as u8);
        }
    }
    Image { width, height, rgba }
}

/// Writes beside `dest` and renames, so a file that exists is always complete.
fn write_whole(dest: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut partial = dest.as_os_str().to_owned();
    partial.push(".part");
    let partial = PathBuf::from(partial);
    std::fs::write(&partial, bytes).and_then(|()| std::fs::rename(&partial, dest)).inspect_err(|_| {
        let _ = std::fs::remove_file(&partial);
    })
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
    /// Only a source that opened is kept: the archive can be locked for a moment by Steam or antivirus.
    source: Option<Arc<dyn ArtSource>>,
    /// Whether this art call already tried to open the archive, so a locked archive costs one attempt per call.
    tried_open: bool,
    /// Whether an open has failed since the source was last opened.
    open_failed: bool,
    failed: HashSet<String>,
    /// The icon stylesheet's rules then the base styles' inline attribute rules, read once per build.
    icon_rules: Option<Vec<IconRule>>,
}

struct Shared<I> {
    install: I,
    root: PathBuf,
    opener: Opener,
    on_change: OnceLock<Box<dyn Fn() + Send + Sync>>,
    warm: OnceLock<mpsc::Sender<()>>,
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    build: Option<Build>,
    /// The fingerprint of the newest build this run has served art from.
    served: Option<String>,
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
    let art = ArtArchive::open(citadel_dir).map_err(|e| log::debug!("game art unavailable: {e}")).ok()?;
    let vpk = Vpk::open(citadel_dir.join(deadlock_data::vdata::ARCHIVE))
        .map_err(|e| log::debug!("game UI art unavailable: {e}"))
        .ok()?;
    Some(Arc::new(ArchiveSource { art, vpk, backdrops: OnceLock::new() }))
}

fn fingerprint(dir: &Path) -> Option<String> {
    let nanos = archive_stamp(dir)?.duration_since(UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{nanos:x}"))
}

fn shop_ui_file_name(image: ShopUiImage) -> String {
    let extension = if ui_art::is_vector(image.compiled_path()) { "svg" } else { "png" };
    format!("ui_{}.{extension}", image.key())
}

/// `panorama/images/icons/properties/range.vsvg_c` is cached as `ui_prop_icons_properties_range.svg`.
fn icon_file_name(compiled: &str) -> Option<String> {
    let extension = if ui_art::is_vector(compiled) { "svg" } else { "png" };
    let stem = compiled.strip_prefix("panorama/images/")?;
    let stem = stem.strip_suffix(".vsvg_c").or_else(|| stem.strip_suffix(".vtex_c"))?.replace('/', "_");
    file_safe(&stem).then(|| format!("ui_prop_{stem}.{extension}"))
}

fn file_safe(class_name: &str) -> bool {
    !class_name.is_empty() && class_name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

impl<I: Install> ArtCache<I> {
    pub fn with_opener(install: I, root: PathBuf, opener: Opener) -> Self {
        Self {
            shared: Arc::new(Shared {
                install,
                root,
                opener,
                on_change: OnceLock::new(),
                warm: OnceLock::new(),
                state: Mutex::default(),
            }),
        }
    }

    /// Calls `f` when an art call finds a game build other than the one already served this run.
    pub fn on_build_change(self, f: impl Fn() + Send + Sync + 'static) -> Self {
        let _ = self.shared.on_change.set(Box::new(f));
        self
    }

    /// Deletes every build directory except the current build's. Files in the store root, such as the
    /// downloaded minimap, are kept because the UI may still show them.
    pub fn release_old_builds(&self) {
        let state = self.shared.state.lock().unwrap_or_else(|e| e.into_inner());
        let Some(keep) = state.served.as_deref() else { return };
        self.remove_entries(|entry| entry.path().is_dir() && entry.file_name().to_string_lossy() != keep);
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
                let [sm, card, mm] = HeroImage::ALL.map(|image| self.ensure_hero(build, build_dir, hero, image));
                if sm.is_some() || card.is_some() || mm.is_some() {
                    out.push(HeroArt { id: hero.id, sm, card, mm });
                }
            }
            out
        })
        .unwrap_or_default()
    }

    /// One hero image, decoded on the first ask. `None` when the hero has none or the game cannot be read.
    pub fn hero_image(&self, hero: &HeroEntry, image: HeroImage) -> Option<String> {
        if !file_safe(&hero.class_name) {
            return None;
        }
        self.with_build(|build, build_dir| self.ensure_hero(build, build_dir, hero, image)).flatten()
    }

    /// The hero's backdrop: a half-size PNG of the game's 4096x2312 hero-coloured silhouette, decoded on the
    /// first ask and kept in the build directory. `None` when the hero has none or the game cannot be read.
    pub fn hero_backdrop(&self, hero: &HeroEntry) -> Option<String> {
        if !file_safe(&hero.class_name) {
            return None;
        }
        self.with_build(|build, build_dir| {
            let name = format!("{}_bg.png", hero.class_name);
            self.ensure(build, build_dir, name, |s, p| s.write_backdrop(&hero.class_name, p))
        })
        .flatten()
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

    /// Local files for every shop UI image, decoding what the cache lacks. Images the game does not have or
    /// that will not decode are left out; this never fails.
    pub fn shop_ui_art(&self) -> Vec<ShopUiArt> {
        self.with_build(|build, build_dir| {
            ShopUiImage::ALL
                .into_iter()
                .filter_map(|image| {
                    let compiled = image.compiled_path();
                    let path =
                        self.ensure(build, build_dir, shop_ui_file_name(image), |s, p| s.write_ui(compiled, p))?;
                    Some(ShopUiArt { image, path })
                })
                .collect()
        })
        .unwrap_or_default()
    }

    /// Decodes the shop UI art and property icons the cache lacks, taking the lock once per image so other
    /// art calls wait for one image at most. Card art comes first and the large tooltip backers last.
    /// Returns how many files it wrote.
    pub fn warm_ui_art(&self) -> usize {
        let rules = self.with_build(|build, _| self.source(build).is_some().then(|| self.icon_rules(build)));
        let Some(rules) = rules.flatten() else { return 0 };
        let shop = |image: ShopUiImage| (shop_ui_file_name(image), image.compiled_path().to_string());
        let (large, small): (Vec<_>, Vec<_>) = ShopUiImage::ALL.into_iter().partition(|i| i.large());
        let icons = rules.into_iter().filter_map(|rule| Some((icon_file_name(&rule.image)?, rule.image)));
        small
            .into_iter()
            .map(shop)
            .chain(icons)
            .chain(large.into_iter().map(shop))
            .filter(|(name, compiled)| self.warm_one(name, compiled))
            .count()
    }

    /// Starts the one thread that runs `warm_ui_art`: now, and again whenever an art call finds a new game
    /// build. `on_ready` runs after each pass that wrote files. A second call does nothing.
    pub fn warm_in_background(&self, on_ready: impl Fn() + Send + 'static) {
        let (tx, rx) = mpsc::channel();
        if self.shared.warm.set(tx.clone()).is_err() {
            return;
        }
        // A weak handle lets the thread end once every cache handle, and so the sender, is gone.
        let shared = Arc::downgrade(&self.shared);
        let spawned = std::thread::Builder::new().name("game-art-warm".into()).spawn(move || {
            while rx.recv().is_ok() {
                while rx.try_recv().is_ok() {}
                let Some(shared) = Weak::upgrade(&shared) else { return };
                if (ArtCache { shared }).warm_ui_art() > 0 {
                    on_ready();
                }
            }
        });
        match spawned {
            Ok(_) => {
                let _ = tx.send(());
            }
            Err(e) => log::warn!("could not start game art warming: {e}"),
        }
    }

    fn warm_one(&self, name: &str, compiled: &str) -> bool {
        self.with_build(|build, build_dir| {
            !build_dir.join(name).is_file()
                && self.ensure(build, build_dir, name.to_string(), |s, p| s.write_ui(compiled, p)).is_some()
        })
        .unwrap_or(false)
    }

    fn icon_rules(&self, build: &mut Build) -> Vec<IconRule> {
        if let Some(rules) = &build.icon_rules {
            return rules.clone();
        }
        let Some(source) = self.source(build) else { return Vec::new() };
        let icons = source.ui_stylesheet(STYLESHEET);
        let base = source.ui_stylesheet(BASE_STYLESHEET);
        let mut rules = icons.as_deref().map(icon_rules).unwrap_or_default();
        if let Ok(base) = &base {
            resolve_washes(&mut rules, base);
            rules.extend(inline_attribute_rules(base));
        }
        if icons != Err(Miss::Transient) && base != Err(Miss::Transient) {
            build.icon_rules = Some(rules.clone());
        }
        rules
    }

    /// Local files for the icons the game's tooltips draw beside properties and status cells, by icon class,
    /// then beside description keywords, by keyword, as the installed game's stylesheets assign them. Images
    /// that will not decode are left out; this never fails.
    pub fn property_icon_art(&self) -> Vec<PropertyIconArt> {
        self.with_build(|build, build_dir| {
            self.icon_rules(build)
                .into_iter()
                .filter_map(|rule| {
                    let name = icon_file_name(&rule.image)?;
                    let path = self.ensure(build, build_dir, name, |s, p| s.write_ui(&rule.image, p))?;
                    Some(PropertyIconArt { class: rule.class, path, wash: rule.wash, color: rule.color })
                })
                .collect()
        })
        .unwrap_or_default()
    }

    /// `tags` with `icon` set to a local SVG of each standard tag's picker icon, decoding what the cache
    /// lacks. A tag without an icon keeps `None`; this never fails.
    pub fn build_tag_icons(&self, tags: &[BuildTag]) -> Vec<BuildTag> {
        let icons = self
            .with_build(|build, build_dir| {
                tags.iter()
                    .map(|tag| {
                        let key = BUILD_TAG_KEYS.iter().find(|k| **k == tag.key)?;
                        let compiled = build_tags::icon_compiled_path(key);
                        self.ensure(build, build_dir, format!("build_tag_{key}.svg"), |s, p| s.write_ui(&compiled, p))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        tags.iter()
            .enumerate()
            .map(|(i, tag)| BuildTag { icon: icons.get(i).cloned().flatten(), ..tag.clone() })
            .collect()
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
        write: impl Fn(&dyn ArtSource, &str, &Path) -> Result<(), Miss>,
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
    ///
    /// The first build of a run evicts every other build. A later build keeps the older directories,
    /// whose paths the UI may still hold, until `release_old_builds`, and fires the change callback.
    fn with_build<R>(&self, f: impl FnOnce(&mut Build, &Path) -> R) -> Option<R> {
        let mut guard = self.shared.state.lock().unwrap_or_else(|e| e.into_inner());
        let state = &mut *guard;
        let dir = self.shared.install.citadel_dir();
        let fingerprint = dir.as_deref().and_then(fingerprint);
        let stale = state.build.as_ref().is_none_or(|b| b.dir != dir || b.fingerprint != fingerprint);
        let mut changed = false;
        if stale {
            if let Some(new) = &fingerprint {
                match &state.served {
                    None => self.remove_entries(|entry| entry.file_name().to_string_lossy() != new.as_str()),
                    Some(served) => changed = served != new,
                }
                state.served = Some(new.clone());
            }
            state.build = Some(Build {
                dir,
                fingerprint,
                source: None,
                tried_open: false,
                open_failed: false,
                failed: HashSet::new(),
                icon_rules: None,
            });
        }
        let build = state.build.as_mut().expect("set above");
        build.tried_open = false;
        let out = build.fingerprint.as_ref().map(|f| self.shared.root.join(f)).map(|build_dir| f(build, &build_dir));
        // A pass that found the archive locked wrote nothing, so warming runs again once it opens.
        let reopened = build.source.is_some() && std::mem::take(&mut build.open_failed);
        // The callback may call back into the cache, so it runs after the lock is released.
        drop(guard);
        if changed || reopened {
            if let Some(warm) = self.shared.warm.get() {
                let _ = warm.send(());
            }
        }
        if changed {
            if let Some(on_change) = self.shared.on_change.get() {
                on_change();
            }
        }
        out
    }

    fn ensure_hero(&self, build: &mut Build, build_dir: &Path, hero: &HeroEntry, image: HeroImage) -> Option<String> {
        let name = format!("{}_{}.png", hero.class_name, image.suffix());
        self.ensure(build, build_dir, name, |s, p| s.write_hero(&hero.class_name, image, p))
    }

    fn ensure(
        &self,
        build: &mut Build,
        build_dir: &Path,
        name: String,
        write: impl FnOnce(&dyn ArtSource, &Path) -> Result<(), Miss>,
    ) -> Option<String> {
        let path = build_dir.join(&name);
        let ready = path.is_file()
            || !build.failed.contains(&name)
                && self.source(build).is_some_and(|s| match write(s.as_ref(), &path) {
                    Ok(()) => true,
                    Err(Miss::Absent) => {
                        build.failed.insert(name);
                        false
                    }
                    Err(Miss::Transient) => false,
                });
        ready.then(|| path.to_string_lossy().into_owned())
    }

    fn source(&self, build: &mut Build) -> Option<Arc<dyn ArtSource>> {
        if build.source.is_none() && !build.tried_open {
            build.tried_open = true;
            build.source = build.dir.as_deref().and_then(|dir| (self.shared.opener)(dir));
            build.open_failed |= build.source.is_none();
        }
        build.source.clone()
    }

    fn remove_entries(&self, remove: impl Fn(&std::fs::DirEntry) -> bool) {
        let Ok(entries) = std::fs::read_dir(&self.shared.root) else { return };
        for entry in entries.flatten() {
            if !remove(&entry) {
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
    use std::sync::{Arc, Mutex, OnceLock};
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
        ui_paths: Mutex<Vec<String>>,
        stylesheet: Option<String>,
        base_stylesheet: Option<String>,
        stylesheet_reads: AtomicUsize,
        ui_delay: std::time::Duration,
        /// Names whose next write fails as a read error that can pass.
        flaky: Mutex<HashSet<&'static str>>,
    }

    impl ArtSource for FakeSource {
        fn write_hero(&self, class_name: &str, _image: HeroImage, dest: &Path) -> Result<(), Miss> {
            self.write_class(class_name, dest)
        }

        fn write_backdrop(&self, class_name: &str, dest: &Path) -> Result<(), Miss> {
            self.write_class(class_name, dest)
        }

        fn write_rank(&self, tier: u8, _image: RankImage, dest: &Path) -> Result<(), Miss> {
            self.writes.fetch_add(1, Ordering::Relaxed);
            if self.failing_tiers.contains(&tier) {
                return Err(Miss::Absent);
            }
            fs::create_dir_all(dest.parent().unwrap()).unwrap();
            fs::write(dest, b"png").map_err(|_| Miss::Transient)
        }

        fn write_ability(&self, class_name: &str, dest: &Path) -> Result<(), Miss> {
            self.write_class(class_name, dest)
        }

        fn write_item(&self, class_name: &str, _image: ItemImage, dest: &Path) -> Result<(), Miss> {
            self.write_class(class_name, dest)
        }

        fn write_minimap(&self, dest: &Path) -> Result<(), Miss> {
            self.write_class("minimap", dest)
        }

        fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> Result<(), Miss> {
            self.write_class(icon.stem(), dest)
        }

        fn write_ui(&self, compiled_path: &str, dest: &Path) -> Result<(), Miss> {
            self.ui_paths.lock().unwrap().push(compiled_path.to_string());
            std::thread::sleep(self.ui_delay);
            self.write_class(compiled_path, dest)
        }

        fn ui_stylesheet(&self, compiled_path: &str) -> Result<String, Miss> {
            self.stylesheet_reads.fetch_add(1, Ordering::Relaxed);
            let css = match compiled_path {
                crate::property_icons::STYLESHEET => self.stylesheet.clone(),
                crate::property_icons::BASE_STYLESHEET => self.base_stylesheet.clone(),
                other => panic!("unexpected stylesheet {other}"),
            };
            css.ok_or(Miss::Absent)
        }
    }

    impl FakeSource {
        fn write_class(&self, class_name: &str, dest: &Path) -> Result<(), Miss> {
            self.writes.fetch_add(1, Ordering::Relaxed);
            if self.failing.contains(class_name) {
                return Err(Miss::Absent);
            }
            if self.flaky.lock().unwrap().remove(class_name) {
                return Err(Miss::Transient);
            }
            fs::create_dir_all(dest.parent().unwrap()).unwrap();
            fs::write(dest, b"png").map_err(|_| Miss::Transient)
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

    #[test]
    fn a_backdrop_is_decoded_once_into_its_own_file() {
        let rig = Rig::new("backdrop", &[]);
        let cache = rig.cache();
        let heroes = hero(1, "hero_inferno");
        let path = PathBuf::from(cache.hero_backdrop(&heroes).unwrap());
        assert_eq!(path.file_name().unwrap(), "hero_inferno_bg.png");
        assert!(path.is_file() && path.starts_with(&rig.root));
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 1);
        assert_eq!(cache.hero_backdrop(&heroes), Some(path.to_string_lossy().into_owned()));
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn hero_art_never_decodes_the_backdrop() {
        let rig = Rig::new("backdrop-lazy", &[]);
        let art = rig.cache().hero_art(&[hero(1, "hero_inferno")]);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 3);
        let card = PathBuf::from(art[0].card.as_ref().unwrap());
        assert!(!card.with_file_name("hero_inferno_bg.png").exists());
    }

    #[test]
    fn a_hero_without_a_backdrop_has_none_and_is_not_retried() {
        let rig = Rig::new("backdrop-missing", &["hero_vindicta"]);
        let cache = rig.cache();
        let heroes = hero(2, "hero_vindicta");
        assert_eq!(cache.hero_backdrop(&heroes), None);
        assert_eq!(cache.hero_backdrop(&heroes), None);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn a_class_name_that_is_not_file_safe_reaches_no_archive() {
        let rig = Rig::new("backdrop-unsafe", &[]);
        assert_eq!(rig.cache().hero_backdrop(&hero(1, "../hero_inferno")), None);
        assert_eq!(rig.opens.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn a_mood_card_is_decoded_once_into_its_own_file() {
        let rig = Rig::new("mood", &[]);
        let cache = rig.cache();
        let inferno = hero(1, "hero_inferno");
        let gloat = PathBuf::from(cache.hero_image(&inferno, HeroImage::CardGloat).unwrap());
        let critical = PathBuf::from(cache.hero_image(&inferno, HeroImage::CardCritical).unwrap());
        assert_eq!(gloat.file_name().unwrap(), "hero_inferno_card_gloat.png");
        assert_eq!(critical.file_name().unwrap(), "hero_inferno_card_critical.png");
        assert!(gloat.is_file() && gloat.starts_with(&rig.root));
        assert!(critical.is_file() && critical.starts_with(&rig.root));
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
        assert_eq!(cache.hero_image(&inferno, HeroImage::CardGloat), Some(gloat.to_string_lossy().into_owned()));
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn hero_art_never_decodes_the_mood_cards() {
        let rig = Rig::new("mood-lazy", &[]);
        let art = rig.cache().hero_art(&[hero(1, "hero_inferno")]);
        let card = PathBuf::from(art[0].card.as_ref().unwrap());
        assert!(!card.with_file_name("hero_inferno_card_gloat.png").exists());
        assert!(!card.with_file_name("hero_inferno_card_critical.png").exists());
    }

    #[test]
    fn a_hero_without_a_mood_card_has_none() {
        let rig = Rig::new("mood-missing", &["hero_vindicta"]);
        let cache = rig.cache();
        assert_eq!(cache.hero_image(&hero(2, "hero_vindicta"), HeroImage::CardCritical), None);
        assert_eq!(cache.hero_image(&hero(1, "../hero_inferno"), HeroImage::CardGloat), None);
    }

    #[test]
    fn the_hero_select_stylesheet_names_each_heros_backdrop() {
        let css = r#"
#CustomHeroBackground #HeroBackground
{
	background-image: url("s2r://panorama/images/heroes/backgrounds/generic_bg_psd.vtex");
}

.hero_atlas #CustomHeroBackground #HeroBackground
{
	background-image: url("s2r://panorama/images/heroes/backgrounds/abrams_bg_psd.vtex");
}

.hero_bookworm #CustomHeroBackground #HeroBackground
{
	background-image: url("s2r://panorama/images/heroes/backgrounds/patience_bg_psd.vtex");
}

.AspectRatio16x10 #CustomHeroBackground #HeroBackground
{
	background-size: cover;
}

.ShowPregame .hero_forge #CustomHeroBackground .HeroIntro2DElement
{
	visibility: visible;
}

.hero_forge #CustomHeroBackground #HeroBackground
{
	saturation: 1;
}
"#;
        let paths = backdrop_paths(css);
        assert_eq!(paths.len(), 2, "{paths:?}");
        assert_eq!(paths["hero_atlas"], "panorama/images/heroes/backgrounds/abrams_bg_psd.vtex_c");
        assert_eq!(paths["hero_bookworm"], "panorama/images/heroes/backgrounds/patience_bg_psd.vtex_c");
    }

    #[test]
    fn halving_averages_blocks_and_ignores_the_colour_of_transparent_pixels() {
        let image = Image {
            width: 4,
            height: 2,
            #[rustfmt::skip]
            rgba: vec![
                255, 0, 0, 255,   0, 0, 255, 0,   10, 20, 30, 255,   10, 20, 30, 255,
                255, 0, 0, 255,   0, 255, 0, 0,   10, 20, 30, 255,   10, 20, 30, 255,
            ],
        };
        let half = downscale_half(&image);
        assert_eq!((half.width, half.height), (2, 1));
        assert_eq!(half.rgba, vec![255, 0, 0, 128, 10, 20, 30, 255]);
    }

    #[test]
    fn halving_keeps_a_one_pixel_side_and_fully_transparent_blocks_clear() {
        let image = Image { width: 2, height: 1, rgba: vec![9, 9, 9, 0, 7, 7, 7, 0] };
        let half = downscale_half(&image);
        assert_eq!((half.width, half.height), (1, 1));
        assert_eq!(half.rgba, vec![0, 0, 0, 0]);
    }

    struct MmOnly(Arc<FakeSource>);

    impl ArtSource for MmOnly {
        fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> Result<(), Miss> {
            if image == HeroImage::Mm {
                self.0.write_hero(class_name, image, dest)
            } else {
                Err(Miss::Absent)
            }
        }

        fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> Result<(), Miss> {
            self.0.write_rank(tier, image, dest)
        }

        fn write_ability(&self, class_name: &str, dest: &Path) -> Result<(), Miss> {
            self.0.write_ability(class_name, dest)
        }

        fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> Result<(), Miss> {
            self.0.write_item(class_name, image, dest)
        }

        fn write_minimap(&self, dest: &Path) -> Result<(), Miss> {
            self.0.write_minimap(dest)
        }

        fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> Result<(), Miss> {
            self.0.write_minimap_icon(icon, dest)
        }

        fn write_ui(&self, compiled_path: &str, dest: &Path) -> Result<(), Miss> {
            self.0.write_ui(compiled_path, dest)
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
        fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> Result<(), Miss> {
            if image == HeroImage::Card {
                self.0.write_hero(class_name, image, dest)
            } else {
                Err(Miss::Absent)
            }
        }

        fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> Result<(), Miss> {
            self.0.write_rank(tier, image, dest)
        }

        fn write_ability(&self, class_name: &str, dest: &Path) -> Result<(), Miss> {
            self.0.write_ability(class_name, dest)
        }

        fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> Result<(), Miss> {
            self.0.write_item(class_name, image, dest)
        }

        fn write_minimap(&self, dest: &Path) -> Result<(), Miss> {
            self.0.write_minimap(dest)
        }

        fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> Result<(), Miss> {
            self.0.write_minimap_icon(icon, dest)
        }

        fn write_ui(&self, compiled_path: &str, dest: &Path) -> Result<(), Miss> {
            self.0.write_ui(compiled_path, dest)
        }
    }

    struct ChalkOnly(Arc<FakeSource>);

    impl ArtSource for ChalkOnly {
        fn write_hero(&self, class_name: &str, image: HeroImage, dest: &Path) -> Result<(), Miss> {
            self.0.write_hero(class_name, image, dest)
        }

        fn write_rank(&self, tier: u8, image: RankImage, dest: &Path) -> Result<(), Miss> {
            if image == RankImage::Chalk {
                self.0.write_rank(tier, image, dest)
            } else {
                Err(Miss::Absent)
            }
        }

        fn write_ability(&self, class_name: &str, dest: &Path) -> Result<(), Miss> {
            self.0.write_ability(class_name, dest)
        }

        fn write_item(&self, class_name: &str, image: ItemImage, dest: &Path) -> Result<(), Miss> {
            self.0.write_item(class_name, image, dest)
        }

        fn write_minimap(&self, dest: &Path) -> Result<(), Miss> {
            self.0.write_minimap(dest)
        }

        fn write_minimap_icon(&self, icon: MinimapIcon, dest: &Path) -> Result<(), Miss> {
            self.0.write_minimap_icon(icon, dest)
        }

        fn write_ui(&self, compiled_path: &str, dest: &Path) -> Result<(), Miss> {
            self.0.write_ui(compiled_path, dest)
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

    fn build_dir(path: &Option<String>) -> PathBuf {
        PathBuf::from(path.as_ref().unwrap()).parent().unwrap().to_path_buf()
    }

    fn dirs_in(root: &Path) -> Vec<PathBuf> {
        fs::read_dir(root).unwrap().flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect()
    }

    #[test]
    fn a_new_build_mid_session_keeps_the_old_build_and_redecodes() {
        let rig = Rig::new("keep-old", &[]);
        let cache = rig.cache();
        let heroes = [hero(1, "hero_inferno")];
        let old = cache.hero_art(&heroes);
        rig.touch_archive(120);
        let new = cache.hero_art(&heroes);
        let (old_dir, new_dir) = (build_dir(&old[0].sm), build_dir(&new[0].sm));
        assert_ne!(old_dir, new_dir);
        assert!(old_dir.join("hero_inferno_sm.png").is_file(), "paths the UI holds stay valid");
        assert!(new_dir.join("hero_inferno_sm.png").is_file());
    }

    #[test]
    fn a_build_change_is_signalled_once_and_the_first_build_is_not() {
        let rig = Rig::new("signal", &[]);
        let changes = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&changes);
        let cache = rig.cache().on_build_change(move || {
            counted.fetch_add(1, Ordering::Relaxed);
        });
        let heroes = [hero(1, "hero_inferno")];
        cache.hero_art(&heroes);
        cache.rank_art(&[1]);
        assert_eq!(changes.load(Ordering::Relaxed), 0);
        rig.touch_archive(120);
        cache.hero_art(&heroes);
        cache.minimap_art().unwrap();
        assert_eq!(changes.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn the_change_signal_can_call_back_into_the_cache() {
        let rig = Rig::new("signal-reenter", &[]);
        let slot: Arc<OnceLock<ArtCache<FakeInstall>>> = Arc::new(OnceLock::new());
        let inner = Arc::clone(&slot);
        let reloaded = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&reloaded);
        let cache = rig.cache().on_build_change(move || {
            let art = inner.get().unwrap().hero_art(&[hero(1, "hero_inferno")]);
            seen.fetch_add(art.len(), Ordering::Relaxed);
        });
        let _ = slot.set(cache.clone());
        cache.hero_art(&[hero(1, "hero_inferno")]);
        rig.touch_archive(120);
        cache.hero_art(&[hero(1, "hero_inferno")]);
        assert_eq!(reloaded.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn releasing_leaves_only_the_current_build() {
        let rig = Rig::new("release", &[]);
        let cache = rig.cache();
        let heroes = [hero(1, "hero_inferno")];
        cache.hero_art(&heroes);
        rig.touch_archive(120);
        cache.hero_art(&heroes);
        rig.touch_archive(240);
        let current = cache.hero_art(&heroes);
        assert_eq!(dirs_in(&rig.root).len(), 3);
        cache.release_old_builds();
        assert_eq!(dirs_in(&rig.root), vec![build_dir(&current[0].sm)]);
        assert!(PathBuf::from(current[0].sm.as_ref().unwrap()).is_file());
    }

    #[test]
    fn releasing_keeps_the_downloaded_minimap_the_ui_may_show() {
        let rig = Rig::new("release-remote", &[]);
        let cache = rig.cache();
        cache.hero_art(&[hero(1, "hero_inferno")]);
        let remote = cache.remote_minimap_path();
        fs::write(&remote, b"png").unwrap();
        cache.release_old_builds();
        assert!(remote.is_file());
    }

    #[test]
    fn the_first_build_of_a_run_still_evicts_builds_left_by_a_mid_session_change() {
        let rig = Rig::new("next-run", &[]);
        let heroes = [hero(1, "hero_inferno")];
        let cache = rig.cache();
        let old = cache.hero_art(&heroes);
        rig.touch_archive(120);
        let new = cache.hero_art(&heroes);
        rig.cache().hero_art(&heroes);
        assert!(!build_dir(&old[0].sm).exists());
        assert_eq!(dirs_in(&rig.root), vec![build_dir(&new[0].sm)]);
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

    /// An opener that fails its first `fails` opens, as when Steam or antivirus holds the archive.
    fn flaky_cache(rig: &Rig, fails: usize) -> ArtCache<FakeInstall> {
        let source = Arc::clone(&rig.source);
        let opens = Arc::clone(&rig.opens);
        ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(move |_| {
                let n = opens.fetch_add(1, Ordering::Relaxed);
                (n >= fails).then(|| Arc::clone(&source) as Arc<dyn ArtSource>)
            }),
        )
    }

    #[test]
    fn an_archive_that_would_not_open_is_opened_again_by_the_next_call_in_the_same_build() {
        let rig = Rig::new("reopen", &[]);
        let cache = flaky_cache(&rig, 1);
        let heroes = [hero(1, "hero_inferno")];
        assert!(cache.hero_art(&heroes).is_empty());
        let art = cache.hero_art(&heroes);
        assert_eq!(art.len(), 1);
        assert!(art[0].sm.is_some() && art[0].card.is_some() && art[0].mm.is_some());
        assert_eq!(rig.opens.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn an_archive_that_will_not_open_is_tried_once_per_call() {
        let rig = Rig::new("reopen-once", &[]);
        let cache = flaky_cache(&rig, usize::MAX);
        assert!(cache.hero_art(&[hero(1, "hero_inferno"), hero(2, "hero_vindicta")]).is_empty());
        assert_eq!(rig.opens.load(Ordering::Relaxed), 1);
        assert!(cache.shop_ui_art().is_empty());
        assert_eq!(rig.opens.load(Ordering::Relaxed), 2);
        assert_eq!(cache.warm_ui_art(), 0);
        assert_eq!(rig.opens.load(Ordering::Relaxed), 3, "one open per warm pass");
    }

    #[test]
    fn property_icons_are_read_again_once_the_archive_opens() {
        let rig = rig_with_stylesheet("reopen-icons", Some(ICON_CSS), &[]);
        let cache = flaky_cache(&rig, 1);
        assert!(cache.property_icon_art().is_empty());
        assert!(!cache.property_icon_art().is_empty());
    }

    #[test]
    fn a_read_error_that_can_pass_is_retried_by_the_next_call() {
        let rig = Rig::new("flaky-read", &[]);
        rig.source.flaky.lock().unwrap().insert("hero_inferno");
        let cache = rig.cache();
        let names = ["hero_inferno".to_string()];
        assert!(cache.ability_art(&names).is_empty());
        assert_eq!(cache.ability_art(&names).len(), 1);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
        assert_eq!(rig.opens.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn data_that_will_not_decode_is_not_decoded_again_in_the_same_build() {
        let rig = Rig::new("absent-cached", &["hero_inferno"]);
        let cache = rig.cache();
        let names = ["hero_inferno".to_string()];
        assert!(cache.ability_art(&names).is_empty());
        assert!(cache.ability_art(&names).is_empty());
        assert!(cache.ability_art(&names).is_empty());
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 1);
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
        assert!(old.is_file());
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

    fn ui_from_wire(value: &str) -> Option<ShopUiImage> {
        use serde::de::value::{Error, StrDeserializer};
        ShopUiImage::deserialize(StrDeserializer::<Error>::new(value)).ok()
    }

    fn file_name(path: &str) -> String {
        PathBuf::from(path).file_name().unwrap().to_string_lossy().into_owned()
    }

    #[test]
    fn every_shop_ui_image_has_its_own_wire_name_and_compiled_file() {
        let images: HashSet<ShopUiImage> = ShopUiImage::ALL.into_iter().collect();
        assert_eq!(images.len(), ShopUiImage::ALL.len(), "ALL has no repeats");
        assert_eq!(ShopUiImage::ALL.len(), 88);
        assert!(ShopUiImage::ALL.iter().all(|i| !i.key().starts_with("paper_wear")));
        let keys: HashSet<&str> = ShopUiImage::ALL.iter().map(|i| i.key()).collect();
        let paths: HashSet<&str> = ShopUiImage::ALL.iter().map(|i| i.compiled_path()).collect();
        assert_eq!(keys.len(), ShopUiImage::ALL.len());
        assert_eq!(paths.len(), ShopUiImage::ALL.len());
        for image in ShopUiImage::ALL {
            assert_eq!(ui_from_wire(image.key()), Some(image), "{}", image.key());
            assert!(file_safe(image.key()), "{}", image.key());
            let path = image.compiled_path();
            assert!(path.starts_with("panorama/images/"), "{path}");
            assert!(
                path.ends_with("_psd.vtex_c") || path.ends_with("_png.vtex_c") || path.ends_with(".vsvg_c"),
                "{path}"
            );
        }
    }

    // Paths as `citadel_shop_mod_view.css` and `citadel_ui_shop_filters.css` (build 6805) reference them.
    #[test]
    fn shop_ui_images_name_the_files_the_shop_stylesheets_use() {
        let cards = "panorama/images/shop/catalog/cards";
        let filters = "panorama/images/shop/catalog/filters";
        for (image, path) in [
            (ShopUiImage::CardBackerWeaponT1, format!("{cards}/card_backer_weapon_t1_psd.vtex_c")),
            (ShopUiImage::CardBackerVitalityT3, format!("{cards}/card_backer_vitality_t3_psd.vtex_c")),
            (ShopUiImage::CardBackerSpiritT4, format!("{cards}/card_backer_spirit_t4_psd.vtex_c")),
            (ShopUiImage::CardBase, "panorama/images/shop/card_backer_psd.vtex_c".into()),
            (ShopUiImage::CardBaseMask, "panorama/images/shop/card_backer_png.vtex_c".into()),
            (ShopUiImage::PaperTexture2, format!("{cards}/shopitem_papertexture02_psd.vtex_c")),
            (ShopUiImage::IconMask1, format!("{cards}/icon_mask01_psd.vtex_c")),
            (ShopUiImage::TierCorner, "panorama/images/shop/tier_corner_cap.vsvg_c".into()),
            (ShopUiImage::TierNumber3, "panorama/images/upgrades/tier_numbers_small_03.vsvg_c".into()),
            (ShopUiImage::PopularThumb, format!("{filters}/icon_recommend_up.vsvg_c")),
            (ShopUiImage::PhaseLate, format!("{filters}/icon_late_game_png.vtex_c")),
            (ShopUiImage::RecommendedStar, "panorama/images/upgrades/recommended_star_psd.vtex_c".into()),
            (ShopUiImage::SlotVitality, "panorama/images/hud/core/core_armor_icon_psd.vtex_c".into()),
            (ShopUiImage::FilterSpirit, format!("{filters}/sigil_magic_psd.vtex_c")),
            (ShopUiImage::FilterMisc, format!("{filters}/sigil_misc_psd.vtex_c")),
            (ShopUiImage::FilterTabFill, format!("{filters}/top_level_filter_fill.vsvg_c")),
        ] {
            assert_eq!(image.compiled_path(), path);
        }
        assert_eq!(ShopUiImage::PaperTexture1.key(), "paper_texture_1");
        assert_eq!(ShopUiImage::CardBackerWeaponT1.key(), "card_backer_weapon_t1");
    }

    // Paths as `citadel_tooltip_mod_details.css`, `citadel_tooltip_ability_details.css`,
    // `citadel_tooltip_ability_upgrade_button.css` and `citadel_modified_attribute_label.css` reference them.
    #[test]
    fn tooltip_images_name_the_files_the_tooltip_stylesheets_use() {
        let images = "panorama/images";
        for (image, path) in [
            (ShopUiImage::TooltipBackerWeapon, "tooltips/items/tooltip_backer_weapon_psd.vtex_c"),
            (ShopUiImage::TooltipBackerVitalityMask, "tooltips/items/tooltip_backer_vitality_mask_psd.vtex_c"),
            (ShopUiImage::TooltipBackerSpiritCorrupted, "tooltips/items/tooltip_backer_spirit_corrupted_psd.vtex_c"),
            (
                ShopUiImage::TooltipHeaderWeaponCorrupted,
                "shop/catalog/catalog_tooltip_header_weapon_corrupted_psd.vtex_c",
            ),
            (
                ShopUiImage::TooltipModifiesHeaderSpirit,
                "shop/catalog/catalog_tooltip_modifies_header_spirit_psd.vtex_c",
            ),
            (ShopUiImage::TooltipModifiesBgVitality, "shop/catalog/catalog_tooltip_bg_modifies_vitality_psd.vtex_c"),
            (ShopUiImage::CooldownLarge, "upgrades/property_cooldown_large_psd.vtex_c"),
            (ShopUiImage::ChargeUpLarge, "upgrades/property_chargeup_large_psd.vtex_c"),
            (ShopUiImage::SoulIcon, "hud/icons/icon_soul.vsvg_c"),
            (ShopUiImage::KeystatArrowWeapon, "shop/keystat_courage_arrow_png.vtex_c"),
            (ShopUiImage::KeystatArrowVitality, "shop/keystat_fortitude_arrow_png.vtex_c"),
            (ShopUiImage::ModifiedArrow2, "shop/tooltip_modified_arrow_2.vsvg_c"),
            (ShopUiImage::ArrowDelta, "upgrades/arrow_delta_psd.vtex_c"),
            (ShopUiImage::PurchasedCheck, "shop/purchased_check_png.vtex_c"),
            (ShopUiImage::Checkmark, "icons/icon_checkmark.vsvg_c"),
            (ShopUiImage::TierNumber5, "upgrades/tier_numbers_small_05.vsvg_c"),
            (ShopUiImage::AbilityTooltipBg, "tooltips/ability/ability_tooltip_bg_png.vtex_c"),
            (ShopUiImage::AbilityTooltipTexture, "tooltips/ability/ability_texture_layer_png.vtex_c"),
            (ShopUiImage::AbilityUpgradeRectCantAfford, "tooltips/ability/ap_rect_cant_afford_png.vtex_c"),
            (ShopUiImage::AbilityUpgradeBackerOwned, "tooltips/ability/ap_backer_owned_png.vtex_c"),
            (ShopUiImage::AbilityPoint, "hud/ap_icon.vsvg_c"),
            (ShopUiImage::AbilityUpgradeCheck, "hud/ability_upgrade_check_psd.vtex_c"),
            (ShopUiImage::StatIconSpirit, "hud/core/icon_spirit.vsvg_c"),
            (ShopUiImage::StatIconWeapon, "hud/core/icon_courage.vsvg_c"),
        ] {
            assert_eq!(image.compiled_path(), format!("{images}/{path}"));
        }
        assert_eq!(ShopUiImage::ModifiedArrow2.key(), "modified_arrow_2");
        assert_eq!(ShopUiImage::TierNumber5.key(), "tier_number_5");
    }

    #[test]
    fn shop_ui_art_is_one_file_per_image_beside_the_other_art() {
        let rig = Rig::new("ui-paths", &[]);
        let cache = rig.cache();
        let hero = cache.hero_art(&[hero(1, "hero_inferno")]);
        let out = cache.shop_ui_art();
        assert_eq!(out.iter().map(|a| a.image).collect::<Vec<_>>(), ShopUiImage::ALL);
        let find = |image: ShopUiImage| out.iter().find(|a| a.image == image).unwrap().path.clone();
        assert_eq!(file_name(&find(ShopUiImage::TierCorner)), "ui_tier_corner.svg");
        assert_eq!(file_name(&find(ShopUiImage::CardBackerWeaponT1)), "ui_card_backer_weapon_t1.png");
        for art in &out {
            let path = PathBuf::from(&art.path);
            assert!(path.is_file());
            assert_eq!(path.parent(), PathBuf::from(hero[0].sm.as_ref().unwrap()).parent());
        }
        let asked: HashSet<String> = rig.source.ui_paths.lock().unwrap().iter().cloned().collect();
        let expected: HashSet<String> = ShopUiImage::ALL.iter().map(|i| i.compiled_path().to_string()).collect();
        assert_eq!(asked, expected);
    }

    #[test]
    fn shop_ui_art_is_decoded_once_per_build() {
        let rig = Rig::new("ui-once", &[]);
        let cache = rig.cache();
        let first = cache.shop_ui_art();
        let writes = rig.source.writes.load(Ordering::Relaxed);
        assert_eq!(writes, ShopUiImage::ALL.len());
        assert_eq!(cache.shop_ui_art(), first);
        assert_eq!(rig.cache().shop_ui_art(), first);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), writes);
    }

    const ICON_CSS: &str = concat!(
        ".prop_distance.AbilityPropertyIcon,.prop_distance .ImportantStatImage{background-image: ",
        "url(\"s2r://panorama/images/icons/properties/range.vsvg\");}",
        ".prop_radius.AbilityPropertyIcon,.prop_radius .ImportantStatImage{background-image: ",
        "url(\"s2r://panorama/images/icons/properties/range.vsvg\");}",
        ".prop_cast .ImportantStatImage{background-image: url(\"s2r://panorama/images/upgrades/property_cast_psd.vtex\");",
        "wash-color: none;}",
        ".StatusEffectEMP .ImportantStatImage{background-image: ",
        "url(\"s2r://panorama/images/icons/properties/condition_silence.vsvg\");wash-color: spiritBrightColor;}",
    );

    const BASE_CSS: &str = concat!(
        "@define spiritBrightColor: #CE90FF;@define offWhite: #FFEFD7;",
        ".InlineAttributeIcon{wash-color: offWhite;}",
        ".InlineAttributeIcon.Stun{background-image: url(\"s2r://panorama/images/hud/modifiers/icon_stun.vsvg\");}",
        ".InlineAttributeName.Stun{color: offWhite;}",
    );

    fn rig_with_stylesheet(name: &str, css: Option<&str>, failing: &[&'static str]) -> Rig {
        rig_with_stylesheets(name, css, None, failing)
    }

    fn rig_with_stylesheets(name: &str, css: Option<&str>, base: Option<&str>, failing: &[&'static str]) -> Rig {
        let mut rig = Rig::new(name, failing);
        let source = Arc::get_mut(&mut rig.source).expect("not shared yet");
        source.stylesheet = css.map(str::to_string);
        source.base_stylesheet = base.map(str::to_string);
        rig
    }

    #[test]
    fn property_icon_art_is_one_file_per_image_the_stylesheet_names() {
        let rig = rig_with_stylesheet("prop-icons", Some(ICON_CSS), &[]);
        let cache = rig.cache();
        let hero = cache.hero_art(&[hero(1, "hero_inferno")]);
        let out = cache.property_icon_art();
        let shown: Vec<(&str, String, Option<&str>)> =
            out.iter().map(|a| (a.class.as_str(), file_name(&a.path), a.wash.as_deref())).collect();
        assert_eq!(
            shown,
            [
                ("distance", "ui_prop_icons_properties_range.svg".to_string(), None),
                ("radius", "ui_prop_icons_properties_range.svg".to_string(), None),
                ("cast", "ui_prop_upgrades_property_cast_psd.png".to_string(), Some("none")),
                (
                    "StatusEffectEMP",
                    "ui_prop_icons_properties_condition_silence.svg".to_string(),
                    Some("spiritBrightColor")
                ),
            ]
        );
        for art in &out {
            assert_eq!(PathBuf::from(&art.path).parent(), PathBuf::from(hero[0].sm.as_ref().unwrap()).parent());
        }
        let asked = rig.source.ui_paths.lock().unwrap().clone();
        assert_eq!(
            asked,
            [
                "panorama/images/icons/properties/range.vsvg_c",
                "panorama/images/upgrades/property_cast_psd.vtex_c",
                "panorama/images/icons/properties/condition_silence.vsvg_c",
            ]
        );
    }

    #[test]
    fn inline_attribute_keywords_follow_with_colours_resolved_by_the_base_styles() {
        let rig = rig_with_stylesheets("prop-icons-inline", Some(ICON_CSS), Some(BASE_CSS), &[]);
        let out = rig.cache().property_icon_art();
        let shown: Vec<(&str, String, Option<&str>, Option<&str>)> =
            out.iter().map(|a| (a.class.as_str(), file_name(&a.path), a.wash.as_deref(), a.color.as_deref())).collect();
        assert_eq!(
            shown,
            [
                ("distance", "ui_prop_icons_properties_range.svg".to_string(), None, None),
                ("radius", "ui_prop_icons_properties_range.svg".to_string(), None, None),
                ("cast", "ui_prop_upgrades_property_cast_psd.png".to_string(), Some("none"), None),
                (
                    "StatusEffectEMP",
                    "ui_prop_icons_properties_condition_silence.svg".to_string(),
                    Some("#ce90ff"),
                    None
                ),
                ("Stun", "ui_prop_hud_modifiers_icon_stun.svg".to_string(), Some("#ffefd7"), Some("#ffefd7")),
            ]
        );
    }

    #[test]
    fn without_the_base_styles_property_icons_keep_their_colour_names_and_no_keyword_has_art() {
        let rig = rig_with_stylesheet("prop-icons-nobase", Some(ICON_CSS), &[]);
        let out = rig.cache().property_icon_art();
        assert_eq!(out.len(), 4);
        assert_eq!(out[3].wash.as_deref(), Some("spiritBrightColor"));
    }

    #[test]
    fn the_icon_stylesheet_is_read_once_per_build_and_a_failed_icon_is_left_out() {
        let rig = rig_with_stylesheet(
            "prop-icons-once",
            Some(ICON_CSS),
            &["panorama/images/icons/properties/condition_silence.vsvg_c"],
        );
        let cache = rig.cache();
        let first = cache.property_icon_art();
        assert_eq!(first.iter().map(|a| a.class.as_str()).collect::<Vec<_>>(), ["distance", "radius", "cast"]);
        assert_eq!(cache.property_icon_art(), first);
        assert_eq!(rig.source.stylesheet_reads.load(Ordering::Relaxed), 2, "each stylesheet once");
    }

    #[test]
    fn without_the_icon_stylesheet_or_an_install_there_are_no_property_icons() {
        let rig = rig_with_stylesheet("prop-icons-none", None, &[]);
        assert!(rig.cache().property_icon_art().is_empty());
        let cache =
            ArtCache::with_opener(FakeInstall(Mutex::new(None)), rig.root.clone(), Box::new(|_| panic!("no install")));
        assert!(cache.property_icon_art().is_empty());
    }

    #[test]
    fn a_shop_ui_image_that_will_not_decode_is_left_out_and_not_retried() {
        let rig = Rig::new("ui-missing", &["panorama/images/shop/tier_corner_cap.vsvg_c"]);
        let cache = rig.cache();
        let out = cache.shop_ui_art();
        assert_eq!(out.len(), ShopUiImage::ALL.len() - 1);
        assert!(out.iter().all(|a| a.image != ShopUiImage::TierCorner));
        let writes = rig.source.writes.load(Ordering::Relaxed);
        cache.shop_ui_art();
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), writes);
    }

    #[test]
    fn without_an_install_there_is_no_shop_ui_art() {
        let rig = Rig::new("ui-noinstall", &[]);
        let cache =
            ArtCache::with_opener(FakeInstall(Mutex::new(None)), rig.root.clone(), Box::new(|_| panic!("no install")));
        assert!(cache.shop_ui_art().is_empty());
    }

    /// `ICON_CSS` names three distinct icon files: `distance` and `radius` share one.
    const ICON_FILES: usize = 3;

    const LARGE_UI: [ShopUiImage; 9] = [
        ShopUiImage::TooltipBackerWeapon,
        ShopUiImage::TooltipBackerVitality,
        ShopUiImage::TooltipBackerSpirit,
        ShopUiImage::TooltipBackerWeaponCorrupted,
        ShopUiImage::TooltipBackerVitalityCorrupted,
        ShopUiImage::TooltipBackerSpiritCorrupted,
        ShopUiImage::TooltipModifiesBgWeapon,
        ShopUiImage::TooltipModifiesBgVitality,
        ShopUiImage::TooltipModifiesBgSpirit,
    ];

    fn warm_rig(name: &str) -> Rig {
        rig_with_stylesheet(name, Some(ICON_CSS), &[])
    }

    fn reports(cache: &ArtCache<FakeInstall>) -> std::sync::mpsc::Receiver<()> {
        let (tx, rx) = std::sync::mpsc::channel();
        cache.warm_in_background(move || {
            let _ = tx.send(());
        });
        rx
    }

    const PASS: std::time::Duration = std::time::Duration::from_secs(10);

    #[test]
    fn warming_decodes_the_shop_ui_art_and_property_icons_once() {
        let rig = warm_rig("warm");
        let cache = rig.cache();
        assert_eq!(cache.warm_ui_art(), ShopUiImage::ALL.len() + ICON_FILES);
        let writes = rig.source.writes.load(Ordering::Relaxed);
        assert_eq!(writes, ShopUiImage::ALL.len() + ICON_FILES);
        assert_eq!(cache.shop_ui_art().len(), ShopUiImage::ALL.len());
        assert_eq!(cache.property_icon_art().len(), 4);
        assert_eq!(cache.warm_ui_art(), 0);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), writes);
    }

    #[test]
    fn warming_decodes_card_art_first_and_the_large_tooltip_backers_last() {
        let rig = warm_rig("warm-order");
        rig.cache().warm_ui_art();
        let asked = rig.source.ui_paths.lock().unwrap().clone();
        assert_eq!(asked.first().map(String::as_str), Some(ShopUiImage::CardBackerWeaponT1.compiled_path()));
        let large: Vec<&str> = LARGE_UI.iter().map(|i| i.compiled_path()).collect();
        let tail: HashSet<&str> = asked[asked.len().saturating_sub(large.len())..].iter().map(String::as_str).collect();
        assert_eq!(tail, large.into_iter().collect::<HashSet<_>>());
        assert!(asked.iter().any(|p| p == "panorama/images/icons/properties/range.vsvg_c"));
    }

    #[test]
    fn art_calls_while_warming_decode_no_image_twice() {
        let mut rig = warm_rig("warm-race");
        Arc::get_mut(&mut rig.source).unwrap().ui_delay = std::time::Duration::from_millis(3);
        let cache = rig.cache();
        let warming = {
            let cache = cache.clone();
            std::thread::spawn(move || cache.warm_ui_art())
        };
        std::thread::sleep(std::time::Duration::from_millis(20));
        let shop = cache.shop_ui_art();
        let icons = cache.property_icon_art();
        let warmed = warming.join().unwrap();
        assert!(warmed > 0, "the warm ran alongside the calls");
        assert_eq!(shop.len(), ShopUiImage::ALL.len());
        assert_eq!(icons.len(), 4);
        assert!(shop.iter().all(|a| PathBuf::from(&a.path).is_file()));
        let asked = rig.source.ui_paths.lock().unwrap().clone();
        assert_eq!(asked.iter().collect::<HashSet<_>>().len(), asked.len(), "each image decoded once");
        assert_eq!(asked.len(), ShopUiImage::ALL.len() + ICON_FILES);
    }

    #[test]
    fn background_warming_runs_at_start_and_reports_the_new_art_once() {
        let rig = warm_rig("warm-bg");
        let cache = rig.cache();
        let ready = reports(&cache);
        ready.recv_timeout(PASS).expect("a first pass");
        assert_eq!(rig.source.ui_paths.lock().unwrap().len(), ShopUiImage::ALL.len() + ICON_FILES);
        assert!(ready.recv_timeout(std::time::Duration::from_millis(300)).is_err());
    }

    #[test]
    fn a_warm_cache_is_not_reported() {
        let rig = warm_rig("warm-noop");
        let cache = rig.cache();
        cache.shop_ui_art();
        cache.property_icon_art();
        let ready = reports(&cache);
        assert!(ready.recv_timeout(std::time::Duration::from_millis(500)).is_err());
    }

    #[test]
    fn a_new_game_build_is_warmed_again() {
        let rig = warm_rig("warm-rebuild");
        let cache = rig.cache();
        let ready = reports(&cache);
        ready.recv_timeout(PASS).expect("a first pass");
        rig.touch_archive(120);
        let heroes = cache.hero_art(&[hero(1, "hero_inferno")]);
        ready.recv_timeout(PASS).expect("the new build is warmed");
        let dir = build_dir(&heroes[0].sm);
        assert!(dir.join("ui_card_backer_weapon_t1.png").is_file());
        assert!(dir.join("ui_tooltip_backer_spirit.png").is_file());
        assert!(dir.join("ui_prop_icons_properties_range.svg").is_file());
    }

    #[test]
    fn a_warm_pass_that_found_the_archive_locked_runs_again_once_it_opens() {
        let rig = warm_rig("warm-reopen");
        let cache = flaky_cache(&rig, 1);
        let ready = reports(&cache);
        let start = std::time::Instant::now();
        while rig.opens.load(Ordering::Relaxed) == 0 {
            assert!(start.elapsed() < PASS, "the first pass never tried to open the archive");
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let heroes = cache.hero_art(&[hero(1, "hero_inferno")]);
        ready.recv_timeout(PASS).expect("warming runs again after the archive opens");
        let dir = build_dir(&heroes[0].sm);
        assert!(dir.join("ui_card_backer_weapon_t1.png").is_file());
        assert!(dir.join("ui_prop_icons_properties_range.svg").is_file());
    }

    fn tag(key: &str) -> BuildTag {
        BuildTag { key: key.to_string(), id: 1, name: key.to_uppercase(), icon: None }
    }

    #[test]
    fn standard_tags_get_their_picker_icon_as_an_svg_file() {
        let rig = Rig::new("tag-icons", &[]);
        let cache = rig.cache();
        let out = cache.build_tag_icons(&[tag("weapon"), tag("crowd_control")]);
        assert_eq!(out.iter().map(|t| t.key.as_str()).collect::<Vec<_>>(), vec!["weapon", "crowd_control"]);
        assert_eq!(out[0].name, "WEAPON");
        let icon = out[0].icon.as_ref().unwrap();
        assert_eq!(file_name(icon), "build_tag_weapon.svg");
        assert!(PathBuf::from(icon).is_file());
        assert_eq!(file_name(out[1].icon.as_ref().unwrap()), "build_tag_crowd_control.svg");
        assert_eq!(
            *rig.source.ui_paths.lock().unwrap(),
            vec![
                "panorama/images/builds/citadel_build_tag_weapon.vsvg_c",
                "panorama/images/builds/citadel_build_tag_crowd_control.vsvg_c"
            ]
        );
        cache.build_tag_icons(&[tag("weapon")]);
        assert_eq!(rig.source.writes.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn a_tag_outside_the_standard_set_or_without_an_icon_keeps_none() {
        let rig = Rig::new("tag-none", &["panorama/images/builds/citadel_build_tag_debuff.vsvg_c"]);
        let out = rig.cache().build_tag_icons(&[tag("../evil"), tag("made_up"), tag("debuff"), tag("melee")]);
        assert_eq!(out.len(), 4);
        assert_eq!(out.iter().map(|t| t.icon.is_some()).collect::<Vec<_>>(), vec![false, false, false, true]);
        assert_eq!(out[2].name, "DEBUFF");
        assert_eq!(rig.source.ui_paths.lock().unwrap().len(), 2, "only standard keys reach the archive");
    }

    #[test]
    fn without_an_install_tags_come_back_without_icons() {
        let rig = Rig::new("tag-noinstall", &[]);
        let cache =
            ArtCache::with_opener(FakeInstall(Mutex::new(None)), rig.root.clone(), Box::new(|_| panic!("no install")));
        assert_eq!(cache.build_tag_icons(&[tag("weapon")]), vec![tag("weapon")]);
    }

    #[test]
    fn the_archive_source_writes_svg_and_png_files_from_a_real_vpk() {
        use crate::ui_art::tests::{vsvg, vtex_2x2};
        let rig = Rig::new("ui-vpk", &[]);
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0H1V1Z\"/></svg>";
        let mut pack = Vpk::new(1);
        pack.add(ShopUiImage::TierCorner.compiled_path(), vsvg(&[], svg)).unwrap();
        pack.add(ShopUiImage::CardBackerWeaponT1.compiled_path(), vtex_2x2()).unwrap();
        pack.add(crate::build_tags::icon_compiled_path("weapon"), vsvg(&[], svg)).unwrap();
        pack.write(rig.citadel.join(deadlock_data::vdata::ARCHIVE)).unwrap();
        let cache = ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(open_archive),
        );
        let out = cache.shop_ui_art();
        let images: Vec<ShopUiImage> = out.iter().map(|a| a.image).collect();
        assert_eq!(images, [ShopUiImage::CardBackerWeaponT1, ShopUiImage::TierCorner]);
        assert_eq!(fs::read_to_string(&out[1].path).unwrap(), svg);
        assert_eq!(&fs::read(&out[0].path).unwrap()[..4], b"\x89PNG");
        let tags = cache.build_tag_icons(&[tag("weapon")]);
        assert_eq!(fs::read_to_string(tags[0].icon.as_ref().unwrap()).unwrap(), svg);
    }

    #[test]
    fn the_archive_source_reads_the_icon_stylesheet_from_a_real_vpk() {
        use crate::ui_art::tests::vsvg;
        let rig = Rig::new("prop-icons-vpk", &[]);
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0H1V1Z\"/></svg>";
        let mut pack = Vpk::new(1);
        // A compiled stylesheet's DATA block has the same layout as a vector image's.
        pack.add(crate::property_icons::STYLESHEET, vsvg(&["panorama/images/icons/properties/range.vsvg"], ICON_CSS))
            .unwrap();
        pack.add("panorama/images/icons/properties/range.vsvg_c", vsvg(&[], svg)).unwrap();
        pack.write(rig.citadel.join(deadlock_data::vdata::ARCHIVE)).unwrap();
        let cache = ArtCache::with_opener(
            FakeInstall(Mutex::new(Some(rig.citadel.clone()))),
            rig.root.clone(),
            Box::new(open_archive),
        );
        let out = cache.property_icon_art();
        assert_eq!(out.iter().map(|a| a.class.as_str()).collect::<Vec<_>>(), ["distance", "radius"]);
        assert_eq!(fs::read_to_string(&out[0].path).unwrap(), svg);
    }

    #[test]
    #[ignore = "needs DEADLOCK_CITADEL_DIR pointing at an installed game"]
    fn a_real_install_decodes_every_property_icon_the_stylesheet_names() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("DEADLOCK_CITADEL_DIR"));
        let root = std::env::temp_dir().join(format!("dp-gamedata-prop-icons-real-{}", std::process::id()));
        let css = open_archive(&dir).and_then(|s| s.ui_stylesheet(STYLESHEET).ok()).expect("the stylesheet decodes");
        let named: Vec<String> = icon_rules(&css).into_iter().map(|r| r.class).collect();
        let cache = ArtCache::with_opener(FakeInstall(Mutex::new(Some(dir))), root.clone(), Box::new(open_archive));
        let classes: Vec<String> = cache.property_icon_art().into_iter().map(|a| a.class).collect();
        fs::remove_dir_all(root).ok();
        assert_eq!(classes[..named.len()], named, "every class the stylesheet names decodes, before the keywords");
        for class in ["cooldown", "tech_damage", "duration", "souls", "StatusEffectEMP", "StatusEffectInvisible"] {
            assert!(classes.iter().any(|c| c == class), "{class} missing from {classes:?}");
        }
    }

    #[test]
    #[ignore = "needs DEADLOCK_CITADEL_DIR pointing at an installed game"]
    fn a_real_install_gives_every_item_description_keyword_its_image_or_has_none_for_it() {
        use crate::tooltip::{bundle_localisation, INLINE_ATTRIBUTE};
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("DEADLOCK_CITADEL_DIR"));
        let root = std::env::temp_dir().join(format!("dp-gamedata-inline-icons-real-{}", std::process::id()));
        let source = open_archive(&dir).expect("the archive opens");
        let base = source.ui_stylesheet(BASE_STYLESHEET).expect("the base styles decode");
        let styled: Vec<String> = inline_attribute_rules(&base).into_iter().map(|r| r.class).collect();
        let properties: Vec<String> =
            icon_rules(&source.ui_stylesheet(STYLESHEET).expect("the icon stylesheet decodes"))
                .into_iter()
                .map(|r| r.class)
                .collect();
        assert!(styled.iter().all(|k| !properties.contains(k)), "a keyword shares a key with a property class");

        let mut keywords = std::collections::BTreeSet::new();
        for file in bundle_localisation(&dir, "english", &["citadel_mods"]) {
            for text in file.tokens.values() {
                for part in text.split(INLINE_ATTRIBUTE).skip(1) {
                    if let Some((name, _)) = part.split_once("'}") {
                        keywords.insert(name.to_string());
                    }
                }
            }
        }
        assert!(keywords.len() > 10, "{keywords:?}");

        let cache = ArtCache::with_opener(FakeInstall(Mutex::new(Some(dir))), root.clone(), Box::new(open_archive));
        let art = cache.property_icon_art();
        let mut without = Vec::new();
        for keyword in &keywords {
            match art.iter().find(|a| &a.class == keyword) {
                Some(a) => assert!(PathBuf::from(&a.path).is_file(), "{keyword}: {}", a.path),
                None => {
                    assert!(!styled.contains(keyword), "{keyword} has a game image that did not decode");
                    without.push(keyword.as_str());
                }
            }
        }
        fs::remove_dir_all(root).ok();
        eprintln!("keywords: {keywords:?}");
        eprintln!("keywords the game draws without an image: {without:?}");
        for a in art.iter().filter(|a| styled.contains(&a.class)) {
            eprintln!("{} {} wash={:?} color={:?}", a.class, file_name(&a.path), a.wash, a.color);
        }
    }

    #[test]
    #[ignore = "needs DEADLOCK_CITADEL_DIR pointing at an installed game"]
    fn a_real_install_decodes_every_shop_ui_image_and_tag_icon() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("DEADLOCK_CITADEL_DIR"));
        let root = std::env::temp_dir().join(format!("dp-gamedata-ui-real-{}", std::process::id()));
        let cache = ArtCache::with_opener(FakeInstall(Mutex::new(Some(dir))), root.clone(), Box::new(open_archive));
        let art = cache.shop_ui_art();
        let missing: Vec<&str> =
            ShopUiImage::ALL.iter().filter(|i| art.iter().all(|a| a.image != **i)).map(|i| i.key()).collect();
        assert!(missing.is_empty(), "did not decode: {missing:?}");
        let tags: Vec<BuildTag> = crate::BUILD_TAG_KEYS.iter().map(|k| tag(k)).collect();
        let iconless: Vec<String> =
            cache.build_tag_icons(&tags).into_iter().filter(|t| t.icon.is_none()).map(|t| t.key).collect();
        assert!(iconless.is_empty(), "tags without an icon: {iconless:?}");
        if std::env::var_os("KEEP_UI_ART").is_none() {
            fs::remove_dir_all(root).ok();
        }
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
    fn a_real_install_decodes_hero_backdrops_at_half_size() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("DEADLOCK_CITADEL_DIR"));
        let root = std::env::temp_dir().join(format!("dp-gamedata-backdrop-real-{}", std::process::id()));
        let css = open_archive(&dir).and_then(|s| s.ui_stylesheet(BACKDROP_STYLESHEET).ok()).expect("the stylesheet");
        assert!(backdrop_paths(&css).len() >= 40, "{:?}", backdrop_paths(&css).len());
        let cache = ArtCache::with_opener(FakeInstall(Mutex::new(Some(dir))), root.clone(), Box::new(open_archive));
        for class in ["hero_inferno", "hero_haze", "hero_atlas", "hero_bookworm"] {
            let path = cache.hero_backdrop(&hero(1, class)).unwrap_or_else(|| panic!("{class} has no backdrop"));
            let bytes = fs::read(&path).unwrap();
            assert_eq!(&bytes[1..4], b"PNG");
            assert_eq!(u32::from_be_bytes(bytes[16..20].try_into().unwrap()), 2048, "{class} width");
            assert_eq!(u32::from_be_bytes(bytes[20..24].try_into().unwrap()), 1156, "{class} height");
            println!("{class}: {} bytes at {path}", bytes.len());
        }
        if std::env::var_os("KEEP_UI_ART").is_none() {
            fs::remove_dir_all(root).ok();
        }
    }

    #[test]
    #[ignore = "needs DEADLOCK_CITADEL_DIR pointing at an installed game"]
    fn a_real_install_has_both_mood_cards_for_every_playable_hero() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("DEADLOCK_CITADEL_DIR"));
        let root = std::env::temp_dir().join(format!("dp-gamedata-mood-real-{}", std::process::id()));
        let heroes = crate::catalog::GameData::new(FakeInstall(Mutex::new(Some(dir.clone())))).heroes("en");
        // The practice-range target dummy is listed as selectable but is not a hero and has no cards.
        let playable: Vec<_> = heroes
            .iter()
            .filter(|h| h.selectable && !h.disabled && !h.in_development && h.class_name != "hero_targetdummy")
            .collect();
        assert!(playable.len() >= 40, "{} playable heroes", playable.len());
        let archive = ArtArchive::open(&dir).unwrap();
        let cache = ArtCache::with_opener(FakeInstall(Mutex::new(Some(dir))), root.clone(), Box::new(open_archive));
        let mut missing = Vec::new();
        for hero in playable {
            for (image, kind) in
                [(HeroImage::CardGloat, HeroArtKind::CardGloat), (HeroImage::CardCritical, HeroArtKind::CardCritical)]
            {
                match cache.hero_image(hero, image) {
                    Some(path) => {
                        let bytes = fs::read(&path).unwrap();
                        let (w, h) = (
                            u32::from_be_bytes(bytes[16..20].try_into().unwrap()),
                            u32::from_be_bytes(bytes[20..24].try_into().unwrap()),
                        );
                        println!(
                            "{} {}: {} {w}x{h}",
                            hero.id,
                            hero.name,
                            archive.path(&Art::hero(&hero.class_name, kind))
                        );
                    }
                    None => missing.push(format!("{} {} {}", hero.id, hero.class_name, image.suffix())),
                }
            }
        }
        println!("cached under {}", root.display());
        if std::env::var_os("KEEP_UI_ART").is_none() {
            fs::remove_dir_all(root).ok();
        }
        assert!(missing.is_empty(), "heroes without a mood card: {missing:?}");
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
