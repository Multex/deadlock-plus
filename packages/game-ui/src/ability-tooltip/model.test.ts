import { describe, expect, it } from "vitest";
import type { AbilitySection } from "@deadlock-plus/ipc-types/AbilitySection";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { TooltipProperty } from "@deadlock-plus/ipc-types/TooltipProperty";
import { markupText } from "../markup/markup";
import type { ValueText } from "../item-tooltip/model";
import { abilityTooltipModel, type AbilityTooltipModel, type CellGroupView } from "./model";

function prop(key: string, value: number | null, label: string, extra: Partial<TooltipProperty> = {}): TooltipProperty {
    return {
        key,
        value,
        unit: null,
        label,
        signed: false,
        cssClass: null,
        displayType: null,
        scale: null,
        statusEffect: false,
        ...extra,
    };
}

function section(extra: Partial<AbilitySection> = {}): AbilitySection {
    return { description: null, values: {}, groups: [], properties: [], requiredTier: null, ...extra };
}

const text = (v: ValueText | null | undefined) => (v ? v.prefix + v.number + v.postfix : null);

const dps = prop("DPS", 75, "Damage Per Second", {
    cssClass: "tech_damage",
    scale: { stat: "ETechPower", factor: 0.5, function: "scale_function_tech_damage" },
});
const shockRadius = prop("ShockRadius", 4.25, "Radius", {
    unit: "m",
    cssClass: "distance",
    scale: { stat: "ETechRadius", factor: null, function: "scale_function_single_stat" },
});
const lifetime = prop("MaxLifetime", 5, "Lifetime", {
    unit: "s",
    cssClass: "duration",
    scale: { stat: "ETechDuration", factor: null, function: "scale_function_single_stat" },
});

// Seven's Lightning Ball as `game_ability_tooltips("english")` reads it from the installed game, build 6805.
const lightningBall: AbilityTooltip = {
    abilityId: 1065103387,
    className: "citadel_ability_lightning_ball",
    name: "Lightning Ball",
    header: [],
    charges: prop("AbilityCharges", 1, "Charges", {
        cssClass: "cast",
        scale: { stat: null, factor: null, function: "scale_function_ability_charges" },
    }),
    chargeCooldown: prop("AbilityCooldownBetweenCharge", 6, "Charge Delay", {
        unit: "s",
        cssClass: "charge_cooldown",
        scale: { stat: null, factor: null, function: "scale_function_ability_recharge_time" },
    }),
    cooldown: prop("AbilityCooldown", 26, "Cooldown", {
        unit: "s",
        cssClass: "cooldown",
        scale: { stat: "ETechCooldown", factor: null, function: "scale_function_single_stat" },
    }),
    sections: [
        section({
            description:
                "Shoot a ball of lightning that travels in a straight line. Does " +
                '<span class="highlight">damage to all targets in its radius</span>. Slows down when damaging ' +
                "enemies and stops if it hits the world.",
            groups: [{ title: null, cells: [dps, shockRadius] }],
            properties: [lifetime],
        }),
    ],
    upgrades: [
        {
            tier: 1,
            cost: 1,
            description: null,
            values: {},
            bonuses: [{ property: prop("AbilityCharges", 1, "Charges", { cssClass: "cast" }), kind: "addToBase" }],
        },
        {
            tier: 2,
            cost: 2,
            description:
                '<span class="highlight">-{s:SlowPercent}%</span> move speed on hit targets and ' +
                '<span class="highlight">+{s:MaxLifetime}s</span> Lifetime',
            values: { SlowPercent: 28, MaxLifetime: 1 },
            bonuses: [
                {
                    property: prop("SlowPercent", 28, "Move Speed", { unit: "%", prefix: "-", cssClass: "slow" }),
                    kind: "addToBase",
                },
                {
                    property: prop("MaxLifetime", 1, "Lifetime", { unit: "s", cssClass: "duration" }),
                    kind: "addToBase",
                },
            ],
        },
        {
            tier: 3,
            cost: 5,
            description: "+{s:DPS} DPS and +{s:ShockRadius}m radius",
            values: { DPS: 58.5, ShockRadius: 1.75 },
            bonuses: [
                { property: prop("DPS", 58.5, "Damage Per Second", { cssClass: "tech_damage" }), kind: "addToBase" },
                {
                    property: prop("ShockRadius", 1.75, "Radius", { unit: "m", cssClass: "distance" }),
                    kind: "addToBase",
                },
            ],
        },
    ],
};

const cells = (model: AbilityTooltipModel, group = 0): CellGroupView["cells"] => model.sections[0].groups[group].cells;

