import { describe, expect, it } from "vitest";
import type { AssetHero } from "@deadlock-plus/deadlock-api";
import type { HeroEntry } from "@deadlock-plus/ipc-types/HeroEntry";
import type { Hero } from "$lib/features/heroes/heroes";
import { heroFlags, isPlayableHero, playableHeroes } from "./heroes";

function entry(id: number, flags: Partial<HeroEntry> = {}): HeroEntry {
    return {
        id,
        className: `hero_${id}`,
        name: `Hero ${id}`,
        localised: true,
        selectable: true,
        inDevelopment: false,
        disabled: false,
        preRelease: false,
        portrait: null,
        card: null,
        ...flags,
    };
}

/** Flags as `/v1/assets/heroes` sent them on 2026-10-21. */
const API: AssetHero[] = [
    {
        id: 1,
        name: "Infernus",
        player_selectable: true,
        development_state: "release",
        disabled: false,
        in_development: false,
    },
    { id: 70, name: "Skyrunner", player_selectable: false, disabled: true, in_development: true },
    { id: 21, name: "Kali", player_selectable: false, disabled: true, in_development: false },
    {
        id: 86,
        name: "Violet",
        player_selectable: true,
        development_state: "release",
        disabled: false,
        in_development: true,
    },
];

const hero = (id: number, name: string, selectable?: boolean): Hero => ({
    id,
    name,
    icon: null,
    portrait: null,
    artIcon: null,
    hideoutLine: null,
    ...(selectable === undefined ? {} : { selectable }),
});

describe("isPlayableHero", () => {
    it("hides a disabled or pre-release hero", () => {
        expect(isPlayableHero({ disabled: true })).toBe(false);
        expect(isPlayableHero({ preRelease: true })).toBe(false);
    });

    it("hides a hero in development unless the API says it is released", () => {
        expect(isPlayableHero({ inDevelopment: true })).toBe(false);
        expect(isPlayableHero({ inDevelopment: true, released: true })).toBe(true);
    });

    it("shows a hero with no flags against it", () => {
        expect(isPlayableHero({})).toBe(true);
    });
});

describe("heroFlags", () => {
    it("reads the API's flags when the game has none", () => {
        const flags = heroFlags(null, API);
        expect(isPlayableHero(flags.get(1)!)).toBe(true);
        expect(isPlayableHero(flags.get(70)!)).toBe(false);
        expect(isPlayableHero(flags.get(21)!)).toBe(false);
    });

    it("keeps a released hero the game still flags as in development", () => {
        const flags = heroFlags([entry(86, { inDevelopment: true, selectable: false })], API);
        expect(isPlayableHero(flags.get(86)!)).toBe(true);
    });

    it("trusts the game's disabled flag over the API", () => {
        const flags = heroFlags([entry(1, { disabled: true, selectable: false })], API);
        expect(isPlayableHero(flags.get(1)!)).toBe(false);
    });
});

describe("playableHeroes", () => {
    it("leaves heroes in development out and sorts the rest by name", () => {
        const heroes = { 70: hero(70, "Skyrunner"), 86: hero(86, "Violet"), 1: hero(1, "Infernus") };
        const list = playableHeroes(heroes, heroFlags(null, API));
        expect(list.map((h) => h.name)).toEqual(["Infernus", "Violet"]);
    });

    it("falls back to the game's own answer for a hero with no flags", () => {
        const heroes = { 5: hero(5, "Ghost", false), 6: hero(6, "Kept") };
        expect(playableHeroes(heroes, new Map()).map((h) => h.id)).toEqual([6]);
    });
});
