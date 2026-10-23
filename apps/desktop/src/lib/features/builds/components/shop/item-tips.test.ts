import type { AbilityProperty } from "@deadlock-plus/ipc-types/AbilityProperty";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import type { ModEntryView } from "@deadlock-plus/ipc-types/ModEntryView";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadItemArt: vi.fn() }));
vi.mock("$lib/features/gamedata/art-refresh", () => ({ onGameArtChanged: vi.fn() }));

import type { TooltipSection } from "@deadlock-plus/ipc-types/TooltipSection";
import type { ShopItem, ShopSlot } from "../../catalog";
import type { PhaseStats } from "../../editor/popularity";
import type { Level } from "../../levels";
import {
    altWatch,
    heroStatLabel,
    heroStatText,
    hoverProps,
    tipInput,
    tipSide,
    trackAlt,
    type TipHost,
} from "./item-tips";

const tier = (souls: number, bonus: number) => ({ souls, bonus, percentOnGraph: 7 });

const SEVEN: HeroStatsData = {
    heroId: 2,
    base: { EMaxHealth: 730 },
    perLevel: { MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL: 0.24, MODIFIER_VALUE_TECH_POWER: 1.1 },
    investment: { weapon: [tier(800, 9)], spirit: [tier(800, 7)], vitality: [tier(800, 9)] },
    bulletDamage: 10.8,
};

const item = (id: number, slot: ShopSlot, cost: number): ShopItem => ({
    id,
    className: `upgrade_${id}`,
    name: `Item ${id}`,
    slot,
    tier: 1,
    cost,
    active: false,
    componentIds: [],
    shopable: true,
    disabled: false,
});

const stat = (provides: string, value: number): ItemStat => ({
    key: provides,
    value,
    unit: null,
    label: provides,
    flat: true,
    provides,
    section: "innate",
});

const HEADSHOT_BOOSTER = 1;
const EXTRA_SPIRIT = 2;
const EXTRA_HEALTH = 3;
const MYSTIC_SHOT = 4;
const TOXIC_BULLETS = 5;
const SPIRIT_RESILIENCE = 6;
const ALCHEMICAL_FIRE = 7;

const CATALOG = {
    byId: new Map([
        [HEADSHOT_BOOSTER, item(HEADSHOT_BOOSTER, "weapon", 800)],
        [EXTRA_SPIRIT, item(EXTRA_SPIRIT, "spirit", 800)],
        [EXTRA_HEALTH, item(EXTRA_HEALTH, "vitality", 800)],
        [MYSTIC_SHOT, item(MYSTIC_SHOT, "spirit", 800)],
        [TOXIC_BULLETS, { ...item(TOXIC_BULLETS, "weapon", 1600), art: "toxic.png" }],
        [SPIRIT_RESILIENCE, item(SPIRIT_RESILIENCE, "vitality", 800)],
        [ALCHEMICAL_FIRE, { ...item(ALCHEMICAL_FIRE, "spirit", 800), art: "fire.png" }],
    ]),
    statsById: new Map([
        [EXTRA_SPIRIT, [stat("MODIFIER_VALUE_TECH_POWER", 10)]],
        [EXTRA_HEALTH, [stat("MODIFIER_VALUE_HEALTH_MAX", 150)]],
        [SPIRIT_RESILIENCE, [stat("MODIFIER_VALUE_TECH_RESIST", 18)]],
    ]),
    sectionsById: new Map<number, TooltipSection[]>(),
};

const level = (n: number, souls: number): Level => ({
    level: n,
    souls,
    ap: 0,
    unlocks: 0,
    apGained: 0,
    unlocksGained: 0,
});

// Net worth starts at 600 souls, so level 2 comes at 1200 and level 3 at 2000.
const LEVELS = [level(1, 0), level(2, 600), level(3, 1400)];

const mod = (abilityId: number, over: Partial<ModEntryView> = {}): ModEntryView => ({
    abilityId,
    annotation: null,
    requiredFlexSlots: null,
    sellPriority: null,
    imbueTargetAbilityId: null,
    ...over,
});

