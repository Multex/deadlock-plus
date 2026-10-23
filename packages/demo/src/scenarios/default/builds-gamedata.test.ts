import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { ItemStats } from "@deadlock-plus/ipc-types/ItemStats";
import type { PropertyIconArt } from "@deadlock-plus/ipc-types/PropertyIconArt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const ASSETS = "https://api.deadlock-api.com/v1/assets";
const RES = "https://assets-bucket.deadlock-api.com/assets-api-res";
const PROPS = `${RES}/icons/icons/properties`;

const SVG = '<svg width="128" height="128" viewBox="0 0 128 128"><path d="M0 0H1"/></svg>';

// Shaped after `ability_incendiary_projectile` (Infernus's Napalm) in the public items asset.
const NAPALM = {
    id: 491391007,
    class_name: "ability_incendiary_projectile",
    name: "Napalm",
    type: "ability",
    ability_type: "signature",
    properties: {
        AbilityCooldown: {
            value: 25,
            css_class: "cooldown",
            disable_value: "0",
            scale_function: { class_name: "scale_function_single_stat", specific_stat_scale_type: "ETechCooldown" },
            label: "Cooldown",
            postfix: "s",
            postvalue_label: "Cooldown",
            icon: `${PROPS}/cooldown.svg`,
        },
        AbilityDuration: { value: "0", css_class: "duration", disable_value: "0", label: "Duration", postfix: "s" },
        AbilityCastRange: {
            value: "20m",
            css_class: "range",
            scale_function: { class_name: "scale_function_single_stat", specific_stat_scale_type: "ETechRange" },
            label: "Cast Range",
            postfix: "m",
            icon: `${RES}/icons/upgrades/property_range.svg`,
        },
        AbilityChannelTime: { value: "0", css_class: "cast", disable_value: "0", label: "Channel Duration" },
        AbilityCharges: {
            value: "1",
            css_class: "cast",
            disable_value: "-1",
            scale_function: { class_name: "scale_function_ability_charges" },
            label: "Charges",
            postvalue_label: "Charges",
        },
        AbilityCooldownBetweenCharge: {
            value: "6",
            css_class: "charge_cooldown",
            disable_value: "-2",
            scale_function: { class_name: "scale_function_ability_recharge_time" },
            label: "Charge Delay",
            postfix: "s",
        },
        Damage: {
            value: 40,
            css_class: "tech_damage",
            scale_function: {
                class_name: "scale_function_tech_damage",
                specific_stat_scale_type: "ETechPower",
                stat_scale: 0.6,
            },
            label: "Damage",
            icon: `${PROPS}/damage_magic_color.svg`,
        },
        SlowPercent: {
            value: "28",
            css_class: "slow",
            usage_flags: ["ConditionallyApplied"],
            prefix: "-",
            label: "Move Speed",
            postfix: "%",
            icon: `${PROPS}/condition_slow.svg`,
        },
        SlowDuration: { value: "4", css_class: "duration", label: "Slow Duration", postfix: "s" },
        IncomingDamagePercentFromCaster: {
            value: "16",
            css_class: "damage",
            prefix: "{s:sign}",
            label: "Damage Taken",
            postfix: "%",
        },
        LifestealPercentHero: { value: "0", css_class: "healing", label: "Lifesteal", postfix: "%" },
        HealAmpReceivePenaltyPercent: {
            value: "0",
            css_class: "healing",
            prefix: "",
            label: "Incoming Healing",
            postfix: "%",
        },
        DebuffDuration: { value: "8", css_class: "duration", label: "Debuff Duration", postfix: "s" },
        UnlabelledValue: { value: "3" },
        ScaleOnly: { value: "0", label: "Scale Only" },
    },
    tooltip_details: {
        info_sections: [
            {
                loc_string:
                    `Spew an incendiary mixture, dealing ${SVG}\n<span class="inline-attribute-label SpiritDamage">spirit damage</span>, ` +
                    `applying <img src="${PROPS}/condition_slow.svg" class="inline-attribute Slow" alt="slow"/>` +
                    '<span class="inline-attribute-label Slow">slow</span> for {s:SlowDuration}s.',
                properties_block: [
                    { properties: [{ important_property: "Damage" }] },
                    {
                        loc_string: "On Hit:",
                        properties: [
                            {
                                show_property_value: false,
                                important_property: "SlowPercent",
                                status_effect_value: "SlowDuration",
                            },
                            { important_property: "SlowDuration" },
                        ],
                    },
                ],
            },
            {
                properties_block: [
                    {
                        loc_string: "Napalm Effects:",
                        properties: [
                            { important_property: "IncomingDamagePercentFromCaster" },
                            { important_property: "LifestealPercentHero" },
                            { important_property: "HealAmpReceivePenaltyPercent" },
                        ],
                    },
                ],
                basic_properties: ["DebuffDuration", "UnlabelledValue", "NotAProperty", "ScaleOnly"],
            },
        ],
    },
    description: {
        desc: "unused",
        t2_desc: 'Napalm Effect: +<span class="highlight">{s:LifestealPercentHero}% Lifesteal</span>',
        t3_desc: 'Napalm Effect: <span class="highlight">+17%</span> Damage Taken',
    },
    upgrades: [
        {
            property_upgrades: [
                { name: "AbilityCharges", bonus: "1" },
                { name: "ScaleOnly", bonus: "5", upgrade_type: "EAddToScale" },
            ],
        },
        { property_upgrades: [{ name: "LifestealPercentHero", bonus: "15" }] },
        {
            property_upgrades: [
                { name: "IncomingDamagePercentFromCaster", bonus: "17" },
                { name: "HealAmpReceivePenaltyPercent", bonus: "-33" },
                { name: "HealAmpRegenPenaltyPercent", bonus: "-33" },
                { name: "Damage", bonus: "0.2", upgrade_type: "EAddToScale" },
            ],
        },
    ],
};