describe("abilityTooltipModel header", () => {
    it("puts the name, the charge chips and the cooldown in the header", () => {
        const model = abilityTooltipModel({ ability: lightningBall });
        expect(model.name).toBe("Lightning Ball");
        expect(model.chips).toEqual([]);
        expect(text(model.charges?.value)).toBe("1");
        expect(text(model.chargeCooldown?.value)).toBe("6s");
        expect(text(model.cooldown?.value)).toBe("26s");
        expect(model.cooldown?.icon).toBe("cooldown");
        expect(model.charges?.icon).toBe("cast");
    });

    it("keeps the header chips in the data's order with their units", () => {
        const ability: AbilityTooltip = {
            ...lightningBall,
            header: [
                prop("AbilityCastRange", 20, "Cast Range", { unit: "m", cssClass: "range" }),
                prop("AbilityDuration", 3.5, "Duration", { unit: "s", cssClass: "duration" }),
            ],
        };
        const model = abilityTooltipModel({ ability });
        expect(model.chips.map((c) => [c.key, text(c.value)])).toEqual([
            ["AbilityCastRange", "20m"],
            ["AbilityDuration", "3.5s"],
        ]);
    });

    it("gives a header chip with a scaling factor the spirit look, but not the right column", () => {
        const scaled = { stat: "ETechPower", factor: 0.2, function: "scale_function_tech_damage" };
        const ability: AbilityTooltip = {
            ...lightningBall,
            header: [prop("Radius", 6, "Radius", { unit: "m", scale: scaled })],
            cooldown: prop("AbilityCooldown", 26, "Cooldown", { unit: "s", scale: scaled }),
        };
        const model = abilityTooltipModel({ ability });
        expect(model.chips[0].style).toBe("spirit");
        expect(model.chips[0].scaling?.factor).toBe("0.2");
        expect(model.cooldown?.style).toBeNull();
        expect(model.cooldown?.scaling?.factor).toBe("0.2");
        expect(abilityTooltipModel({ ability: lightningBall }).cooldown?.style).toBeNull();
    });
});

