import { describe, expect, it } from "vitest";
import type { TooltipProperty } from "@deadlock-plus/ipc-types/TooltipProperty";
import type { GameItem } from "../item";
import { itemTooltipModel, type ItemTooltipBlock, type ItemTooltipProperty, type ItemTooltipSection } from "./model";

function prop(key: string, value: number | null, label: string, extra: Partial<ItemTooltipProperty> = {}) {
    const base: TooltipProperty = {
        key,
        value,
        unit: null,
        label,
        signed: false,
        cssClass: null,
        displayType: null,
        scale: null,
        statusEffect: false,
    };
    return { ...base, ...extra };
}

function block(extra: Partial<ItemTooltipBlock> = {}): ItemTooltipBlock {
    return { description: null, values: {}, elevated: [], important: [], properties: [], ...extra };
}

const spiritBurnItem: GameItem = {
    id: 1,
    name: "Spirit Burn",
    slot: "spirit",
    tier: 3,
    cost: 3200,
    active: false,
    imbue: false,
};

// Spirit Burn as dp-gamedata reads it from the installed game (english, build 6805).
const spiritBurn: ItemTooltipSection[] = [
    {
        kind: "innate",
        cooldown: null,
        blocks: [
            block({
                properties: [
                    prop("TechRangeMultiplier", 6, "Ability Range", { unit: "%", signed: true, cssClass: "distance" }),
                ],
            }),
        ],
    },
    {
        kind: "passive",
        cooldown: null,
        blocks: [
            block({
                description:
                    'Dealing significant <span class="inline-attribute-label SpiritDamage">spirit damage</span> ' +
                    "within {s:DamageThresholdDuration}s.",
                values: { DamageThresholdDuration: 5 },
                important: [
                    prop("DamageThreshold", 500, "Damage Threshold", { cssClass: "tech_armor_up" }),
                    prop("ExplosionDamage", 50, "Explosion Damage", { cssClass: "tech_damage" }),
                    prop("DPS", 24, "Damage Per Second", {
                        cssClass: "tech_damage",
                        scale: { stat: "ETechPower", factor: 0.06, function: "scale_function_tech_damage" },
                    }),
                ],
                properties: [
                    prop("ImmunityDuration", 20, "Immunity Duration", { unit: "s", cssClass: "cooldown" }),
                    prop("DebuffDuration", 8, "Debuff Duration", { unit: "s", cssClass: "tech_damage" }),
                    prop("HealAmpReceivePenaltyPercent", -70, "Incoming Healing", { unit: "%", negative: true }),
                ],
            }),
        ],
    },
];

// Silencer: innate, then two passives; the second has a status cell and a build-up-rate row.
const silencer: ItemTooltipSection[] = [
    {
        kind: "innate",
        cooldown: null,
        blocks: [block({ properties: [prop("TechResist", 12, "Spirit Resist", { unit: "%", signed: true })] })],
    },
    {
        kind: "passive",
        cooldown: null,
        blocks: [
            block({
                important: [
                    prop("TechDamageReduction", -25, "Spirit Damage Reduction", { unit: "%", cssClass: "tech_damage" }),
                ],
                properties: [prop("DebuffDuration", 6, "Debuff Duration", { unit: "s" })],
            }),
        ],
    },
    {
        kind: "passive",
        cooldown: null,
        blocks: [
            block({
                important: [prop("StatusEffectEMP", 2.5, "Silenced", { unit: "s", statusEffect: true })],
                properties: [
                    prop("ImmunityDuration", 10, "Immunity Duration", { unit: "s" }),
                    prop("BuildUpPerShot", 1.04, "Buildup Per Shot", {
                        unit: "%",
                        displayType: "EBuildUpRate",
                        scale: { stat: "EBuildUpRate", factor: null, function: "scale_function_single_stat" },
                    }),
                ],
            }),
        ],
    },
];

