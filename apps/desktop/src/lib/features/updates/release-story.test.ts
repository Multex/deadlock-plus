import { describe, expect, it } from "vitest";
import { parseChangelog } from "./changelog";
import { releaseStory, sectionKind } from "./release-story";

const md = `## [0.15.0] - 2026-11-01

### Added

- Loose one.
- Loose two.

#### Dispatch

- A Dispatch page prints your week.
- Weekly editions.
- Monthly editions.

#### Front page

- A front page lands after a match.

### Changed

- A change.

#### Performance

- Faster.
- Smaller.

### Fixed

- A fix.
`;

const [entry] = parseChangelog(md);

describe("releaseStory", () => {
    it("makes each Added feature group a headline, in changelog order", () => {
        expect(releaseStory(entry).headlines.map((h) => h.title)).toEqual(["Dispatch", "Front page"]);
    });

    it("leads a headline with its first bullet and keeps the rest as its points", () => {
        const [dispatch, front] = releaseStory(entry).headlines;
        expect(dispatch.lead).toBe("A Dispatch page prints your week.");
        expect(dispatch.points).toEqual(["Weekly editions.", "Monthly editions."]);
        expect(front.lead).toBe("A front page lands after a match.");
        expect(front.points).toEqual([]);
    });

    it("keeps loose bullets and groups outside Added as briefs, per section", () => {
        expect(releaseStory(entry).briefs).toEqual([
            { title: "Added", kind: "added", items: ["Loose one.", "Loose two."], groups: [] },
            {
                title: "Changed",
                kind: "changed",
                items: ["A change."],
                groups: [{ title: "Performance", items: ["Faster.", "Smaller."] }],
            },
            { title: "Fixed", kind: "fixed", items: ["A fix."], groups: [] },
        ]);
    });

    it("drops a section left empty once its groups became headlines", () => {
        const [only] = parseChangelog("## [1.0.0] - 2026-11-01\n\n### Added\n\n#### G\n\n- One.\n\n### Fixed\n\n- F.\n");
        expect(releaseStory(only).briefs.map((b) => b.kind)).toEqual(["fixed"]);
    });

    it("counts every bullet, headline or brief, per kind", () => {
        expect(releaseStory(entry).counts).toEqual({ added: 6, changed: 3, fixed: 1, removed: 0, other: 0, total: 10 });
    });

    it("tells a release without feature groups by an empty headline list", () => {
        const [plain] = parseChangelog("## [0.1.0] - 2026-09-26\n\n### Fixed\n\n- Typo.\n");
        const story = releaseStory(plain);
        expect(story.headlines).toEqual([]);
        expect(story.briefs).toEqual([{ title: "Fixed", kind: "fixed", items: ["Typo."], groups: [] }]);
    });

    it("carries the version and date", () => {
        const story = releaseStory(entry);
        expect([story.version, story.date]).toEqual(["0.15.0", "2026-11-01"]);
    });
});

describe("sectionKind", () => {
    it("reads Keep a Changelog section names in any case", () => {
        expect(["Added", "changed", "FIXED", "Removed"].map(sectionKind)).toEqual([
            "added",
            "changed",
            "fixed",
            "removed",
        ]);
    });

    it("files anything else, and an untitled section, under other", () => {
        expect(["Security", "Deprecated", ""].map(sectionKind)).toEqual(["other", "other", "other"]);
    });
});
