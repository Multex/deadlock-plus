import { describe, expect, it } from "vitest";
import { formatDate } from "$lib/core/i18n.svelte";
import { replayCount, sharedRows, sharedWhen, sourceCounts } from "./shared";

import type { SharedMatch } from "@deadlock-plus/ipc-types/SharedMatch";

const at = (dayOffset: number, hour: number, minute = 0) =>
    new Date(2026, 9, 18 + dayOffset, hour, minute).getTime() / 1000;
const NOW = at(0, 21);
const time = (s: number) => formatDate(s * 1000, { hour: "numeric", minute: "2-digit" });

const shared = (over: Partial<SharedMatch> = {}): SharedMatch => ({
    matchId: 1,
    at: at(0, 20),
    source: "steam",
    details: true,
    replay: true,
    ...over,
});

describe("sourceCounts", () => {
    it("counts each source in a fixed order: Steam, Deadlock, Steam login", () => {
        const list = [
            shared({ source: "login" }),
            shared({ source: "steam" }),
            shared({ source: "deadlock" }),
            shared({ source: "steam" }),
        ];
        expect(sourceCounts(list)).toEqual([
            { source: "steam", count: 2 },
            { source: "deadlock", count: 1 },
            { source: "login", count: 1 },
        ]);
    });

    it("leaves out a source with nothing shared", () => {
        expect(sourceCounts([shared({ source: "deadlock" })])).toEqual([{ source: "deadlock", count: 1 }]);
        expect(sourceCounts([])).toEqual([]);
    });
});

describe("replayCount", () => {
    it("counts the matches whose replay was shared", () => {
        expect(replayCount([shared(), shared({ replay: false }), shared()])).toBe(2);
    });
});

describe("sharedWhen", () => {
    it("names today and yesterday by calendar day, with the time", () => {
        expect(sharedWhen(at(0, 0, 5), NOW)).toBe(`Today ${time(at(0, 0, 5))}`);
        expect(sharedWhen(at(-1, 23, 50), NOW)).toBe(`Yesterday ${time(at(-1, 23, 50))}`);
    });

    it("gives the date for anything older", () => {
        const then = at(-4, 8, 30);
        expect(sharedWhen(then, NOW)).toBe(
            formatDate(then * 1000, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
        );
    });

    it("reads seconds, not milliseconds", () => {
        expect(sharedWhen(NOW, NOW)).toMatch(/^Today /);
    });
});

describe("sharedRows", () => {
    it("keeps the backend's newest-first order and links each match to its page", () => {
        const rows = sharedRows(
            [
                shared({ matchId: 30, at: at(0, 20), source: "deadlock", replay: false }),
                shared({ matchId: 20, at: at(-1, 9), source: "login", details: false }),
            ],
            NOW,
        );
        expect(rows).toEqual([
            {
                matchId: 30,
                href: "/match-history/30",
                when: `Today ${time(at(0, 20))}`,
                source: "deadlock",
                details: true,
                replay: false,
            },
            {
                matchId: 20,
                href: "/match-history/20",
                when: `Yesterday ${time(at(-1, 9))}`,
                source: "login",
                details: false,
                replay: true,
            },
        ]);
    });
});
