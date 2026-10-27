import { describe, expect, it } from "vitest";
import {
    clearAllCopy,
    clearCopy,
    describeUnits,
    ENTRY_IDS,
    ENTRY_META,
    entryText,
    formatAge,
    groupEntries,
    KIND_META,
    knownTotal,
    OWNERS,
    reclaimable,
    regenerableIds,
    sizeShare,
    type EntryId,
    type EntryInfo,
    type EntryStats,
} from "./storage";

const stat = (bytes: number, count: number | null = null, oldestSecs: number | null = null): EntryStats => ({
    bytes,
    count,
    oldestSecs,
});

const info = (id: EntryId, over: Partial<EntryInfo> = {}): EntryInfo => ({
    id,
    path: `C:/x/${id}`,
    clearable: false,
    ...over,
});

const DAY = 86_400;

describe("entry metadata", () => {
    it("has a label, description and consequence for every entry id", () => {
        for (const id of ENTRY_IDS) {
            const text = entryText(id);
            for (const value of Object.values(text)) {
                expect(value.length).toBeGreaterThan(0);
                expect(value).not.toMatch(/^storage\./);
            }
        }
    });

    it("gives every entry a known owner and kind", () => {
        for (const id of ENTRY_IDS) {
            expect(OWNERS.map((o) => o.id)).toContain(ENTRY_META[id].owner);
            expect(Object.keys(KIND_META)).toContain(ENTRY_META[id].kind);
        }
    });

    it("links only the entries that have their own page", () => {
        const linked = ENTRY_IDS.filter((id) => ENTRY_META[id].link);
        expect(linked).toEqual(["replays", "frame-runs"]);
        expect(ENTRY_META.replays.link).toBe("/demos");
        expect(ENTRY_META["frame-runs"].link).toBe("/performance");
    });

    it("lists every entry id exactly once", () => {
        expect(new Set(ENTRY_IDS).size).toBe(ENTRY_IDS.length);
        expect([...ENTRY_IDS].sort()).toEqual(Object.keys(ENTRY_META).sort());
    });

    it("lists the MVP grades as a countable cache that regenerates", () => {
        expect(ENTRY_IDS).toContain("mvp-grades");
        expect(ENTRY_META["mvp-grades"]).toMatchObject({
            owner: "deadlock-plus",
            kind: "regenerates",
            countable: true,
        });
    });

    it("lists the shared matches as an uncounted Deadlock+ history file", () => {
        expect(ENTRY_IDS).toContain("shared-matches");
        expect(ENTRY_META["shared-matches"]).toEqual({ owner: "deadlock-plus", kind: "history" });
    });

    it("lists the Dispatch editions as the user's own uncounted data", () => {
        expect(ENTRY_IDS).toContain("dispatch-editions");
        expect(ENTRY_META["dispatch-editions"]).toEqual({ owner: "deadlock-plus", kind: "yours" });
        expect(entryText("dispatch-editions").label).toBe("Dispatch editions");
    });

    it("has no broad app data entry", () => {
        expect(ENTRY_IDS).not.toContain("app-data" as never);
    });

    it("uses short names for the app's own entries", () => {
        expect(entryText("logs").label).toBe("App logs");
        expect(entryText("other-app-files").label).toBe("Other app files");
    });

    it("marks caches as regenerating and user data as yours", () => {
        for (const id of ["stats-cache", "server-list-cache", "replay-info-cache", "patch-notes-index"] as const) {
            expect(ENTRY_META[id].kind).toBe("regenerates");
        }
        for (const id of ["settings", "server-presets", "replay-rules"] as const) {
            expect(ENTRY_META[id].kind).toBe("yours");
        }
    });

    it("keeps the app's entries under the Deadlock+ owner", () => {
        const ids = [
            "settings",
            "server-presets",
            "replay-rules",
            "connection-history",
            "notifications",
            "patch-notes-index",
            "stats-cache",
            "server-list-cache",
            "replay-info-cache",
            "other-app-files",
            "frame-runs",
            "logs",
            "voice-ban-backups",
        ] as const;
        for (const id of ids) expect(ENTRY_META[id].owner).toBe("deadlock-plus");
    });

    it("marks replays as history and the shader cache as regenerating", () => {
        expect(ENTRY_META.replays.kind).toBe("history");
        expect(ENTRY_META["shader-cache"].kind).toBe("regenerates");
        expect(ENTRY_META.addons.kind).toBe("managed");
    });
});

describe("knownTotal", () => {
    it("adds the sizes that have arrived and skips the ones still loading", () => {
        const stats: Partial<Record<EntryId, EntryStats>> = { replays: stat(100), "shader-cache": stat(20) };
        expect(knownTotal(stats)).toBe(120);
    });

    it("is zero when nothing has loaded", () => {
        expect(knownTotal({})).toBe(0);
    });
});