describe("itemTooltipModel header and width", () => {
    it("shows the name and the cost as plain digits", () => {
        const model = itemTooltipModel({ item: { ...spiritBurnItem, cost: 6400 }, sections: [] });
        expect(model.header).toEqual({ name: "Spirit Burn", slot: "spirit", cost: "6400", owned: null, imbued: null });
    });

    it("hides a zero cost", () => {
        expect(itemTooltipModel({ item: { ...spiritBurnItem, cost: 0 }, sections: [] }).header.cost).toBeNull();
    });

    it("swaps the cost for Owned, and Owned for the imbue line when the owned item is imbued", () => {
        const owned = itemTooltipModel({ item: spiritBurnItem, sections: [], owned: true }).header;
        expect(owned.cost).toBeNull();
        expect(owned.owned).toEqual({
            key: "game_ui.item_tooltip.owned",
            params: {},
            game: { token: "Citadel_Shop_Purchased", params: {} },
        });

        const imbued = itemTooltipModel({
            item: spiritBurnItem,
            sections: [],
            owned: true,
            imbuedUpon: "Kinetic Pulse",
        });
        expect(imbued.header.owned).toBeNull();
        expect(imbued.header.imbued).toEqual({
            key: "game_ui.item_tooltip.imbued_upon",
            params: { ability: "Kinetic Pulse" },
            game: { token: "Citadel_Shop_AbilityIsImbuing", params: { imbued_ability_name: "Kinetic Pulse" } },
        });
    });

    it("is 450 wide with the ALT column, else 420, or 410 when placed left", () => {
        const base = { item: spiritBurnItem, sections: [] };
        expect(itemTooltipModel({ ...base, hasDetails: true }).width).toBe(450);
        expect(itemTooltipModel({ ...base, hasDetails: true, position: "left" }).width).toBe(450);
        expect(itemTooltipModel(base).width).toBe(420);
        expect(itemTooltipModel({ ...base, position: "left" }).width).toBe(410);
    });

    it("puts the ALT box on the side the tooltip opens towards", () => {
        const base = { item: spiritBurnItem, sections: [], hasDetails: true };
        expect(itemTooltipModel(base).details?.side).toBe("right");
        expect(itemTooltipModel({ ...base, position: "left" }).details).toEqual({
            side: "left",
            label: {
                key: "game_ui.item_tooltip.see_details",
                params: {},
                game: { token: "Citadel_ItemViewImpact", params: {} },
            },
        });
        expect(itemTooltipModel({ item: spiritBurnItem, sections: [] }).details).toBeNull();
    });
});

describe("itemTooltipModel sections", () => {
    it("gives the innate section no bar and passive/active their own bar and label", () => {
        const sections = itemTooltipModel({
            item: spiritBurnItem,
            sections: [
                { kind: "innate", cooldown: null, blocks: [] },
                { kind: "passive", cooldown: null, blocks: [] },
                { kind: "active", cooldown: 35, blocks: [] },
            ],
        }).sections;

        expect(sections.map((s) => [s.bar, s.label?.key ?? null, s.label?.game?.token ?? null])).toEqual([
            ["none", null, null],
            ["passive", "game_ui.item_tooltip.passive", "Citadel_Mod_Tooltip_Passive"],
            ["active", "game_ui.item_tooltip.active", "Citadel_Mod_Tooltip_Active"],
        ]);
        expect(sections[2].cooldown).toEqual({ prefix: "", number: "35", postfix: "s" });
        expect(sections[1].cooldown).toBeNull();
    });

    it("shows charge-up and stacks pills only when the data has them", () => {
        const [plain, full] = itemTooltipModel({
            item: spiritBurnItem,
            sections: [
                { kind: "active", cooldown: 10, blocks: [] },
                { kind: "active", cooldown: null, blocks: [], chargeUp: 1.5, stacks: { count: 3, label: "Stacks" } },
            ],
        }).sections;
        expect([plain.chargeUp, plain.stacks]).toEqual([null, null]);
        expect(full.chargeUp).toEqual({ prefix: "", number: "1.5", postfix: "s" });
        expect(full.stacks).toEqual({ count: "3", label: "Stacks" });
    });

    it("parses each block's description with its values", () => {
        const passive = itemTooltipModel({ item: spiritBurnItem, sections: spiritBurn }).sections[1];
        expect(passive.blocks[0].description).toEqual([
            { kind: "text", text: "Dealing significant " },
            { kind: "attribute", name: "SpiritDamage", label: "spirit damage" },
            { kind: "text", text: " within " },
            { kind: "value", name: "DamageThresholdDuration", value: 5, signed: false, text: "5" },
            { kind: "text", text: "s." },
        ]);
        expect(
            itemTooltipModel({ item: spiritBurnItem, sections: spiritBurn }).sections[0].blocks[0].description,
        ).toEqual([]);
    });
});