describe("abilityTooltipModel sections", () => {
    it("parses the description and keeps the cells and rows in the game's order", () => {
        const model = abilityTooltipModel({ ability: lightningBall });
        const [first] = model.sections;
        expect(markupText(first.description)).toMatch(/^Shoot a ball of lightning/);
        expect(first.description).toContainEqual({
            kind: "span",
            styles: ["highlight"],
            children: [{ kind: "text", text: "damage to all targets in its radius" }],
        });
        expect(cells(model).map((c) => [c.label, text(c.value)])).toEqual([
            ["Damage Per Second", "75"],
            ["Radius", "4.2m"],
        ]);
        expect(first.rows.map((r) => [text(r.value), r.label])).toEqual([["5s", "Lifetime"]]);
    });

    it("marks a cell with a scaling factor with its factor, arrow and border", () => {
        const [damage, radius] = cells(abilityTooltipModel({ ability: lightningBall }));
        expect(damage.kind === "value" && damage.scaling).toEqual({
            factor: "0.5",
            stat: "ETechPower",
            arrow: "spirit",
        });
        expect(damage.kind === "value" && damage.style).toBe("spirit");
        expect(radius.kind === "value" && radius.scaling).toBeNull();
        expect(radius.kind === "value" && radius.style).toBeNull();
    });

    it("picks the weapon and boon looks by the scaling stat", () => {
        const scaled = (stat: string) =>
            prop("X", 10, "X", { scale: { stat, factor: 1.5, function: "scale_function_single_stat" } });
        const ability: AbilityTooltip = {
            ...lightningBall,
            sections: [
                section({
                    groups: [
                        {
                            title: "On Hit",
                            cells: [
                                scaled("EWeaponPower"),
                                scaled("EBaseWeaponDamageIncrease"),
                                scaled("EHeavyMeleeDamage"),
                                scaled("ELevelUpBoons"),
                            ],
                        },
                    ],
                }),
            ],
        };
        const model = abilityTooltipModel({ ability });
        expect(model.sections[0].groups[0].title).toBe("On Hit");
        expect(cells(model).map((c) => c.kind === "value" && [c.style, c.scaling?.arrow])).toEqual([
            ["weapon", "courage"],
            ["weapon", "courage"],
            ["weapon", "melee"],
            ["boon", "boon"],
        ]);
    });

    it("shows a status cell's value, or names it a status effect when it has none", () => {
        const ability: AbilityTooltip = {
            ...lightningBall,
            sections: [
                section({
                    groups: [
                        {
                            title: null,
                            cells: [
                                prop("StatusEffectStun", 1.5, "Stunned", { unit: "s", statusEffect: true }),
                                prop("StatusEffectDisplacement", null, "Displaced", { statusEffect: true }),
                            ],
                        },
                    ],
                }),
            ],
        };
        const [stun, displaced] = cells(abilityTooltipModel({ ability }));
        expect(stun).toEqual({
            kind: "status",
            key: "StatusEffectStun",
            icon: "StatusEffectStun",
            label: "Stunned",
            value: { prefix: "", number: "1.5", postfix: "s" },
        });
        expect(displaced.kind === "status" && displaced.value).toBeNull();
    });

    it("shows a section an upgrade adds only once that upgrade is trained", () => {
        const ability: AbilityTooltip = {
            ...lightningBall,
            sections: [...lightningBall.sections, section({ description: "Upgraded.", requiredTier: 2 })],
        };
        expect(abilityTooltipModel({ ability }).sections).toHaveLength(1);
        expect(abilityTooltipModel({ ability, upgrades: ["has", "available"] }).sections).toHaveLength(1);
        const trained = abilityTooltipModel({ ability, upgrades: ["has", "has"] });
        expect(trained.sections.map((s) => markupText(s.description))).toEqual([
            expect.stringMatching(/^Shoot/),
            "Upgraded.",
        ]);
    });

    it("rounds description numbers the way the cells do", () => {
        const ability: AbilityTooltip = {
            ...lightningBall,
            sections: [
                section({
                    description: "{s:ShockRadius}m and {s:DPS} and {s:Unknown}",
                    values: { ShockRadius: 4.25, DPS: 58.5, Unknown: 1.75 },
                    groups: [{ title: null, cells: [dps, shockRadius] }],
                }),
            ],
        };
        expect(markupText(abilityTooltipModel({ ability }).sections[0].description)).toBe("4.2m and 58 and 1.8");
    });

    it("shows the imbuing item in the first section", () => {
        const ability: AbilityTooltip = {
            ...lightningBall,
            sections: [...lightningBall.sections, section({ description: "Second." })],
        };
        const model = abilityTooltipModel({ ability, imbuedBy: { name: "Ballistic Enchantment", icon: "be.png" } });
        expect(model.sections[0].imbued).toEqual({
            name: "Ballistic Enchantment",
            icon: "be.png",
            text: {
                key: "game_ui.ability_tooltip.imbued_by",
                params: { item: "Ballistic Enchantment" },
                game: {
                    token: "Citadel_Shop_AbilityIsImbued",
                    params: { imbuing_ability_name: "Ballistic Enchantment" },
                },
            },
        });
        expect(model.sections[1].imbued).toBeNull();
        expect(abilityTooltipModel({ ability }).sections[0].imbued).toBeNull();
    });
});

describe("abilityTooltipModel values", () => {
    it("adds the bonuses of trained tiers", () => {
        const model = abilityTooltipModel({ ability: lightningBall, upgrades: ["has", "has", "has"] });
        expect(text(model.charges?.value)).toBe("2");
        const [damage, radius] = cells(model);
        // 75 + 58.5 = 133.5 shows as 134; 4.25 + 1.75 = 6.
        expect(text(damage.value)).toBe("134");
        expect(text(radius.value)).toBe("6m");
        expect(model.sections[0].rows.map((r) => text(r.value))).toEqual(["6s"]);
    });

    it("adds a trained scale bonus to the factor", () => {
        const ability: AbilityTooltip = {
            ...lightningBall,
            upgrades: [
                {
                    tier: 1,
                    cost: 1,
                    description: null,
                    values: {},
                    bonuses: [{ property: prop("DPS", 0.25, "Damage Per Second"), kind: "addToScale" }],
                },
            ],
        };
        const [damage] = cells(abilityTooltipModel({ ability, upgrades: ["has"] }));
        expect(damage.kind === "value" && damage.scaling?.factor).toBe("0.75");
    });

    it("scales a value with a factor by the hero's stat", () => {
        const model = abilityTooltipModel({ ability: lightningBall, heroStats: { ETechPower: 33, ETechRadius: 50 } });
        const [damage, radius] = cells(model);
        // 75 + 0.5 x 33 = 91.5 shows as 92.
        expect(text(damage.value)).toBe("92");
        expect(damage.kind === "value" && damage.scaled).toBe(true);
        expect(text(radius.value)).toBe("4.2m");
        expect(radius.kind === "value" && radius.scaled).toBe(false);
    });

    it("signs a value its property asks to sign, or puts its literal prefix first", () => {
        const ability: AbilityTooltip = {
            ...lightningBall,
            sections: [
                section({
                    properties: [
                        prop("BonusSpeed", 2, "Move Speed", { unit: "m", signed: true }),
                        prop("SlowPercent", 30, "Slow", { unit: "%", prefix: "-" }),
                    ],
                }),
            ],
        };
        const rows = abilityTooltipModel({ ability }).sections[0].rows;
        expect(rows.map((r) => text(r.value))).toEqual(["+2m", "-30%"]);
    });
});