function build(categories: { optional?: boolean; mods: ModEntryView[] }[]): BuildView {
    return {
        heroBuildId: 1,
        heroId: 2,
        authorAccountId: 1,
        lastUpdatedTimestamp: null,
        name: "Build",
        description: "",
        language: 0,
        version: 1,
        originBuildId: null,
        modCategories: categories.map((c, i) => ({
            name: `Category ${i}`,
            description: "",
            width: null,
            height: null,
            optional: c.optional ?? false,
            mods: c.mods,
        })),
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

const API: PhaseStats = {
    early: new Map([[EXTRA_SPIRIT, { pickPct: 41.2, winPct: 52.6, matches: 10 }]]),
    mid: new Map(),
    late: new Map([[EXTRA_SPIRIT, { pickPct: 9, winPct: 47, matches: 3 }]]),
};

const host = (over: Partial<TipHost> = {}): TipHost => ({
    hero: SEVEN,
    heroIcon: "seven.png",
    label: (stat) => `label:${stat}`,
    icon: (stat) => `icon:${stat}`,
    weaponIcon: "weapon.png",
    position: "right",
    detailView: false,
    ...over,
});

describe("tipInput outside a build", () => {
    it("compares the hero at level 1 with nothing against the hero owning the item", () => {
        const input = tipInput({ catalog: CATALOG }, HEADSHOT_BOOSTER, host())!;
        const row = input.details!.groups[0]!.changes[0]!;
        expect(row).toMatchObject({ key: "EBulletDamage", label: "label:EBulletDamage", before: 10.8 });
        expect(row.after).toBeCloseTo(10.8 * 1.09);
        expect(input.details!.groups[0]).toMatchObject({ kind: "ability", icon: "weapon.png" });
        expect(input.ownedIds).toEqual([]);
        expect(input.heroStats?.ETechPower ?? 0).toBe(0);
        expect(input.heroIcon).toBe("seven.png");
    });

    it("has the ALT column and passes the side and the ALT state through", () => {
        const input = tipInput({ catalog: CATALOG }, HEADSHOT_BOOSTER, host({ position: "left", detailView: true }))!;
        expect(input.hasDetails).toBe(true);
        expect(input.position).toBe("left");
        expect(input.detailView).toBe(true);
        expect(input.buildNote).toBeNull();
    });

    it("lists the hero's pick and win rates per phase from deadlock-api", () => {
        const popularity = { game: new Map(), icon: "head.png", api: API };
        const input = tipInput({ catalog: CATALOG, popularity }, EXTRA_SPIRIT, host())!;
        expect(input.details!.phases).toEqual([
            { phase: "early", pickPercent: 41.2, winPercent: 52.6 },
            { phase: "late", pickPercent: 9, winPercent: 47 },
        ]);
    });

    it("keeps the phase rates while the hero's stats are not loaded", () => {
        const popularity = { game: new Map(), icon: null, api: API };
        const input = tipInput({ catalog: CATALOG, popularity }, EXTRA_SPIRIT, host({ hero: null }))!;
        expect(input.details).toEqual({ groups: [], condition: null, phases: expect.any(Array) });
        expect(input.hasDetails).toBe(true);
        expect(input.heroStats).toBeUndefined();
    });

    it("has no ALT column with neither hero stats nor rates", () => {
        const input = tipInput({ catalog: CATALOG }, HEADSHOT_BOOSTER, host({ hero: null }))!;
        expect(input.details).toBeNull();
        expect(input.hasDetails).toBe(false);
    });

    it("is null for an item the catalog does not know", () => {
        expect(tipInput({ catalog: CATALOG }, 99, host())).toBeNull();
    });
});

describe("tipInput in a build", () => {
    const BUILD = build([
        { mods: [mod(EXTRA_SPIRIT), mod(EXTRA_HEALTH, { annotation: "  Rush it  ", sellPriority: 2 })] },
        { mods: [mod(HEADSHOT_BOOSTER, { imbueTargetAbilityId: 70 })] },
    ]);
    const kit = { abilities: new Map([[70, { id: 70, name: "Burst Fire", art: "burst.png" }]]), levels: LEVELS };

    it("shows the hero at the item's point in Quick Buy order, owning what comes before it", () => {
        const input = tipInput({ catalog: CATALOG, build: BUILD, kit }, EXTRA_HEALTH, host())!;
        expect(input.ownedIds).toEqual([EXTRA_SPIRIT]);
        // The game lists no Max Health row (Headshot Booster's +30 health had none).
        expect(input.details!.groups).toEqual([]);
        // Owned at that point: the tooltip's scaled values count the item itself, as the souls timeline does.
        expect(input.heroStats!.ETechPower).toBeCloseTo(1.1 + 10 + 7);
        expect(input.heroStats!.EMaxHealth).toBeCloseTo((730 + 150) * 1.09);
    });

    it("shows the build author's note, sell priority and imbue suggestion", () => {
        expect(tipInput({ catalog: CATALOG, build: BUILD, kit }, EXTRA_HEALTH, host())!.buildNote).toEqual({
            text: "  Rush it  ",
            sellPriority: 2,
            imbueTarget: null,
        });
        expect(tipInput({ catalog: CATALOG, build: BUILD, kit }, HEADSHOT_BOOSTER, host())!.buildNote).toEqual({
            text: null,
            sellPriority: null,
            imbueTarget: { name: "Burst Fire", icon: "burst.png" },
        });
    });

    it("drops an imbue suggestion for an ability the hero does not have", () => {
        const input = tipInput({ catalog: CATALOG, build: BUILD, kit: null }, HEADSHOT_BOOSTER, host())!;
        expect(input.buildNote?.imbueTarget).toBeNull();
    });

    it("shows an item the build lacks as bought after the whole Quick Buy order", () => {
        const input = tipInput({ catalog: CATALOG, build: BUILD, kit }, MYSTIC_SHOT, host())!;
        expect(input.ownedIds).toEqual([EXTRA_SPIRIT, EXTRA_HEALTH, HEADSHOT_BOOSTER]);
        expect(input.buildNote).toBeNull();
        // 3200 net worth reaches level 3; the item is not owned yet, so it is left out of the hero.
        expect(input.heroStats!.ETechPower).toBeCloseTo(2 * 1.1 + 10 + 7);
    });

    it("takes the note of an item in an optional category but prices it after Quick Buy", () => {
        const optional = build([
            { mods: [mod(EXTRA_SPIRIT)] },
            { optional: true, mods: [mod(MYSTIC_SHOT, { annotation: "Late" })] },
        ]);
        const input = tipInput({ catalog: CATALOG, build: optional, kit }, MYSTIC_SHOT, host())!;
        expect(input.ownedIds).toEqual([EXTRA_SPIRIT]);
        expect(input.buildNote?.text).toBe("Late");
    });

    it("stays at level 1 without a level table", () => {
        const input = tipInput({ catalog: CATALOG, build: BUILD, kit: null }, MYSTIC_SHOT, host())!;
        expect(input.heroStats!.ELevelUpBoons).toBe(0);
    });
});

describe("tipSide", () => {
    it("reads the side the tooltip was placed on, right unless it flipped left", () => {
        expect(tipSide("left")).toBe("left");
        expect(tipSide("right")).toBe("right");
        expect(tipSide(undefined)).toBe("right");
        expect(tipSide("bottom")).toBe("right");
    });
});

describe("heroStatText", () => {
    it("names the ALT rows' stats with the game's words, else app keys", () => {
        expect(heroStatText("EBulletDamage")).toEqual({
            key: "builds.hero_stat.bullet_damage",
            params: {},
            game: { token: "StatDesc_BulletDamage", params: {} },
        });
        expect(heroStatText("ETechArmorDamageReduction")).toMatchObject({
            key: "builds.hero_stat.spirit_resist",
            game: { token: "StatDesc_TechArmorDamageReduction" },
        });
        expect(heroStatText("ESomethingNew")).toBeNull();
    });

    it("labels a stat through the host's game text, and an unknown one by its enum", () => {
        const label = heroStatLabel((text) => `game:${text.game?.token}`);
        expect(label("ETechArmorDamageReduction")).toBe("game:StatDesc_TechArmorDamageReduction");
        expect(label("ESomethingNew")).toBe("ESomethingNew");
    });
});

describe("tipInput ALT details", () => {
    it("repeats the item's condition under the rows", () => {
        const catalog = { ...CATALOG, conditionById: new Map([[HEADSHOT_BOOSTER, "within Range"]]) };
        expect(tipInput({ catalog }, HEADSHOT_BOOSTER, host())!.details!.condition).toBe("within Range");
        expect(tipInput({ catalog }, EXTRA_SPIRIT, host())!.details!.condition).toBeNull();
    });

    const property = (key: string, factor: number | null): AbilityProperty => ({
        key,
        value: 30,
        unit: null,
        label: key,
        signed: false,
        cssClass: "tech_damage",
        displayType: null,
        scale: factor === null ? null : { stat: "ETechPower", factor, function: "scale_function_tech_damage" },
        statusEffect: false,
    });
    const tooltip = (abilityId: number, cells: AbilityProperty[]): AbilityTooltip => ({
        abilityId,
        className: `ability_${abilityId}`,
        name: `Ability ${abilityId}`,
        header: [],
        charges: null,
        chargeCooldown: null,
        cooldown: null,
        sections: [
            { description: null, values: {}, groups: [{ title: null, cells }], properties: [], requiredTier: null },
        ],
        upgrades: [1, 2, 3].map((tier) => ({
            tier,
            description: null,
            values: {},
            bonuses: [{ property: { ...property("Damage", null), value: 0.5 }, kind: "addToScale" as const }],
        })),
    });
    const BURST = 70;
    const FLAT = 71;
    const abilityTooltips = new Map([
        [BURST, tooltip(BURST, [property("Damage", 0.5)])],
        [FLAT, tooltip(FLAT, [property("Damage", null)])],
    ]);
    // One unlock at level 1, one ability point by level 2, three by level 3.
    const levels = [
        { ...level(1, 0), unlocks: 1 },
        { ...level(2, 600), unlocks: 1, ap: 1 },
        { ...level(3, 1400), unlocks: 1, ap: 3 },
    ];
    const kit = {
        abilities: new Map([
            [BURST, { id: BURST, name: "Burst Fire", art: "burst.png" }],
            [FLAT, { id: FLAT, name: "Flat", art: "flat.png" }],
        ]),
        levels,
    };
    const trained: BuildView = {
        ...build([{ mods: [mod(EXTRA_HEALTH), mod(EXTRA_SPIRIT), mod(HEADSHOT_BOOSTER)] }]),
        abilityOrder: [
            { abilityId: BURST, currencyType: 2, delta: -1, annotation: null },
            { abilityId: BURST, currencyType: 1, delta: -1, annotation: null },
            { abilityId: BURST, currencyType: 1, delta: -2, annotation: null },
        ],
    };

    it("lists a spirit item's effect on each ability's spirit-scaled values, at the tiers trained by then", () => {
        const input = tipInput({ catalog: CATALOG, build: trained, kit }, EXTRA_SPIRIT, host({ abilityTooltips }))!;
        // Level 2 at 1600 net worth: Burst Fire has tier 1, which doubles its spirit scaling.
        expect(input.details!.groups).toEqual([
            {
                kind: "ability",
                icon: "burst.png",
                changes: [
                    {
                        key: `ability:${BURST}:Damage`,
                        label: "Damage",
                        before: 31,
                        after: 48,
                        decimals: 1,
                        postfix: null,
                    },
                ],
            },
        ]);
    });

    it("uses the base tier outside a build", () => {
        const input = tipInput({ catalog: CATALOG, kit }, EXTRA_SPIRIT, host({ abilityTooltips }))!;
        const change = input.details!.groups[0]!.changes[0]!;
        expect([change.before, change.after]).toEqual([30, 38]);
    });

    it("lists the abilities any item changes, not only spirit items", () => {
        const spiritWeapon = new Map([[HEADSHOT_BOOSTER, [stat("MODIFIER_VALUE_TECH_POWER", 10)]]]);
        const source = { catalog: { ...CATALOG, statsById: spiritWeapon }, build: trained, kit };
        const groups = tipInput(source, HEADSHOT_BOOSTER, host({ abilityTooltips }))!.details!.groups;
        expect(groups.map((g) => [g.kind, g.icon])).toEqual([
            ["ability", "weapon.png"],
            ["ability", "burst.png"],
        ]);
    });

    it("adds no ability rows without the abilities' tooltips", () => {
        expect(tipInput({ catalog: CATALOG, build: trained, kit }, EXTRA_SPIRIT, host())!.details!.groups).toEqual([]);
    });

    it("marks an ability an owned imbue item is imbued on", () => {
        const imbue = { ...item(MYSTIC_SHOT, "spirit", 800), imbue: true };
        const catalog = { ...CATALOG, byId: new Map(CATALOG.byId).set(MYSTIC_SHOT, imbue) };
        const imbued: BuildView = {
            ...build([{ mods: [mod(MYSTIC_SHOT, { imbueTargetAbilityId: BURST }), mod(EXTRA_SPIRIT)] }]),
            abilityOrder: trained.abilityOrder,
        };
        const input = tipInput({ catalog, build: imbued, kit }, EXTRA_SPIRIT, host({ abilityTooltips }))!;
        expect(input.details!.groups[0]).toMatchObject({ kind: "ability", icon: "burst.png", imbued: true });
        const plain = tipInput({ catalog, build: trained, kit }, EXTRA_SPIRIT, host({ abilityTooltips }))!;
        expect(plain.details!.groups[0]!.imbued).toBeUndefined();
    });

    // Graves with Compress Cooldown imbued on Grasping Hands, buying Superior Cooldown (capture nUeFQZwFv9).
    describe("with an imbue-only stat", () => {
        const COMPRESS = 20;
        const SUPERIOR = 21;
        const cdr = "MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE";
        const catalog = {
            ...CATALOG,
            byId: new Map(CATALOG.byId)
                .set(COMPRESS, { ...item(COMPRESS, "spirit", 1600), imbue: true })
                .set(SUPERIOR, { ...item(SUPERIOR, "spirit", 3200), componentIds: [COMPRESS] }),
            statsById: new Map([
                [COMPRESS, [{ ...stat(cdr, 18), flat: false, onlyIfImbued: true }]],
                [SUPERIOR, [stat(cdr, 20)]],
            ]),
        };
        const hands: AbilityTooltip = {
            ...tooltip(BURST, []),
            cooldown: {
                ...property("AbilityCooldown", null),
                value: 34,
                unit: "s",
                cssClass: "cooldown",
                scale: { stat: "ETechCooldown", factor: null, function: "scale_function_single_stat" },
            },
        };
        const owning = build([{ mods: [mod(COMPRESS, { imbueTargetAbilityId: BURST }), mod(SUPERIOR)] }]);
        const groupsFor = (id: number) =>
            tipInput({ catalog, build: owning, kit }, id, host({ abilityTooltips: new Map([[BURST, hands]]) }))!;

        it("counts it on the imbued ability until the purchase uses its item up, then drops the imbued background", () => {
            const groups = groupsFor(SUPERIOR).details!.groups;
            expect(groups.map((g) => [g.kind, g.icon, g.imbued])).toEqual([["ability", "burst.png", undefined]]);
            const [cooldown] = groups[0]!.changes;
            // 34 x 0.82 = 27.88 and 34 x 0.8 = 27.2, at the tooltip's one cooldown decimal.
            expect([cooldown!.before, cooldown!.after]).toEqual([27.9, 27.2]);
        });

        // The game shows no ALT panel for Compress Cooldown: its target is picked when it is bought.
        it("shows no ALT panel for the imbue item itself", () => {
            const input = groupsFor(COMPRESS);
            expect(input.details!.groups).toEqual([]);
            expect(input.hasDetails).toBe(false);
        });
    });

    // Enchanter's Emblem lists owned Toxic Bullets' Bleed Damage 3.6 -> 3.6% DPS under its art.
    const scaled = (key: string, value: number, factor: number, unit: string | null) => ({
        ...property(key, factor),
        value,
        unit,
        cssClass: null,
    });
    const sections = (properties: ReturnType<typeof scaled>[]): TooltipSection[] => [
        {
            kind: "passive",
            cooldown: null,
            blocks: [{ description: null, values: {}, elevated: [], important: [], properties }],
        },
    ];
    const withSections = {
        ...CATALOG,
        sectionsById: new Map([
            [TOXIC_BULLETS, sections([scaled("BleedDamage", 3.5, 0.005, "% DPS"), scaled("Flat", 2, 0, null)])],
            [ALCHEMICAL_FIRE, sections([scaled("DPS", 30, 0.5, null)])],
        ]),
    };

    it("lists each owned item's spirit-scaled values under the item's art, in build order", () => {
        const owning = build([{ mods: [mod(TOXIC_BULLETS), mod(ALCHEMICAL_FIRE), mod(EXTRA_SPIRIT)] }]);
        const input = tipInput({ catalog: withSections, build: owning, kit }, EXTRA_SPIRIT, host())!;
        const groups = input.details!.groups;
        expect(groups.map((g) => [g.kind, g.icon])).toEqual([
            ["item", "toxic.png"],
            ["item", "fire.png"],
        ]);
        const bleed = groups[0]!.changes;
        expect(bleed.map((c) => [c.key, c.label, c.decimals, c.postfix])).toEqual([
            [`item:${TOXIC_BULLETS}:BleedDamage`, "BleedDamage", 1, "% DPS"],
        ]);
        // Extra Spirit's 10; the 1600 souls in spirit reach no investment tier past the first.
        expect(bleed[0]!.after - bleed[0]!.before).toBeCloseTo(0.005 * 10);
    });

    it("leaves out owned items the purchase does not change, and orders stats after them", () => {
        const owning = build([{ mods: [mod(TOXIC_BULLETS), mod(ALCHEMICAL_FIRE), mod(SPIRIT_RESILIENCE)] }]);
        const groups = tipInput({ catalog: withSections, build: owning, kit }, SPIRIT_RESILIENCE, host())!.details!
            .groups;
        expect(groups.map((g) => [g.kind, g.icon])).toEqual([["stat", "icon:ETechArmorDamageReduction"]]);
    });
});

describe("trackAlt", () => {
    const key = (type: string, altKey: boolean, k = "Alt") => Object.assign(new Event(type), { key: k, altKey });

    it("follows ALT through key and pointer events and lets go on blur", () => {
        const target = new EventTarget();
        const seen: boolean[] = [];
        trackAlt(target, (held) => seen.push(held));
        target.dispatchEvent(key("keydown", true));
        target.dispatchEvent(key("keydown", true));
        target.dispatchEvent(key("keyup", false));
        target.dispatchEvent(Object.assign(new Event("pointermove"), { altKey: true }));
        target.dispatchEvent(new Event("blur"));
        expect(seen).toEqual([true, false, true, false]);
    });

    it("keeps a bare ALT press from reaching the window, so it cannot enter Windows menu mode", () => {
        const target = new EventTarget();
        trackAlt(target, () => {});
        const cancelable = (type: string, k: string, altKey: boolean) =>
            Object.assign(new Event(type, { cancelable: true }), { key: k, altKey });
        const down = cancelable("keydown", "Alt", true);
        const up = cancelable("keyup", "Alt", false);
        const combo = cancelable("keydown", "F4", true);
        target.dispatchEvent(down);
        target.dispatchEvent(up);
        target.dispatchEvent(combo);
        expect(down.defaultPrevented).toBe(true);
        expect(up.defaultPrevented).toBe(true);
        expect(combo.defaultPrevented).toBe(false);
    });

    it("stops listening when cleaned up", () => {
        const target = new EventTarget();
        const seen: boolean[] = [];
        const stop = trackAlt(target, (held) => seen.push(held));
        stop();
        target.dispatchEvent(key("keydown", true));
        expect(seen).toEqual([]);
    });
});

describe("altWatch", () => {
    const alt = (type = "keydown") =>
        Object.assign(new Event(type, { cancelable: true }), { key: "Alt", altKey: type === "keydown" });

    it("cancels a bare ALT from the moment the pointer enters, before the tooltip opens", () => {
        const target = new EventTarget();
        const seen: boolean[] = [];
        const watch = altWatch(target, (held) => seen.push(held));
        const early = alt();
        target.dispatchEvent(early);
        expect(early.defaultPrevented).toBe(false);

        watch.hover(true);
        const tap = alt();
        target.dispatchEvent(tap);
        expect(tap.defaultPrevented).toBe(true);
        expect(seen).toEqual([true]);
    });

    it("leaves Alt+F4 and Alt+Tab to the window while it listens", () => {
        const target = new EventTarget();
        altWatch(target, () => {}).hover(true);
        for (const k of ["F4", "Tab"]) {
            const combo = Object.assign(new Event("keydown", { cancelable: true }), { key: k, altKey: true });
            target.dispatchEvent(combo);
            expect(combo.defaultPrevented).toBe(false);
        }
    });

    it("keeps ALT held across the tooltip opening and lets go once the pointer has left and it closed", () => {
        const target = new EventTarget();
        const seen: boolean[] = [];
        const watch = altWatch(target, (held) => seen.push(held));
        watch.hover(true);
        target.dispatchEvent(alt());
        watch.open(true);
        watch.hover(false);
        expect(seen).toEqual([true]);
        const stillOpen = alt("keyup");
        target.dispatchEvent(stillOpen);
        expect(stillOpen.defaultPrevented).toBe(true);

        target.dispatchEvent(alt());
        watch.open(false);
        expect(seen).toEqual([true, false, true, false]);
        const after = alt();
        target.dispatchEvent(after);
        expect(after.defaultPrevented).toBe(false);
    });

    it("stops when disposed", () => {
        const target = new EventTarget();
        const watch = altWatch(target, () => {});
        watch.hover(true);
        watch.dispose();
        const tap = alt();
        target.dispatchEvent(tap);
        expect(tap.defaultPrevented).toBe(false);
    });
});

describe("hoverProps", () => {
    const fire = (props: Record<string, unknown>, type: string) =>
        (props[`on${type}`] as (event: Event) => void)(new Event(type));

    it("reports the pointer entering and leaving the trigger and keeps the trigger's own handlers", () => {
        const calls: string[] = [];
        const props = hoverProps(
            {
                id: "trigger",
                onpointerenter: () => calls.push("trigger enter"),
                onpointerleave: () => calls.push("trigger leave"),
            },
            (on) => calls.push(on ? "hover" : "leave"),
        );
        expect(props.id).toBe("trigger");
        fire(props, "pointerenter");
        fire(props, "pointerleave");
        expect(calls).toEqual(["trigger enter", "hover", "trigger leave", "leave"]);
    });

    it("works on a trigger without handlers of its own", () => {
        const seen: boolean[] = [];
        fire(
            hoverProps({}, (on) => seen.push(on)),
            "pointerenter",
        );
        expect(seen).toEqual([true]);
    });
});
