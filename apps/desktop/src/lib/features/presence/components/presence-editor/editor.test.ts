import { LOGO_URL } from "@deadlock-plus/links";
import type { PresenceCard } from "@deadlock-plus/ipc-types/PresenceCard";
import type { PresenceStateInfo } from "@deadlock-plus/ipc-types/PresenceStateInfo";
import { describe, expect, it, vi } from "vitest";
import {
    SOURCE_KINDS,
    previewSample,
    SYNTAX_EXAMPLES,
    groupPlaceholders,
    renderTemplate,
    TIMERS,
    formatElapsed,
    exampleConfig,
    heroOptions,
    insertPlaceholder,
    scopeFor,
    sourceFromKind,
    sourceKind,
    sourceUrl,
    withDeadlockPlusLogo,
} from "./editor";

describe("withDeadlockPlusLogo", () => {
    const card = (over: Partial<PresenceCard> = {}): PresenceCard => ({
        details: "Playing Deadlock",
        state: null,
        largeText: null,
        smallText: null,
        largeImage: null,
        smallImage: null,
        elapsedSecs: null,
        party: null,
        ...over,
    });

    it("shows the Deadlock+ logo where no large image is sent", () => {
        expect(withDeadlockPlusLogo(card(), true)).toEqual(card({ largeImage: LOGO_URL, largeText: "Deadlock+" }));
    });

    it("keeps the configured hover text", () => {
        expect(withDeadlockPlusLogo(card({ largeText: "In the Hideout" }), true)).toEqual(
            card({ largeImage: LOGO_URL, largeText: "In the Hideout" }),
        );
    });

    it("never replaces a sent large image", () => {
        const hero = card({ largeImage: "https://x/hero.png" });
        expect(withDeadlockPlusLogo(hero, true)).toEqual(hero);
    });

    it("leaves the card alone when off", () => {
        expect(withDeadlockPlusLogo(card(), false)).toEqual(card());
    });
});

describe("insertPlaceholder", () => {
    it("inserts at the caret", () => {
        expect(insertPlaceholder("Playing ", 8, 8, "hero")).toEqual({ text: "Playing {hero}", caret: 14 });
    });

    it("replaces a selection", () => {
        expect(insertPlaceholder("a XX b", 2, 4, "mode")).toEqual({ text: "a {mode} b", caret: 8 });
    });

    it("appends when there is no selection info", () => {
        expect(insertPlaceholder("abc", null, null, "rank")).toEqual({ text: "abc{rank}", caret: 9 });
    });

    it("tolerates a reversed selection", () => {
        expect(insertPlaceholder("abcd", 3, 1, "kills")).toEqual({ text: "a{kills}d", caret: 8 });
    });
});

describe("image source", () => {
    it("names the kind of each source", () => {
        expect(sourceKind("heroPortrait")).toBe("heroPortrait");
        expect(sourceKind({ customUrl: "https://x.test/a.png" })).toBe("customUrl");
        expect(sourceKind(undefined)).toBeUndefined();
    });

    it("builds a source from a kind", () => {
        expect(sourceFromKind("rankBadge", "")).toBe("rankBadge");
        expect(sourceFromKind("customUrl", "https://x.test/a.png")).toEqual({ customUrl: "https://x.test/a.png" });
    });

    it("reads the custom URL back", () => {
        expect(sourceUrl({ customUrl: "u" })).toBe("u");
        expect(sourceUrl("heroIcon")).toBe("");
        expect(sourceUrl(undefined)).toBe("");
    });
});

describe("heroOptions", () => {
    it("sorts by name and drops nothing", () => {
        const heroes = {
            2: { id: 2, name: "Bebop", icon: null, portrait: null, artIcon: null, hideoutLine: null },
            1: { id: 1, name: "Abrams", icon: null, portrait: null, artIcon: null, hideoutLine: null },
        };
        expect(heroOptions(heroes).map((h) => h.id)).toEqual([1, 2]);
    });

    it("drops heroes the game says players cannot pick", () => {
        const base = { icon: null, portrait: null, artIcon: null, hideoutLine: null };
        const heroes = {
            1: { id: 1, name: "Abrams", ...base, selectable: true },
            2: { id: 2, name: "Unreleased", ...base, selectable: false },
            3: { id: 3, name: "Api only", ...base },
        };
        expect(heroOptions(heroes).map((h) => h.id)).toEqual([1, 3]);
    });
});

describe("scopeFor", () => {
    const heroState: PresenceStateInfo = { id: "inMatch", variants: ["ranked"], heroScope: true };
    const plain: PresenceStateInfo = { id: "mainMenu", variants: [], heroScope: false };

    it("adds the hero to a state that has a hero layer", () => {
        expect(scopeFor(heroState, undefined, 7)).toEqual({ state: "inMatch", variant: undefined, heroId: 7 });
        expect(scopeFor(heroState, "ranked", 7)).toEqual({ state: "inMatch", variant: "ranked", heroId: 7 });
    });

    it("drops the hero for a state without a hero layer", () => {
        expect(scopeFor(plain, undefined, 7)).toEqual({ state: "mainMenu", variant: undefined, heroId: undefined });
    });

    it("keeps the default layer when no hero is picked", () => {
        expect(scopeFor(heroState, undefined, undefined).heroId).toBeUndefined();
    });
});