describe("abilityTooltipModel upgrades", () => {
    it("shows each tier's cost and its bonuses, or its own description", () => {
        const [t1, t2, t3] = abilityTooltipModel({ ability: lightningBall }).upgrades;
        expect([t1.cost, t2.cost, t3.cost]).toEqual(["1", "2", "5"]);
        expect(t1.bonuses).toEqual([{ key: "AbilityCharges", amount: "+1", label: "Charges" }]);
        expect(t1.description).toBeNull();
        expect(markupText(t2.description ?? [])).toBe("-28% move speed on hit targets and +1s Lifetime");
        expect(markupText(t3.description ?? [])).toBe("+58 DPS and +1.8m radius");
    });

    it("labels bonuses with their sign and unit", () => {
        const ability: AbilityTooltip = {
            ...lightningBall,
            upgrades: [{ ...lightningBall.upgrades[1], description: null }],
        };
        expect(abilityTooltipModel({ ability }).upgrades[0].bonuses).toEqual([
            { key: "SlowPercent", amount: "-28%", label: "Move Speed" },
            { key: "MaxLifetime", amount: "+1s", label: "Lifetime" },
        ]);
    });

    it("takes each tier's state, untrained when not given", () => {
        expect(abilityTooltipModel({ ability: lightningBall }).upgrades.map((u) => u.state)).toEqual([
            "notTrained",
            "notTrained",
            "notTrained",
        ]);
        const model = abilityTooltipModel({ ability: lightningBall, upgrades: ["has", "available", "cantAfford"] });
        expect(model.upgrades.map((u) => u.state)).toEqual(["has", "available", "cantAfford"]);
    });

    it("marks the recommended tier until it is trained", () => {
        const recommended = (upgrades: ("has" | "available")[]) =>
            abilityTooltipModel({ ability: lightningBall, upgrades, recommendedTier: 2 }).upgrades.map(
                (u) => u.recommended,
            );
        expect(recommended(["has", "available"])).toEqual([false, true, false]);
        expect(recommended(["has", "has"])).toEqual([false, false, false]);
    });

    it("names its own text with game tokens", () => {
        const model = abilityTooltipModel({ ability: lightningBall });
        expect(model.text).toEqual({
            statusEffect: {
                key: "game_ui.ability_tooltip.status_effect",
                params: {},
                game: { token: "Citadel_StatusEffect", params: {} },
            },
            recommended: {
                key: "game_ui.ability_tooltip.recommended",
                params: {},
                game: { token: "Citadel_HeroBuilds_AP_Next_Indicator", params: {} },
            },
        });
    });
});

describe("Lightning Ball against the in-game capture", () => {
    it("shows the capture's numbers in its order", () => {
        const model = abilityTooltipModel({
            ability: lightningBall,
            upgrades: ["cantAfford", "cantAfford", "cantAfford"],
        });
        const shown = [
            model.name,
            text(model.charges?.value),
            text(model.chargeCooldown?.value),
            text(model.cooldown?.value),
            ...cells(model).flatMap((c) => [
                text(c.value),
                c.label,
                ...(c.kind === "value" && c.scaling ? [`x ${c.scaling.factor}`] : []),
            ]),
            ...model.sections[0].rows.flatMap((r) => [text(r.value), r.label]),
            ...model.upgrades.flatMap((u) => [
                u.cost,
                u.description ? markupText(u.description) : u.bonuses.map((b) => `${b.amount} ${b.label}`).join(),
            ]),
        ];
        expect(shown).toEqual([
            "Lightning Ball",
            "1",
            "6s",
            "26s",
            "75",
            "Damage Per Second",
            "x 0.5",
            "4.2m",
            "Radius",
            "5s",
            "Lifetime",
            "1",
            "+1 Charges",
            "2",
            "-28% move speed on hit targets and +1s Lifetime",
            "5",
            "+58 DPS and +1.8m radius",
        ]);
        expect(model.upgrades.every((u) => u.state === "cantAfford")).toBe(true);
    });
});