describe("itemTooltipModel cells", () => {
    it("lays Spirit Burn's three important cells out as several, with icons, values and colour roles", () => {
        const passive = itemTooltipModel({ item: spiritBurnItem, sections: spiritBurn }).sections[1].blocks[0];
        expect(passive.layout).toBe("several");
        expect(
            passive.cells.map((c) => (c.kind === "important" ? [c.icon, c.value, c.label, c.role] : c.kind)),
        ).toEqual([
            ["tech_armor_up", { prefix: "", number: "500", postfix: "" }, "Damage Threshold", "default"],
            ["tech_damage", { prefix: "", number: "50", postfix: "" }, "Explosion Damage", "spirit"],
            ["tech_damage", { prefix: "", number: "24", postfix: "" }, "Damage Per Second", "spirit"],
        ]);
    });

    it("marks only a value with a factor as scaling, with its stat arrow", () => {
        const cells = itemTooltipModel({ item: spiritBurnItem, sections: spiritBurn }).sections[1].blocks[0].cells;
        const scaling = cells.map((c) => (c.kind === "important" ? c.scaling : null));
        expect(scaling).toEqual([null, null, { factor: "0.06", stat: "ETechPower", arrow: "spirit", heroIcon: null }]);
        expect(itemTooltipModel({ item: spiritBurnItem, sections: spiritBurn }).sections[1].blocks[0].scaling).toBe(
            true,
        );
    });

    it("adds factor x hero stat to the base when the hero's stat is known, and says so", () => {
        const model = itemTooltipModel({ item: spiritBurnItem, sections: spiritBurn, heroStats: { ETechPower: 50 } });
        const dps = model.sections[1].blocks[0].cells[2];
        expect(dps.kind === "important" && [dps.value.number, dps.scaled]).toEqual(["27", true]);
        const threshold = model.sections[1].blocks[0].cells[0];
        expect(threshold.kind === "important" && threshold.scaled).toBe(false);
    });

    it("rounds a scaled value to two decimals", () => {
        const model = itemTooltipModel({
            item: spiritBurnItem,
            sections: spiritBurn,
            heroStats: { ETechPower: 47.333 },
        });
        const dps = model.sections[1].blocks[0].cells[2];
        expect(dps.kind === "important" && dps.value.number).toBe("26.84");
    });

    it("maps each scaling stat to the game's arrow art, and an unknown stat to none", () => {
        const arrows = ["ETechPower", "EWeaponPower", "EBaseWeaponDamage", "EArmorPower", "ELevelUpBoons"]
            .concat(["ELightMeleeDamage", "EHeavyMeleeDamage", "EMaxHealth"])
            .map((stat) => {
                const cell = itemTooltipModel({
                    item: spiritBurnItem,
                    sections: [
                        {
                            kind: "passive",
                            cooldown: null,
                            blocks: [
                                block({
                                    important: [prop("X", 1, "X", { scale: { stat, factor: 1, function: "f" } })],
                                }),
                            ],
                        },
                    ],
                }).sections[0].blocks[0].cells[0];
                return cell.kind === "important" ? cell.scaling?.arrow : undefined;
            });
        expect(arrows).toEqual(["spirit", "courage", "courage", "fortitude", "boon", "melee", "melee", null]);
    });

    it("puts the hero's portrait on a boon-scaled marker only", () => {
        const scaled = (stat: string) => prop(stat, 300, "Barrier", { scale: { stat, factor: 5, function: "f" } });
        const model = itemTooltipModel({
            item: spiritBurnItem,
            heroIcon: "hero_sm.png",
            sections: [
                {
                    kind: "passive",
                    cooldown: null,
                    blocks: [
                        block({
                            important: [scaled("ELevelUpBoons"), scaled("ETechPower")],
                            properties: [scaled("ELevelUpBoons")],
                        }),
                    ],
                },
            ],
        });
        const [boon, spirit] = model.sections[0].blocks[0].cells;
        expect(boon.kind === "important" && boon.scaling?.heroIcon).toBe("hero_sm.png");
        expect(spirit.kind === "important" && spirit.scaling?.heroIcon).toBeNull();
        expect(model.sections[0].blocks[0].rows[0].scaling?.heroIcon).toBe("hero_sm.png");
    });

    it("leaves a boon marker without a portrait when the host has no hero", () => {
        const model = itemTooltipModel({
            item: spiritBurnItem,
            sections: [
                {
                    kind: "passive",
                    cooldown: null,
                    blocks: [
                        block({
                            important: [
                                prop("B", 300, "Barrier", {
                                    scale: { stat: "ELevelUpBoons", factor: 5, function: "f" },
                                }),
                            ],
                        }),
                    ],
                },
            ],
        });
        const [boon] = model.sections[0].blocks[0].cells;
        expect(boon.kind === "important" && boon.scaling?.heroIcon).toBeNull();
    });

    it("colours bullet damage as weapon and healing or health as vitality", () => {
        const roles = ["bullet_damage", "healing", "health", "move_speed", null].map((cssClass) => {
            const cell = itemTooltipModel({
                item: spiritBurnItem,
                sections: [
                    {
                        kind: "passive",
                        cooldown: null,
                        blocks: [block({ important: [prop("X", 1, "X", { cssClass })] })],
                    },
                ],
            }).sections[0].blocks[0].cells[0];
            return cell.kind === "important" ? cell.role : undefined;
        });
        expect(roles).toEqual(["weapon", "vitality", "vitality", "default", "default"]);
    });

    it("draws Silencer's status cell as duration plus label, coloured spirit for a silence", () => {
        const model = itemTooltipModel({ item: spiritBurnItem, sections: silencer });
        const status = model.sections[2].blocks[0];
        expect(status.layout).toBe("one");
        expect(status.cells).toEqual([
            {
                kind: "status",
                key: "StatusEffectEMP",
                icon: "StatusEffectEMP",
                duration: { prefix: "", number: "2.5", postfix: "s" },
                label: "Silenced",
                role: "spirit",
            },
        ]);
    });

    it("draws a status cell with no number as its label alone", () => {
        const cell = itemTooltipModel({
            item: spiritBurnItem,
            sections: [
                {
                    kind: "active",
                    cooldown: null,
                    blocks: [
                        block({
                            important: [prop("StatusEffectInvisible", null, "Invisible", { statusEffect: true })],
                        }),
                    ],
                },
            ],
        }).sections[0].blocks[0].cells[0];
        expect(cell).toMatchObject({ kind: "status", duration: null, label: "Invisible", role: "default" });
    });

    it("flags a build-up-rate value as varying by hero and keeps the base number", () => {
        const rows = itemTooltipModel({ item: spiritBurnItem, sections: silencer }).sections[2].blocks[0].rows;
        const buildup = rows.find((r) => r.key === "BuildUpPerShot");
        expect(buildup).toMatchObject({ value: { prefix: "", number: "1.04", postfix: "%" }, variesByHero: true });
        expect(buildup?.scaling).toBeNull();
        expect(rows.find((r) => r.key === "ImmunityDuration")?.variesByHero).toBe(false);
    });

    // `.ImportantStatLabel` is `visibility: collapse` in the item tooltip and rows have no label slot for it.
    it("drops the conditional flag, which the game's item tooltip never draws", () => {
        const model = itemTooltipModel({
            item: spiritBurnItem,
            sections: [
                {
                    kind: "passive",
                    cooldown: null,
                    blocks: [
                        block({
                            important: [prop("X", 1, "X", { conditional: true })],
                            properties: [prop("Y", 1, "Y")],
                        }),
                    ],
                },
            ],
        });
        expect(model.sections[0].blocks[0].cells[0]).not.toHaveProperty("conditional");
        expect(model.sections[0].blocks[0].rows[0]).not.toHaveProperty("conditional");
        expect(model.text).not.toHaveProperty("conditional");
        expect(model.text.variesByHero).toEqual({ key: "game_ui.item_tooltip.varies_by_hero", params: {}, game: null });
    });
});