// Shaped after `citadel_ability_bull_charge` (Abrams's Shoulder Charge): a status cell names an effect.
const SHOULDER_CHARGE = {
    id: 2824119765,
    class_name: "citadel_ability_bull_charge",
    name: "Shoulder Charge",
    type: "ability",
    ability_type: "signature",
    properties: {
        StunDuration: {
            value: "0.3",
            css_class: "duration",
            scale_function: { class_name: "scale_function_single_stat", specific_stat_scale_type: "ETechDuration" },
            label: "Stun Duration",
            postfix: "s",
        },
    },
    tooltip_details: {
        info_sections: [
            {
                properties_block: [
                    {
                        properties: [
                            {
                                show_property_value: true,
                                important_property: "StatusEffectStun",
                                status_effect_value: "StunDuration",
                                status_effect_name: "Stun",
                                important_property_icon: `${PROPS}/condition_stun.svg`,
                            },
                            {
                                important_property: "StatusEffectDisplacement",
                                status_effect_value: "StunDuration",
                                status_effect_name: "Displacement",
                            },
                        ],
                    },
                ],
            },
        ],
    },
    upgrades: [],
};

// Shaped after `upgrade_close_quarters` in the public items asset.
const CLOSE_QUARTERS = {
    id: 1342610602,
    class_name: "upgrade_close_quarters",
    name: "Close Quarters",
    type: "upgrade",
    item_slot_type: "weapon",
    item_tier: 1,
    cost: 800,
    properties: {
        AbilityCooldown: { value: "0", css_class: "cooldown", disable_value: "0", label: "Cooldown", postfix: "s" },
        CloseRangeBonusWeaponPower: {
            value: "20",
            provided_property_type: "MODIFIER_VALUE_CLOSE_RANGE_WEAPON_DAMAGE_INCREASE",
            css_class: "bullet_damage",
            prefix: "{s:sign}",
            label: "Weapon Damage",
            postfix: "%",
            conditional: "within Range",
            icon: `${PROPS}/damage_bullet_color.svg`,
        },
        CloseRangeBonusDamageRange: {
            value: "15m",
            provided_property_type: "MODIFIER_VALUE_BONUS_WEAPON_DAMAGE_CLOSE_RANGE_MAX_RANGE",
            css_class: "distance",
            label: "Close Range",
            postfix: "m",
            icon: `${PROPS}/range.svg`,
        },
        MeleeResistPercent: {
            value: "20",
            provided_property_type: "MODIFIER_VALUE_MELEE_RESIST",
            prefix: "{s:sign}",
            label: "Melee Resist",
            postfix: "%",
        },
    },
    tooltip_sections: [
        {
            section_type: "innate",
            section_attributes: [{ properties: ["MeleeResistPercent"], elevated_properties: [] }],
        },
        {
            section_type: "passive",
            section_attributes: [
                {
                    loc_string:
                        `<img src="${RES}/images/upgrades/property_bullet_armor.png" class="inline-attribute BulletResist"/>` +
                        'Deal additional <span class="highlight">Weapon Damage</span> within {s:CloseRangeBonusDamageRange}m.',
                    properties: ["CloseRangeBonusDamageRange"],
                    important_properties: ["CloseRangeBonusWeaponPower"],
                },
            ],
        },
    ],
};

