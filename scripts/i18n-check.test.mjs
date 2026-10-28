import { describe, expect, it } from "vitest";
import {
    checkAreas,
    checkCatalogs,
    extractKeyLiterals,
    extractKeys,
    extractNamespacePrefixes,
    extractTemplatePrefixes,
    flatten,
    mergeAreas,
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

    it("lets a plural form add {count} where the en form leaves it out", () => {
        // Russian "one" also covers 21, 31 and so on, so it needs the number where English "one" does not.
        const enSync = { syncing_one: "Syncing", syncing_other: "{count} syncing" };
        const ru = { syncing_one: "{count} матч синхронизируется", syncing_few: "{count} матча синхронизируются" };
        expect(checkCatalogs({ en: enSync, ru }, []).errors).toEqual([]);
    });

    it("still reports a plural form that drops {count} or adds another placeholder", () => {
        const enSync = { syncing_one: "Syncing", syncing_other: "{count} syncing" };
        const ru = { syncing_one: "{count} {name}", syncing_other: "Синхронизация" };
        const errors = checkCatalogs({ en: enSync, ru }, []).errors;
        expect(errors).toEqual([
            expect.stringContaining("ru: syncing_one placeholders"),
            expect.stringContaining("ru: syncing_other placeholders"),
        ]);
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

describe("mergeAreas", () => {
    const file = (area, locale, catalog) => ({ area, locale, catalog });

    it("joins each locale's area files into one catalog", () => {
        const { catalogs, errors } = mergeAreas([
            file("app", "en", { shell: { a: "A" } }),
            file("live", "en", { live: { b: "B" } }),
            file("app", "fr", { shell: { a: "Un" } }),
        ]);
        expect(catalogs).toEqual({ en: { shell: { a: "A" }, live: { b: "B" } }, fr: { shell: { a: "Un" } } });
        expect(errors).toEqual([]);
    });

    it("reports a namespace held by two areas", () => {
        const { errors } = mergeAreas([file("app", "en", { live: {} }), file("live", "en", { live: {} })]);
        expect(errors).toEqual(["en: live is in both app and live"]);
    });

    it("reports a namespace a locale keeps in a different area than en", () => {
        const { errors } = mergeAreas([file("live", "en", { live: {} }), file("app", "fr", { live: {} })]);
        expect(errors).toEqual(["fr: live is in app but en keeps it in live"]);
    });
});

describe("checkAreas", () => {
    const file = (area, locale, catalog) => ({ area, locale, catalog });
    const files = [
        file("app", "en", { shell: { title: "Deadlock+" } }),
        file("web", "en", { home: { title: "Home", unused: "Unused" } }),
        file("web", "de", { home: { title: "Start" } }),
    ];

    it("checks the website's catalog against the website's code, apart from the app's", () => {
        const { errors, warnings } = checkAreas(files, {
            app: [{ file: "apps/desktop/src/a.ts", text: 't("shell.title")' }],
            web: [{ file: "apps/web/src/b.svelte", text: 't("home.title") t("home.gone")' }],
        });
        expect(errors).toEqual(["web: apps/web/src/b.svelte uses missing key home.gone"]);
        expect(warnings).toEqual(["web: unused en key home.unused"]);
    });

    it("does not count the website's code as using an app key", () => {
        const { warnings } = checkAreas(files, {
            app: [],
            web: [{ file: "apps/web/src/b.svelte", text: 't("home.title") t("home.unused")' }],
        });
        expect(warnings).toEqual(["unused en key shell.title"]);
    });
});
