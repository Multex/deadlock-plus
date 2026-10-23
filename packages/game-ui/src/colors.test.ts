import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gameColors } from "./colors";

const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const declared = new Map(
    [...tokens.matchAll(/--game-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/g)].map(([, name, value]) => [name, value]),
);
const kebab = (name: string) => name.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("game colours", () => {
    it("declares every colour in tokens.css with the same value", () => {
        for (const [name, value] of Object.entries(gameColors)) {
            expect(declared.get(kebab(name)), name).toBe(value.toLowerCase());
        }
    });

    it("declares no colour in tokens.css that the TypeScript palette lacks", () => {
        const names = new Set(Object.keys(gameColors).map(kebab));
        expect([...declared.keys()].filter((name) => !names.has(name))).toEqual([]);
    });

    it("holds the game's base style values", () => {
        expect(gameColors.offWhite).toBe("#ffefd7");
        expect(gameColors.spiritBright).toBe("#ce90ff");
        expect(gameColors.enemy).toBe("#ff410d");
    });
});
