import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { buildMatcher, matchText, readSourceStrings, stringEntries } from "./crowdin-strings.mjs";

const FILE = "locales/app/en.json";

describe("stringEntries", () => {
    it("names every string by its dotted key and folds plural forms into the base key", () => {
        const entries = stringEntries(
            { nav: { home: "Home" }, matches_one: "{count} match", matches_other: "{count} matches" },
            FILE,
        );
        assert.deepEqual(entries, [
            { identifier: "nav.home", file: FILE, text: "Home" },
            { identifier: "matches", file: FILE, text: "{count} match" },
            { identifier: "matches", file: FILE, text: "{count} matches" },
        ]);
    });
});

describe("matchText", () => {
    const matcher = buildMatcher([
        { identifier: "nav.home", file: FILE, text: "Home" },
        { identifier: "a.save", file: FILE, text: "Save" },
        { identifier: "b.save", file: "locales/builds/en.json", text: "Save" },
        { identifier: "matches", file: FILE, text: "{count} match" },
        { identifier: "matches", file: FILE, text: "{count} matches" },
        { identifier: "greet", file: FILE, text: "Hello, {name}!" },
        { identifier: "pair", file: FILE, text: "{a} / {b}" },
        { identifier: "x", file: FILE, text: "X" },
    ]);

    it("maps exact text to its identifier, ignoring extra whitespace", () => {
        assert.deepEqual(matchText(matcher, "  Home\n"), [{ identifier: "nav.home", file: FILE }]);
    });

    it("lists every identifier that shares a text so the caller can tell it is ambiguous", () => {
        assert.equal(matchText(matcher, "Save").length, 2);
    });

    it("matches placeholder templates and gives a plural key once", () => {
        assert.deepEqual(matchText(matcher, "3 matches"), [{ identifier: "matches", file: FILE }]);
        assert.deepEqual(matchText(matcher, "Hello, Haze!"), [{ identifier: "greet", file: FILE }]);
    });

    it("gives a plural key once when several of its forms match the same text", () => {
        const m = buildMatcher([
            { identifier: "won", file: FILE, text: "Won {n}" },
            { identifier: "won", file: FILE, text: "Won {n} times" },
        ]);
        assert.deepEqual(matchText(m, "Won 3 times"), [{ identifier: "won", file: FILE }]);
    });

    it("skips templates with no words of their own and one-character strings", () => {
        assert.equal(matchText(matcher, "1 / 2"), null);
        assert.equal(matchText(matcher, "X"), null);
    });

    it("escapes regex characters in the literal parts of a template", () => {
        const m = buildMatcher([{ identifier: "cost", file: FILE, text: "Cost (+{n}) ok?" }]);
        assert.deepEqual(matchText(m, "Cost (+5) ok?"), [{ identifier: "cost", file: FILE }]);
        assert.equal(matchText(m, "Cost +5 ok"), null);
    });

    it("survives a trip through JSON, as it does on its way into the page", () => {
        const copy = JSON.parse(JSON.stringify(matcher));
        assert.deepEqual(matchText(copy, "2 match"), [{ identifier: "matches", file: FILE }]);
    });
});

describe("readSourceStrings", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dp-crowdin-strings-"));
    after(() => rmSync(root, { recursive: true, force: true }));

    it("reads the English file of every area folder and nothing else", () => {
        for (const [area, files] of Object.entries({ app: ["en.json", "de.json"], tools: ["en.json"], empty: [] })) {
            mkdirSync(path.join(root, area));
            for (const f of files) writeFileSync(path.join(root, area, f), JSON.stringify({ t: `${area} ${f}` }));
        }
        assert.deepEqual(
            readSourceStrings(root).map((e) => [e.file, e.text]),
            [
                ["locales/app/en.json", "app en.json"],
                ["locales/tools/en.json", "tools en.json"],
            ],
        );
    });
});