describe("itemTooltipModel layout classes", () => {
    const withImportant = (count: number, rows = 1) =>
        itemTooltipModel({
            item: spiritBurnItem,
            sections: [
                {
                    kind: "passive",
                    cooldown: null,
                    blocks: [
                        block({
                            important: Array.from({ length: count }, (_, i) => prop(`I${i}`, 1, "I")),
                            properties: Array.from({ length: rows }, (_, i) => prop(`R${i}`, 1, "R")),
                        }),
                    ],
                },
            ],
        }).sections[0].blocks[0];

    it("picks none / one / several / four by the important cell count", () => {
        expect([0, 1, 2, 3, 4, 6].map((n) => withImportant(n).layout)).toEqual([
            "none",
            "one",
            "several",
            "several",
            "four",
            "four",
        ]);
    });

    it("hides the stats area only when a block has neither cells nor rows", () => {
        expect(withImportant(0, 0).showStats).toBe(false);
        expect(withImportant(0, 1).showStats).toBe(true);
        expect(withImportant(1, 0)).toMatchObject({ showStats: true, hasRows: false });
        expect(withImportant(1, 1).hasRows).toBe(true);
    });
});

describe("itemTooltipModel rows", () => {
    it("orders elevated rows before normal ones and marks them", () => {
        const rows = itemTooltipModel({
            item: spiritBurnItem,
            sections: [
                {
                    kind: "innate",
                    cooldown: null,
                    blocks: [
                        block({ elevated: [prop("A", 1, "A")], properties: [prop("B", 2, "B"), prop("C", 3, "C")] }),
                    ],
                },
            ],
        }).sections[0].blocks[0].rows;
        expect(rows.map((r) => [r.key, r.elevated])).toEqual([
            ["A", true],
            ["B", false],
            ["C", false],
        ]);
    });

    it("splits a signed value into a + prefix, the number and the unit, and keeps a minus in the number", () => {
        const model = itemTooltipModel({ item: spiritBurnItem, sections: spiritBurn });
        expect(model.sections[0].blocks[0].rows[0].value).toEqual({ prefix: "+", number: "6", postfix: "%" });
        const healing = model.sections[1].blocks[0].rows[2];
        expect(healing).toMatchObject({ value: { prefix: "", number: "-70", postfix: "%" }, negative: true });
        expect(model.sections[1].blocks[0].rows[0].negative).toBe(false);
    });

    it("signs zero but not a negative value", () => {
        const rows = itemTooltipModel({
            item: spiritBurnItem,
            sections: [
                {
                    kind: "innate",
                    cooldown: null,
                    blocks: [
                        block({
                            properties: [prop("A", -3, "A", { signed: true }), prop("B", 0, "B", { signed: true })],
                        }),
                    ],
                },
            ],
        }).sections[0].blocks[0].rows;
        expect(rows.map((r) => r.value)).toEqual([
            { prefix: "", number: "-3", postfix: "" },
            { prefix: "+", number: "0", postfix: "" },
        ]);
    });
});

