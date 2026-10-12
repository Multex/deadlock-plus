import { describe, expect, it } from "vitest";
import { accoladeCategory, accoladeTier, renderAccoladeDescription } from "./accolade-text";

const number = (n: number) => n.toLocaleString("en-US");
const render = (template: string, value: number) => renderAccoladeDescription(template, value, "en", number);

const KILLS =
    '<span class="StatValue">{g:citadel_thousands:stat_value}</span> {stat_value, plural, one{kill} other{kills}}';

describe("renderAccoladeDescription", () => {
    it("fills the value and picks the plural form", () => {
        expect(render(KILLS, 1)).toBe("1 kill");
        expect(render(KILLS, 12)).toBe("12 kills");
    });

    it("formats the value with the caller's number format", () => {
        expect(render('<span class="StatValue">{g:citadel_thousands:stat_value}</span> healing', 12345)).toBe(
            "12,345 healing",
        );
    });

    it("keeps plain text that has no placeholders", () => {
        expect(render("First Blood", 1)).toBe("First Blood");
    });

    it("handles a plural with text on both sides", () => {
        const t = "{g:citadel_thousands:stat_value} gun {stat_value, plural, one{kill} other{kills}}";
        expect(render(t, 2)).toBe("2 gun kills");
    });

    it("returns null when a placeholder is not understood", () => {
        expect(render("{mystery} things", 3)).toBeNull();
        expect(render("{stat_value, select, a{x} other{y}}", 3)).toBeNull();
    });
});

describe("accoladeCategory", () => {
    it("groups tracked stats by what they measure", () => {
        expect(accoladeCategory("kills")).toBe("kills");
        expect(accoladeCategory("killstreak_kills")).toBe("kills");
        expect(accoladeCategory("first_blood")).toBe("kills");
        expect(accoladeCategory("assists")).toBe("assists");
        expect(accoladeCategory("healing")).toBe("healing");
        expect(accoladeCategory("ability_damage")).toBe("damage");
        expect(accoladeCategory("headshots")).toBe("headshots");
        expect(accoladeCategory("net_worth")).toBe("souls");
        expect(accoladeCategory("trooper_last_hits")).toBe("farming");
        expect(accoladeCategory("breakables_destroyed")).toBe("objects");
        expect(accoladeCategory("damage_mitigated")).toBe("defence");
    });

    it("falls back for stats it does not know", () => {
        expect(accoladeCategory("something_new")).toBe("other");
        expect(accoladeCategory(null)).toBe("other");
    });
});

describe("accoladeTier", () => {
    it("keeps a real tier", () => {
        expect(accoladeTier(0)).toBe(0);
        expect(accoladeTier(2)).toBe(2);
    });

    it("has no tier for a negative or missing value", () => {
        expect(accoladeTier(-1)).toBeNull();
        expect(accoladeTier(undefined)).toBeNull();
        expect(accoladeTier(null)).toBeNull();
        expect(accoladeTier(Number.NaN)).toBeNull();
    });
});