// Shaped after `upgrade_silencer`: an active section, a proc cooldown and a status cell with its own icon.
const SILENCER = {
    id: 1113837674,
    class_name: "upgrade_silencer",
    name: "Silencer",
    type: "upgrade",
    item_slot_type: "weapon",
    item_tier: 3,
    cost: 3200,
    properties: {
        AbilityCooldown: { value: "30", css_class: "cooldown", disable_value: "0", label: "Cooldown", postfix: "s" },
        ProcCooldown: { value: "12", css_class: "cooldown", label: "Cooldown", postfix: "s" },
        SilenceDuration: { value: "2.5", css_class: "duration", label: "Silence Duration", postfix: "s" },
        SwitchedOff: { value: "0", label: "Switched Off" },
    },
    tooltip_sections: [
        {
            section_type: "passive",
            section_attributes: [
                {
                    properties: ["SilenceDuration", "ProcCooldown", "SwitchedOff"],
                    important_properties_with_icon: [
                        { name: "StatusEffectEMP", icon: `${PROPS}/condition_silence.svg`, localized_name: "Silenced" },
                    ],
                },
            ],
        },
        { section_type: "active", section_attributes: [{ properties: ["SilenceDuration"] }] },
        { section_type: "hidden", section_attributes: [{ properties: ["SilenceDuration"] }] },
    ],
};

// An item whose tooltip shows only a status cell lists no stats but still has its sections.
const STATUS_ONLY = {
    id: 3,
    class_name: "upgrade_status_only",
    name: "Status Only",
    type: "upgrade",
    item_slot_type: "spirit",
    item_tier: 1,
    cost: 800,
    properties: { AbilityCooldown: { value: "0", label: "Cooldown", postfix: "s" } },
    tooltip_sections: [
        {
            section_attributes: [
                { important_properties_with_icon: [{ name: "StatusEffectStun", localized_name: "Stun" }] },
            ],
        },
        { section_type: "active", section_attributes: [{}] },
    ],
};

// Shaped after `upgrade_magic_shield` (Enchanter's Emblem) in the public items asset: the game's ALT "See Details"
// counts its passive Spirit Power and cooldown reduction in the value after purchase.
const ENCHANTERS_EMBLEM = {
    id: 3970837787,
    class_name: "upgrade_magic_shield",
    name: "Enchanter's Emblem",
    type: "upgrade",
    item_slot_type: "vitality",
    item_tier: 2,
    cost: 1600,
    properties: {
        TechPower: {
            value: "15",
            provided_property_type: "MODIFIER_VALUE_TECH_POWER",
            usage_flags: ["IntrinsicallyProvidedInAbility"],
            label: "Spirit Power",
        },
        CooldownReduction: {
            value: "5",
            provided_property_type: "MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE",
            usage_flags: ["IntrinsicallyProvidedInAbility"],
            label: "Ability Cooldown Reduction",
            postfix: "%",
        },
        TechResist: {
            value: "18",
            provided_property_type: "MODIFIER_VALUE_TECH_RESIST",
            label: "Spirit Resist",
            postfix: "%",
        },
        LifeThreshold: { value: "65", postfix: "%" },
    },
    tooltip_sections: [
        { section_type: "innate", section_attributes: [{ elevated_properties: ["TechResist"] }] },
        { section_type: "passive", section_attributes: [{ important_properties: ["TechPower", "CooldownReduction"] }] },
    ],
};

