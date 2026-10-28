import { describe, expect, it } from "vitest";
import { contrast } from "@deadlock-plus/ui/accent";
import { THEMES, themeVariant, type Theme } from "@deadlock-plus/ui/themes";
import { STAT_COLOURS, statColourStyle, statColours } from "./stat-colours";

/** Every theme as each of its variants draws it. */
const drawn: Theme[] = THEMES.flatMap((t) =>
    t.variants.length ? t.variants.map((v) => ({ ...themeVariant(t, v.id), id: `${t.id}-${v.id}` })) : [t],
);
const light = drawn.filter((t) => t.light);
const dark = drawn.filter((t) => !t.light);
const hue = (c: string) => Number(/^oklch\([\d.]+ [\d.]+ ([\d.]+)/.exec(c)?.[1]);

describe("statColours", () => {
    it("covers Daylight, Catppuccin Latte and Pretty in Pink among the light themes", () => {
        expect(light.map((t) => t.id)).toEqual(
            expect.arrayContaining(["daylight", "catppuccin-latte", "pretty-in-pink"]),
        );
    });

    for (const t of light) {
        for (const name of Object.keys(STAT_COLOURS) as (keyof typeof STAT_COLOURS)[]) {
            it(`reads at 4.5:1 for ${name} on ${t.id}`, () => {
                const colour = statColours(t)[name];
                for (const surface of ["card", "background"]) {
                    expect(contrast(colour, t.tokens[surface]!), surface).toBeGreaterThanOrEqual(4.5);
                }
            });
        }
    }

    it("keeps each colour's hue on light themes", () => {
        for (const t of light) {
            for (const [name, colour] of Object.entries(statColours(t))) {
                expect(hue(colour), `${t.id} ${name}`).toBeCloseTo(
                    hue(STAT_COLOURS[name as keyof typeof STAT_COLOURS]),
                );
            }
        }
    });

    it("draws dark themes exactly as tuned", () => {
        for (const t of dark) expect(statColours(t), t.id).toEqual(STAT_COLOURS);
    });

    it("sets one custom property per stat", () => {
        const style = statColourStyle(light[0]!);
        expect(style).toContain(`--c-souls: ${statColours(light[0]!).souls}`);
        expect(style.split(";").filter(Boolean)).toHaveLength(Object.keys(STAT_COLOURS).length);
    });
});