describe("itemTooltipModel popularity and components", () => {
    it("words popularity by phase with the rounded percent and the hero icon", () => {
        const model = itemTooltipModel({
            item: spiritBurnItem,
            sections: [],
            popularity: { phase: "mid", percent: 41.6, heroIcon: "hero.png" },
        });
        expect(model.popularity).toEqual({
            phase: "mid",
            heroIcon: "hero.png",
            text: {
                key: "game_ui.item_tooltip.popular_mid",
                params: { percent: 42 },
                game: { token: "Citadel_PopularityLabel_Mid", params: { popular_pct: 42 } },
            },
        });
        expect(itemTooltipModel({ item: spiritBurnItem, sections: [] }).popularity).toBeNull();
    });

    it("lists only the component groups that have items, in the game's order, with owned marks", () => {
        const a: GameItem = { ...spiritBurnItem, id: 10, name: "A" };
        const b: GameItem = { ...spiritBurnItem, id: 11, name: "B" };
        const model = itemTooltipModel({
            item: spiritBurnItem,
            sections: [],
            usedIn: [b],
            upgradesFrom: [a],
            upgradesTo: [],
            ownedIds: [10],
        });
        expect(model.components).toEqual([
            {
                kind: "from",
                label: {
                    key: "game_ui.item_tooltip.upgrades_from",
                    params: {},
                    game: { token: "Citadel_ComponentRequired", params: {} },
                },
                items: [{ item: a, owned: true }],
            },
            {
                kind: "usedIn",
                label: {
                    key: "game_ui.item_tooltip.used_in",
                    params: {},
                    game: { token: "Citadel_ComponentUseIn", params: {} },
                },
                items: [{ item: b, owned: false }],
            },
        ]);
        const to = itemTooltipModel({ item: spiritBurnItem, sections: [], upgradesTo: [a] }).components[0];
        expect([to.kind, to.label.key, to.label.game?.token]).toEqual([
            "to",
            "game_ui.item_tooltip.upgrades_to",
            "Citadel_IsComponentOf",
        ]);
    });
});