describe("groupEntries", () => {
    const entries = ENTRY_IDS.map((id) => info(id));

    it("keeps the section order and drops sections with no entries", () => {
        const groups = groupEntries(
            entries.filter((e) => ENTRY_META[e.id].owner !== "mods"),
            {},
        );
        expect(groups.map((g) => g.owner.id)).toEqual(["deadlock", "deadlock-plus"]);
    });

    it("sorts rows by size, largest first, with unmeasured rows last in their original order", () => {
        const stats = { "shader-cache": stat(50), replays: stat(900), "console-log": stat(1) };
        const deadlock = groupEntries(entries, stats).find((g) => g.owner.id === "deadlock")!;
        expect(deadlock.entries.map((e) => e.id)).toEqual([
            "replays",
            "shader-cache",
            "console-log",
            "hero-presence-cache",
        ]);
    });

    it("totals each section from the sizes that have arrived", () => {
        const stats = { "shader-cache": stat(50), replays: stat(900) };
        const deadlock = groupEntries(entries, stats).find((g) => g.owner.id === "deadlock")!;
        expect(deadlock.bytes).toBe(950);
    });
});

describe("reclaimable", () => {
    it("adds only clearable entries that exist on this PC", () => {
        const entries = [
            info("shader-cache", { clearable: true }),
            info("console-log", { clearable: true, path: null }),
            info("replays"),
        ];
        const stats = { "shader-cache": stat(30), "console-log": stat(5), replays: stat(400) };
        expect(reclaimable(entries, stats)).toBe(30);
    });
});

describe("regenerableIds", () => {
    it("picks clearable, present, non-empty entries that regenerate", () => {
        const entries = [
            info("shader-cache", { clearable: true }),
            info("console-log", { clearable: true }),
            info("voice-ban-backups", { clearable: true }),
            info("logs", { clearable: true }),
            info("hero-presence-cache"),
        ];
        const stats = {
            "shader-cache": stat(30),
            "console-log": stat(0),
            "voice-ban-backups": stat(10),
            logs: stat(15),
            "hero-presence-cache": stat(3),
        };
        expect(regenerableIds(entries, stats)).toEqual(["shader-cache"]);
    });

    it("skips entries whose size has not arrived", () => {
        expect(regenerableIds([info("shader-cache", { clearable: true })], {})).toEqual([]);
    });
});

describe("sizeShare", () => {
    it("is the fraction of the total", () => {
        expect(sizeShare(25, 100)).toBe(0.25);
    });

    it("is zero when the total is zero", () => {
        expect(sizeShare(0, 0)).toBe(0);
    });
});

describe("formatAge", () => {
    const now = 100 * 365 * DAY;
    it.each([
        [0, "today"],
        [DAY, "1 day"],
        [12 * DAY, "12 days"],
        [45 * DAY, "1 month"],
        [200 * DAY, "6 months"],
        [400 * DAY, "1 year"],
        [800 * DAY, "2 years"],
    ])("%i seconds ago is %s", (ago, expected) => {
        expect(formatAge(now - ago, now)).toBe(expected);
    });

    it("treats a future timestamp as today", () => {
        expect(formatAge(now + 5 * DAY, now)).toBe("today");
    });
});

describe("describeUnits", () => {
    const now = 100 * 365 * DAY;

    it("counts and dates entries that have units", () => {
        expect(describeUnits("replays", stat(1, 14, now - 90 * DAY), now)).toBe("14 replays, oldest 3 months");
    });

    it("uses the singular for one", () => {
        expect(describeUnits("replays", stat(1, 1, now - 5 * DAY), now)).toBe("1 replay, oldest 5 days");
    });

    it("says nothing for entries with no count", () => {
        expect(describeUnits("shader-cache", stat(1), now)).toBeNull();
    });

    it("says nothing for an empty collection", () => {
        expect(describeUnits("replays", stat(0, 0), now)).toBeNull();
    });

    it("drops the age when there is none", () => {
        expect(describeUnits("replays", stat(1, 3, null), now)).toBe("3 replays");
    });
});

describe("clearCopy", () => {
    it("names the entry and what it frees", () => {
        const copy = clearCopy("shader-cache", 5 * 1024 * 1024);
        expect(copy.title).toContain("shader cache");
        expect(copy.body).toContain("5.0 MB");
    });

    it("says the file cannot be restored", () => {
        for (const id of ["shader-cache", "console-log", "voice-ban-backups"] as const) {
            expect(clearCopy(id, 1).body).toMatch(/can't be undone/i);
        }
    });

    it("repeats the consequence", () => {
        expect(clearCopy("shader-cache", 1).body).toContain(entryText("shader-cache").consequence);
    });
});

describe("clearAllCopy", () => {
    it("lists what is cleared and the total it frees", () => {
        const copy = clearAllCopy(["shader-cache", "console-log"], {
            "shader-cache": stat(3 * 1024 * 1024),
            "console-log": stat(1024 * 1024),
        });
        expect(copy.title).toBe("Clear all files that rebuild themselves?");
        expect(copy.body).toContain("4.0 MB");
        expect(copy.body).toContain("Shader cache");
        expect(copy.body).toContain("Console log");
        expect(copy.body).toMatch(/can't be undone/i);
    });
});