const INFERNO_WEAPON = {
    id: 2,
    class_name: "citadel_weapon_inferno_set",
    name: "Inferno Weapon",
    type: "weapon",
    weapon_info: { bullet_damage: 5.5 },
};

const file = (path: string) => ({ [path.split("/").pop()!]: path });

// The public icon set's folder tree, which lists every icon file the asset host has.
const ICONS = {
    icons: {
        properties: {
            ...file(`${PROPS}/cooldown.svg`),
            ...file(`${PROPS}/damage_magic_color.svg`),
            ...file(`${PROPS}/condition_slow.svg`),
            ...file(`${PROPS}/condition_stun.svg`),
            ...file(`${PROPS}/condition_silence.svg`),
            ...file(`${PROPS}/damage_bullet_color.svg`),
            ...file(`${PROPS}/range.svg`),
        },
    },
    upgrades: file(`${RES}/icons/upgrades/property_range.svg`),
};

const ITEMS = [NAPALM, SHOULDER_CHARGE, CLOSE_QUARTERS, SILENCER, STATUS_ONLY, ENCHANTERS_EMBLEM, INFERNO_WEAPON];

const tier = (gold_threshold: number, bonus: number, percent_on_graph: number) => ({
    gold_threshold,
    bonus,
    percent_on_graph,
});

// Shaped after Infernus in the public heroes asset.
const HEROES = [
    {
        id: 1,
        class_name: "hero_inferno",
        name: "Infernus",
        items: { weapon_primary: "citadel_weapon_inferno_set", weapon_melee: "ability_melee_inferno" },
        starting_stats: {
            max_move_speed: { value: 6.7, display_stat_name: "EMaxMoveSpeed" },
            light_melee_damage: { value: 50, display_stat_name: "ELightMeleeDamage" },
            max_health: { value: 830, display_stat_name: "EMaxHealth" },
            base_health_regen: { value: 2, display_stat_name: "EBaseHealthRegen" },
            unnamed: { value: 3 },
        },
        standard_level_up_upgrades: {
            MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL: 0.088,
            MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL: 39,
            MODIFIER_VALUE_TECH_POWER: 1.1,
        },
        cost_bonuses: {
            weapon: [tier(1600, 12, 7), tier(800, 9, 7)],
            vitality: [tier(800, 9, 7)],
            spirit: [tier(800, 7, 7), tier(28800, 100, 11)],
        },
    },
    { id: 2, class_name: "hero_gigawatt", name: "Seven", items: {} },
];

const prop = (
    key: string,
    value: number | null,
    unit: string | null,
    label: string,
    cssClass: string | null,
    more: Record<string, unknown> = {},
) => ({
    key,
    value,
    unit,
    label,
    signed: false,
    cssClass,
    displayType: null,
    scale: null,
    statusEffect: false,
    conditional: false,
    negative: false,
    ...more,
});