describe("constants", () => {
    it("lists the four timers", () => {
        expect(TIMERS).toEqual(["none", "elapsedInState", "matchTime", "queueTime"]);
    });
});

describe("formatElapsed", () => {
    it("shows minutes and seconds under an hour", () => {
        expect(formatElapsed(0)).toBe("0:00");
        expect(formatElapsed(754)).toBe("12:34");
        expect(formatElapsed(3599)).toBe("59:59");
    });

    it("adds hours from one hour", () => {
        expect(formatElapsed(3600)).toBe("1:00:00");
        expect(formatElapsed(3600 * 2 + 5 * 60 + 9)).toBe("2:05:09");
    });

    it("clamps a negative or fractional value", () => {
        expect(formatElapsed(-5)).toBe("0:00");
        expect(formatElapsed(61.9)).toBe("1:01");
    });
});

describe("exampleConfig", () => {
    it("puts the template on the top line of the Playing state and nothing else", () => {
        expect(exampleConfig("Hi {hero}")).toEqual({
            states: { playing: { details: "Hi {hero}" } },
            variants: {},
            heroes: {},
        });
    });
});

describe("SYNTAX_EXAMPLES", () => {
    it("has unique ids and non-empty sources", () => {
        const ids = SYNTAX_EXAMPLES.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(SYNTAX_EXAMPLES.every((e) => e.source.trim() !== "")).toBe(true);
    });

    it("covers placeholders, empty values, optional groups and fallbacks", () => {
        const sources = SYNTAX_EXAMPLES.map((e) => e.source);
        expect(sources.some((s) => /^[^[]*\{hero\}[^\]]*$/.test(s))).toBe(true);
        expect(sources.some((s) => s.includes("[[") && !s.includes("||"))).toBe(true);
        expect(sources.some((s) => s.includes("||"))).toBe(true);
    });

    it("never uses a sensitive placeholder", () => {
        expect(SYNTAX_EXAMPLES.some((e) => e.source.includes("{matchId}"))).toBe(false);
    });
});

describe("renderTemplate", () => {
    it("asks the preview for the template on the Playing state and returns its top line", async () => {
        const preview = vi.fn(async () => ({ details: "Playing as Haze" }) as never);
        expect(await renderTemplate(preview, "Playing as {hero}")).toBe("Playing as Haze");
        expect(preview).toHaveBeenCalledWith(exampleConfig("Playing as {hero}"), "playing", null, null, null);
    });

    it("returns an empty string when the line renders to nothing or the preview fails", async () => {
        expect(await renderTemplate(async () => ({ details: null }) as never, "[[Rank {rank}]]")).toBe("");
        expect(await renderTemplate(async () => null, "x")).toBe("");
        expect(
            await renderTemplate(async () => {
                throw new Error("no");
            }, "x"),
        ).toBe("");
    });
});

describe("groupPlaceholders", () => {
    const list = ["hero", "kills", "partySize", "round", "mystery"].map((name) => ({ name, sensitive: false }));

    it("splits the list into named groups in a fixed order", () => {
        expect(groupPlaceholders(list).map((g) => [g.id, g.items.map((p) => p.name)])).toEqual([
            ["you", ["hero", "kills"]],
            ["party", ["partySize"]],
            ["streetBrawl", ["round"]],
            ["other", ["mystery"]],
        ]);
    });

    it("leaves out empty groups", () => {
        expect(groupPlaceholders([{ name: "hero", sensitive: false }]).map((g) => g.id)).toEqual(["you"]);
    });

    it("keeps every placeholder exactly once", () => {
        const all = groupPlaceholders(list).flatMap((g) => g.items.map((p) => p.name));
        expect(all.sort()).toEqual(list.map((p) => p.name).sort());
    });
});

describe("SOURCE_KINDS", () => {
    it("offers only sources that have art to send", () => {
        expect(SOURCE_KINDS).toEqual(["heroPortrait", "heroIcon", "rankBadge", "customUrl"]);
    });
});

describe("previewSample", () => {
    const heroes = [
        {
            id: 1,
            name: "Abrams",
            icon: null,
            portrait: "abrams.png",
            artIcon: "abrams_sm.png",
            hideoutLine: "Investigating the Hideout",
        },
        { id: 2, name: "Haze", icon: null, portrait: "haze.png", artIcon: null, hideoutLine: null },
    ];
    const ranks = { 5: "Alchemist", 9: "Ritualist" };

    it("uses the picked hero and the tier the preview's sample rank belongs to", () => {
        expect(previewSample(heroes, 1, "Haze", ranks)).toEqual({
            heroName: "Abrams",
            heroPortrait: "abrams.png",
            heroIcon: "abrams_sm.png",
            rankName: "Alchemist",
            heroPresence: "Investigating the Hideout",
        });
    });

    it("falls back to the named sample hero when none is picked", () => {
        expect(previewSample(heroes, undefined, "Haze", ranks)).toMatchObject({
            heroName: "Haze",
            heroPortrait: "haze.png",
            heroIcon: null,
        });
    });

    it("keeps the name and drops art for an unknown sample hero or missing rank names", () => {
        expect(previewSample([], undefined, "Haze", {})).toEqual({
            heroName: "Haze",
            heroPortrait: null,
            heroIcon: null,
            rankName: null,
            heroPresence: null,
        });
    });
});
