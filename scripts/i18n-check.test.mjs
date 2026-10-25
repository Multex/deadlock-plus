import { describe, expect, it } from "vitest";
import {
    checkCatalogs,
    extractKeyLiterals,
    extractKeys,
    extractNamespacePrefixes,
    extractTemplatePrefixes,
    flatten,
    sourceDirs,
} from "./i18n-check.mjs";

describe("flatten", () => {
    it("joins nested keys with dots", () => {
        expect(flatten({ a: { b: "x", c: { d: "y" } }, e: "z" })).toEqual({ "a.b": "x", "a.c.d": "y", e: "z" });
    });
});

describe("extractKeys", () => {
    it("finds literal t and tn keys", () => {
        const source = `t("common.save"); tn('replays_count', n); foo.t("x.y", {a: 1}); format("nope")`;
        expect(extractKeys(source)).toEqual([
            { key: "common.save", plural: false },
            { key: "replays_count", plural: true },
            { key: "x.y", plural: false },
        ]);
    });

    it("ignores dynamic keys", () => {
        expect(extractKeys("t(`a.${b}`); t(key)")).toEqual([]);
    });
});

describe("extractTemplatePrefixes", () => {
    it("returns the static part of a template key before its first interpolation", () => {
        const source = "t(`live.mode.${mode}`); tn(`a.b.${n}_x`); foo.t(`c.${d}.e`)";
        expect(extractTemplatePrefixes(source)).toEqual(["live.mode.", "a.b.", "c."]);
    });

    it("skips templates with no static prefix and calls that are not t or tn", () => {
        expect(extractTemplatePrefixes("t(`${a}.b`); format(`x.${y}`); split(`k.${z}`)")).toEqual([]);
    });
});

describe("extractNamespacePrefixes", () => {
    it("resolves a key built from a namespace constant and a template", () => {
        const source = 'const NS = "game_ui.item_tooltip";\nfunction k(key) { return { key: `${NS}.${key}` }; }';
        expect(extractNamespacePrefixes(source)).toEqual(["game_ui.item_tooltip."]);
    });

    it("ignores a constant no template builds a key from, and a template over an unknown name", () => {
        const source = 'const NS = "a.b"; const x = `${OTHER}.${y}`; const z = `${NS}-${y}`;';
        expect(extractNamespacePrefixes(source)).toEqual([]);
    });
});

describe("extractKeyLiterals", () => {
    const known = new Set(["shell.bar.live", "common.save"]);

    it("finds known keys written as plain string literals outside a t call", () => {
        const source = `return { key: "shell.bar.live", other: 'common.save' }; const x = "not.a.key";`;
        expect(extractKeyLiterals(source, known)).toEqual(["shell.bar.live", "common.save"]);
    });

    it("ignores a key that only appears inside a longer string", () => {
        expect(extractKeyLiterals(`log("see shell.bar.live now")`, known)).toEqual([]);
    });
});

describe("checkCatalogs", () => {
    const en = { common: { save: "Save", hi: "Hi {name}" }, n_one: "{count} a", n_other: "{count} as" };

    it("accepts a clean setup", () => {
        const used = [
            { file: "a.ts", key: "common.save", plural: false },
            { file: "a.ts", key: "n", plural: true },
        ];
        expect(checkCatalogs({ en }, used).errors).toEqual([]);
    });

    it("reports a used key missing from en", () => {
        const errors = checkCatalogs({ en }, [{ file: "a.ts", key: "common.gone", plural: false }]).errors;
        expect(errors).toEqual([expect.stringContaining("a.ts uses missing key common.gone")]);
    });

    it("reports a plural base without an _other form", () => {
        const errors = checkCatalogs({ en: { n_one: "{count} a" } }, [{ file: "a.ts", key: "n", plural: true }]).errors;
        expect(errors).toContainEqual(expect.stringContaining("a.ts uses plural n but en has no n_other"));
    });

    it("reports an en key with a plural suffix that is not part of a plural set", () => {
        const lone = { bar_after: "After", bar_other: "Every other game", empty_one: "One run" };
        const errors = checkCatalogs({ en: { ...en, ...lone } }, []).errors;
        expect(errors).toEqual([expect.stringContaining("en: bar_other"), expect.stringContaining("en: empty_one")]);
    });

    it("ignores blank strings, which Crowdin exports for untranslated keys", () => {
        const fr = { common: { hi: "", save: "  " } };
        expect(checkCatalogs({ en, fr }, []).errors).toEqual([]);
    });

    it("reports placeholder mismatches in other locales", () => {
        const fr = { common: { save: "Enregistrer", hi: "Salut" } };
        const errors = checkCatalogs({ en, fr }, []).errors;
        expect(errors).toEqual([expect.stringContaining("fr: common.hi placeholders")]);
    });

    it("reports an invalid plural suffix in other locales", () => {
        const fr = { n_few_other: "x", n_bad: "{count}" };
        const errors = checkCatalogs({ en, fr }, []).errors;
        expect(errors.some((e) => e.includes("fr: n_bad"))).toBe(true);
    });

    it("warns, not errors, on unused en keys", () => {
        const result = checkCatalogs({ en }, []);
        expect(result.errors).toEqual([]);
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("does not warn on a key referenced by a literal or under a template prefix", () => {
        const catalog = { en: { a: { x: "1", y: "2", z: "3" }, b: { w: "4" } } };
        const result = checkCatalogs(catalog, [], { literals: new Set(["a.x"]), prefixes: ["a.y"] });
        expect(result.warnings).toEqual(["unused en key a.z", "unused en key b.w"]);
    });
});

describe("sourceDirs", () => {
    it("scans the app and every workspace package that can hold a key", () => {
        expect(sourceDirs(["demo", "ipc-types", "match"])).toEqual([
            "apps/desktop/src",
            "packages/demo/src",
            "packages/match/src",
        ]);
    });
});