describe("build editor game data from the default scenario", () => {
    const handles: DemoHandle[] = [];
    const start = () => {
        vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === `${ASSETS}/items`) return Response.json(ITEMS);
            if (url === `${ASSETS}/heroes`) return Response.json(HEROES);
            if (url === `${ASSETS}/icons`) return Response.json(ICONS);
            return new Response("not found", { status: 404 });
        });
        const handle = install(defaultScenario(OPTIONS));
        handles.push(handle);
        return handle;
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
        vi.unstubAllGlobals();
    });

    const tooltips = async () => (await start().invoke("game_ability_tooltips", { locale: "en" })) as AbilityTooltip[];

    it("gives every hero ability's tooltip, sorted by ability id", async () => {
        expect((await tooltips()).map((t) => [t.abilityId, t.className, t.name])).toEqual([
            [491391007, "ability_incendiary_projectile", "Napalm"],
            [2824119765, "citadel_ability_bull_charge", "Shoulder Charge"],
        ]);
    });

    it("puts the shown chips in the header, the charges and the cooldown apart", async () => {
        const napalm = (await tooltips())[0]!;
        const single = (stat: string) => ({ stat, factor: null, function: "scale_function_single_stat" });
        expect(napalm.header).toEqual([
            prop("AbilityCastRange", 20, "m", "Cast Range", "range", { scale: single("ETechRange") }),
        ]);
        expect(napalm.charges).toEqual(prop("AbilityCharges", 1, null, "Charges", "cast"));
        expect(napalm.chargeCooldown).toEqual(
            prop("AbilityCooldownBetweenCharge", 6, "s", "Charge Delay", "charge_cooldown"),
        );
        expect(napalm.cooldown).toEqual(
            prop("AbilityCooldown", 25, "s", "Cooldown", "cooldown", { scale: single("ETechCooldown") }),
        );
    });

    it("keeps the game's sections, with the tier that first shows a zero property", async () => {
        const [first, second] = (await tooltips())[0]!.sections;
        expect(first).toEqual({
            description:
                'Spew an incendiary mixture, dealing <span class="inline-attribute-label SpiritDamage">spirit damage</span>, ' +
                'applying <span class="inline-attribute-label Slow">slow</span> for {s:SlowDuration}s.',
            values: { SlowDuration: 4 },
            groups: [
                {
                    title: null,
                    cells: [
                        prop("Damage", 40, null, "Damage", "tech_damage", {
                            scale: { stat: "ETechPower", factor: 0.6, function: "scale_function_tech_damage" },
                        }),
                    ],
                },
                {
                    title: "On Hit:",
                    cells: [
                        prop("SlowPercent", 28, "%", "Move Speed", "slow", { prefix: "-", conditional: true }),
                        prop("SlowDuration", 4, "s", "Slow Duration", "duration"),
                    ],
                },
            ],
            properties: [],
            requiredTier: null,
        });
        expect(second).toEqual({
            description: null,
            values: {},
            groups: [
                {
                    title: "Napalm Effects:",
                    cells: [
                        prop("IncomingDamagePercentFromCaster", 16, "%", "Damage Taken", "damage", { signed: true }),
                        prop("LifestealPercentHero", 0, "%", "Lifesteal", "healing", { requiredTier: 2 }),
                        prop("HealAmpReceivePenaltyPercent", 0, "%", "Incoming Healing", "healing", {
                            requiredTier: 3,
                        }),
                    ],
                },
            ],
            properties: [prop("DebuffDuration", 8, "s", "Debuff Duration", "duration")],
            requiredTier: null,
        });
    });

    it("gives each upgrade tier its description and labelled bonuses", async () => {
        const upgrades = (await tooltips())[0]!.upgrades;
        expect(upgrades.map((u) => u.tier)).toEqual([1, 2, 3]);
        expect(upgrades[0]).toEqual({
            tier: 1,
            description: null,
            values: {},
            bonuses: [
                { property: prop("AbilityCharges", 1, null, "Charges", "cast"), kind: "addToBase" },
                { property: prop("ScaleOnly", 5, null, "Scale Only", null), kind: "addToScale" },
            ],
        });
        expect(upgrades[1]!.description).toBe(
            'Napalm Effect: +<span class="highlight">{s:LifestealPercentHero}% Lifesteal</span>',
        );
        expect(upgrades[1]!.values).toEqual({ LifestealPercentHero: 15 });
        expect(upgrades[2]!.bonuses.map((b) => [b.property.key, b.property.value, b.kind])).toEqual([
            ["IncomingDamagePercentFromCaster", 17, "addToBase"],
            ["HealAmpReceivePenaltyPercent", -33, "addToBase"],
            ["Damage", 0.2, "addToScale"],
        ]);
    });

    it("names a status cell's effect and takes its number from the property it measures", async () => {
        const charge = (await tooltips())[1]!;
        const scale = { stat: "ETechDuration", factor: null, function: "scale_function_single_stat" };
        expect(charge.sections[0]!.groups[0]!.cells).toEqual([
            prop("StatusEffectStun", 0.3, "s", "Stun", "duration", { statusEffect: true, scale }),
            prop("StatusEffectDisplacement", null, null, "Displacement", "duration", { statusEffect: true, scale }),
        ]);
    });

    it("adds each item's tooltip sections and the condition the ALT rows repeat", async () => {
        const stats = (await start().invoke("game_item_stats", { locale: "en" })) as ItemStats[];
        const quarters = stats.find((s) => s.itemId === CLOSE_QUARTERS.id)!;
        expect(quarters.condition).toBe("within Range");
        expect(quarters.sections).toEqual([
            {
                kind: "innate",
                cooldown: null,
                blocks: [
                    {
                        description: null,
                        values: {},
                        elevated: [],
                        important: [],
                        properties: [prop("MeleeResistPercent", 20, "%", "Melee Resist", null, { signed: true })],
                    },
                ],
            },
            {
                kind: "passive",
                cooldown: null,
                blocks: [
                    {
                        description:
                            'Deal additional <span class="highlight">Weapon Damage</span> within {s:CloseRangeBonusDamageRange}m.',
                        values: { CloseRangeBonusDamageRange: 15 },
                        elevated: [],
                        important: [
                            prop("CloseRangeBonusWeaponPower", 20, "%", "Weapon Damage", "bullet_damage", {
                                signed: true,
                            }),
                        ],
                        properties: [prop("CloseRangeBonusDamageRange", 15, "m", "Close Range", "distance")],
                    },
                ],
            },
        ]);
    });

    it("counts an intrinsically provided passive as always on, and leaves a conditional bonus out", async () => {
        const stats = (await start().invoke("game_item_stats", { locale: "en" })) as ItemStats[];
        const flat = (id: number) =>
            stats.find((s) => s.itemId === id)!.stats.map((s) => [s.key, s.section, s.flat] as const);
        expect(flat(ENCHANTERS_EMBLEM.id)).toEqual([
            ["TechPower", "passive", true],
            ["CooldownReduction", "passive", true],
            ["TechResist", "innate", true],
        ]);
        expect(flat(CLOSE_QUARTERS.id)).toEqual([
            ["CloseRangeBonusWeaponPower", "passive", false],
            ["CloseRangeBonusDamageRange", "passive", false],
            ["MeleeResistPercent", "innate", true],
        ]);
    });

    it("moves a section's cooldown into its header, a proc cooldown first", async () => {
        const stats = (await start().invoke("game_item_stats", { locale: "en" })) as ItemStats[];
        const silencer = stats.find((s) => s.itemId === SILENCER.id)!;
        expect(silencer.condition).toBeUndefined();
        expect(silencer.sections!.map((s) => [s.kind, s.cooldown])).toEqual([
            ["passive", 12],
            ["active", 30],
        ]);
        expect(silencer.sections![0]!.blocks[0]).toEqual({
            description: null,
            values: {},
            elevated: [],
            important: [prop("StatusEffectEMP", null, null, "Silenced", null, { statusEffect: true })],
            properties: [prop("SilenceDuration", 2.5, "s", "Silence Duration", "duration")],
        });
    });

    it("keeps an item with no stats for its sections; a section with no type is passive, a zero cooldown none", async () => {
        const stats = (await start().invoke("game_item_stats", { locale: "en" })) as ItemStats[];
        expect(stats.find((s) => s.itemId === STATUS_ONLY.id)).toEqual({
            itemId: STATUS_ONLY.id,
            stats: [],
            sections: [
                {
                    kind: "passive",
                    cooldown: null,
                    blocks: [
                        {
                            description: null,
                            values: {},
                            elevated: [],
                            important: [prop("StatusEffectStun", null, null, "Stun", null, { statusEffect: true })],
                            properties: [],
                        },
                    ],
                },
                {
                    kind: "active",
                    cooldown: null,
                    blocks: [{ description: null, values: {}, elevated: [], important: [], properties: [] }],
                },
            ],
        });
    });

    it("gives each icon class, status effect and inline keyword its public icon, sorted by class", async () => {
        // The asset names some files the host does not have, such as BulletResist's image: only listed icons are given.
        const art = (await start().invoke("game_property_icon_art", {})) as PropertyIconArt[];
        const icon = (cls: string, path: string) => ({ class: cls, path, wash: null, color: null });
        expect(art).toEqual([
            icon("Slow", `${PROPS}/condition_slow.svg`),
            icon("StatusEffectEMP", `${PROPS}/condition_silence.svg`),
            icon("StatusEffectStun", `${PROPS}/condition_stun.svg`),
            icon("bullet_damage", `${PROPS}/damage_bullet_color.svg`),
            icon("cooldown", `${PROPS}/cooldown.svg`),
            icon("distance", `${PROPS}/range.svg`),
            icon("range", `${RES}/icons/upgrades/property_range.svg`),
            icon("slow", `${PROPS}/condition_slow.svg`),
            icon("tech_damage", `${PROPS}/damage_magic_color.svg`),
        ]);
    });

    it("gives a hero's starting stats, level gains, slot investment, bullet damage and weapon abilities", async () => {
        expect(await start().invoke("game_hero_stats", { heroId: 1 })).toEqual({
            heroId: 1,
            base: { EMaxMoveSpeed: 6.7, ELightMeleeDamage: 50, EMaxHealth: 830, EBaseHealthRegen: 2 },
            perLevel: {
                MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL: 0.088,
                MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL: 39,
                MODIFIER_VALUE_TECH_POWER: 1.1,
            },
            investment: {
                weapon: [
                    { souls: 800, bonus: 9, percentOnGraph: 7 },
                    { souls: 1600, bonus: 12, percentOnGraph: 7 },
                ],
                spirit: [
                    { souls: 800, bonus: 7, percentOnGraph: 7 },
                    { souls: 28800, bonus: 100, percentOnGraph: 11 },
                ],
                vitality: [{ souls: 800, bonus: 9, percentOnGraph: 7 }],
            },
            bulletDamage: 5.5,
            weaponAbility: "citadel_weapon_inferno_set",
            meleeAbility: "ability_melee_inferno",
        });
    });

    it("gives a hero without tables empty ones, and no stats for an unknown hero", async () => {
        const handle = start();
        expect(await handle.invoke("game_hero_stats", { heroId: 2 })).toStrictEqual({
            heroId: 2,
            base: {},
            perLevel: {},
            investment: { weapon: [], spirit: [], vitality: [] },
            bulletDamage: null,
        });
        expect(await handle.invoke("game_hero_stats", { heroId: 999 })).toBeNull();
    });

    it("gives the game's English UI strings for English, and none for another language", async () => {
        const handle = start();
        const english = (await handle.invoke("game_ui_strings", { locale: "en" })) as Record<string, string>;
        expect(Object.keys(english)).toHaveLength(21);
        expect(english.Citadel_ItemViewImpact).toBe("See Details");
        expect(english.Citadel_ItemModifies).toBe("Modifies");
        expect(english.Citadel_Mod_Tooltip_Passive).toBe("Passive");
        expect(english.Citadel_PopularityLabel_Early).toBe("Purchased early game in {d:popular_pct}% of matches.");
        expect(english.StatDesc_BulletDamage).toBe("Bullet Damage");
        expect(english.StatDesc_TechPower).toBe("Spirit Power");
        expect(await handle.invoke("game_ui_strings", { locale: "de" })).toEqual({});
    });

    it("answers as an unreadable game does when the assets cannot be fetched", async () => {
        vi.stubGlobal("fetch", async () => {
            throw new TypeError("Failed to fetch");
        });
        const handle = install(defaultScenario(OPTIONS));
        handles.push(handle);
        expect(await handle.invoke("game_ability_tooltips", { locale: "en" })).toEqual([]);
        expect(await handle.invoke("game_property_icon_art", {})).toEqual([]);
        expect(await handle.invoke("game_hero_stats", { heroId: 1 })).toBeNull();
    });
});
