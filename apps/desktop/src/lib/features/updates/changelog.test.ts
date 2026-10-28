import { describe, expect, it } from "vitest";
import { compareVersions, notesSince, parseChangelog, releasedUpTo } from "./changelog";

const md = `# Changelog

Intro text.

## [Unreleased]

### Added

- Not shipped yet

## [0.2.0] - 2026-10-01

### Added

- Auto-update
- Tray icon

### Fixed

- Crash on start

## [0.1.1] - 2026-09-28

### Fixed

- Typo

## [0.1.0] - 2026-09-26

- First release
`;

describe("parseChangelog", () => {
    it("skips Unreleased and keeps release order", () => {
        expect(parseChangelog(md).map((e) => e.version)).toEqual(["0.2.0", "0.1.1", "0.1.0"]);
    });

    it("reads the date and grouped items", () => {
        const [latest] = parseChangelog(md);
        expect(latest.date).toBe("2026-10-01");
        expect(latest.sections).toEqual([
            { title: "Added", items: ["Auto-update", "Tray icon"] },
            { title: "Fixed", items: ["Crash on start"] },
        ]);
    });

    it("puts ungrouped bullets in a section without a title", () => {
        const last = parseChangelog(md).at(-1)!;
        expect(last.sections).toEqual([{ title: "", items: ["First release"] }]);
    });

    it("reads Unreleased as the version it is given, ahead of the releases", () => {
        const entries = parseChangelog(md, { unreleasedAs: { version: "0.3.0", date: "2026-10-05" } });
        expect(entries.map((e) => e.version)).toEqual(["0.3.0", "0.2.0", "0.1.1", "0.1.0"]);
        expect(entries[0]).toEqual({
            version: "0.3.0",
            date: "2026-10-05",
            sections: [{ title: "Added", items: ["Not shipped yet"] }],
        });
    });

    it("returns nothing for an empty log", () => {
        expect(parseChangelog("# Changelog\n\n## [Unreleased]\n")).toEqual([]);
    });

    describe("feature groups", () => {
        const grouped = `## [0.6.0] - 2026-10-10

### Added

- Small item.

#### Rank estimates

- First.
- Second.

#### Onboarding

- Third.

### Fixed

- A fix.
`;

        it("splits a section into ungrouped items and groups", () => {
            const [entry] = parseChangelog(grouped);
            expect(entry.sections).toEqual([
                {
                    title: "Added",
                    items: ["Small item."],
                    groups: [
                        { title: "Rank estimates", items: ["First.", "Second."] },
                        { title: "Onboarding", items: ["Third."] },
                    ],
                },
                { title: "Fixed", items: ["A fix."] },
            ]);
        });

        it("keeps a section without groups free of a groups key", () => {
            const [latest] = parseChangelog(md);
            for (const section of latest.sections) expect("groups" in section).toBe(false);
        });

        it("ignores a group heading outside any section", () => {
            const [entry] = parseChangelog("## [0.6.0] - 2026-10-10\n\n#### Orphan\n\n- Item.\n");
            expect(entry.sections).toEqual([{ title: "", items: ["Item."] }]);
        });

        it("skips group headings inside Unreleased", () => {
            const text =
                "## [Unreleased]\n\n### Added\n\n#### Hidden\n\n- Nope.\n\n## [0.1.0] - 2026-09-26\n\n### Added\n\n- Yes.\n";
            expect(parseChangelog(text)).toEqual([
                { version: "0.1.0", date: "2026-09-26", sections: [{ title: "Added", items: ["Yes."] }] },
            ]);
        });

        it("starts a fresh group state in the next section", () => {
            const text = "## [0.6.0] - 2026-10-10\n\n### Added\n\n#### G\n\n- In group.\n\n### Fixed\n\n- Plain.\n";
            expect(parseChangelog(text)[0].sections[1]).toEqual({ title: "Fixed", items: ["Plain."] });
        });
    });
});

describe("compareVersions", () => {
    it("orders numerically, not lexically", () => {
        expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
        expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
        expect(compareVersions("0.1.0", "0.1.1")).toBeLessThan(0);
    });

    it("ranks a prerelease below its release", () => {
        expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
    });
});

describe("releasedUpTo", () => {
    const entries = parseChangelog(md);

    it("drops entries newer than the running version", () => {
        expect(releasedUpTo(entries, "0.1.1").map((e) => e.version)).toEqual(["0.1.1", "0.1.0"]);
    });

    it("keeps everything when running the newest", () => {
        expect(releasedUpTo(entries, "0.2.0")).toHaveLength(3);
    });
});

describe("notesSince", () => {
    const entries = parseChangelog(md);

    it("returns releases newer than the last seen, up to the current one", () => {
        expect(notesSince(entries, "0.1.0", "0.2.0").map((e) => e.version)).toEqual(["0.2.0", "0.1.1"]);
    });

    it("stops at the running version", () => {
        expect(notesSince(entries, "0.1.0", "0.1.1").map((e) => e.version)).toEqual(["0.1.1"]);
    });

    it("shows nothing on a first launch", () => {
        expect(notesSince(entries, null, "0.2.0")).toEqual([]);
    });

    it("shows nothing when the version has not changed or went down", () => {
        expect(notesSince(entries, "0.2.0", "0.2.0")).toEqual([]);
        expect(notesSince(entries, "0.2.0", "0.1.0")).toEqual([]);
    });
});
