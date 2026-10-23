import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en" }, t: (key: string) => key }));
vi.mock("$lib/core/errors", () => ({ failureText: (_e: unknown, fallback: string) => fallback }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadAbilityArt: vi.fn(), loadItemArt: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));
vi.mock("$lib/features/match-history/names", () => ({ playerNames: { resolve: vi.fn() } }));

import type { MineRow } from "../my-builds";
import {
    editHref,
    editHrefFor,
    loadEditSession,
    newBuild,
    parseEditTarget,
    protoLanguage,
    type LoadDeps,
} from "./load";

const ME = 77;
const OTHER = 88;

function build(heroBuildId: number, fields: Partial<BuildView> = {}): BuildView {
    return {
        heroBuildId,
        heroId: 7,
        authorAccountId: ME,
        lastUpdatedTimestamp: null,
        name: `build ${heroBuildId}`,
        description: "",
        language: 0,
        version: 1,
        originBuildId: null,
        modCategories: [],
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
        ...fields,
    };
}

const entry = (section: LocalBuild["section"], b: BuildView, base = `${section}-${b.heroBuildId}`): LocalBuild => ({
    section,
    build: b,
    base,
    warnings: [],
});

function draft(id: string, source: DraftView["source"], b: BuildView): DraftView {
    return { id, updatedAt: 1, heroId: b.heroId, source, build: b };
}

function deps(
    local: LocalBuild[],
    drafts: DraftView[] = [],
    published: (id: number) => BuildView | null = () => null,
): LoadDeps & { fetched: number[] } {
    const fetched: number[] = [];
    const listed: LocalBuilds = {
        accountId: ME,
        exists: true,
        gameRunning: false,
        builds: local,
        lastUsed: [],
        queue: [],
        nextLocalId: 10,
    };
    return {
        fetched,
        local: async () => listed,
        drafts: async () => drafts,
        published: async (id) => {
            fetched.push(id);
            return published(id);
        },
        language: 1,
        copyName: (name) => `${name} (copy)`,
        categoryName: "Start",
    };
}

describe("parseEditTarget", () => {
    const parse = (query: string) => parseEditTarget(new URLSearchParams(query));

    it("reads each source", () => {
        expect(parse("source=draft&id=draft-3")).toEqual({ source: "draft", id: "draft-3" });
        expect(parse("source=local&id=5")).toEqual({ source: "local", id: 5 });
        expect(parse("source=public&id=402117")).toEqual({ source: "public", id: 402117 });
        expect(parse("new=12")).toEqual({ source: "new", heroId: 12 });
    });

    it("rejects malformed ids and heroes", () => {
        for (const query of [
            "",
            "source=local",
            "source=local&id=x",
            "source=public&id=0",
            "new=",
            "new=-1",
            "new=a",
        ]) {
            expect(parse(query), query).toBeNull();
        }
    });

    it("round-trips through editHref", () => {
        for (const target of [
            { source: "draft", id: "d 1" },
            { source: "local", id: 5 },
            { source: "public", id: 9000 },
            { source: "new", heroId: 12 },
        ] as const) {
            const href = editHref(target);
            expect(href.startsWith("/builds/edit?")).toBe(true);
            expect(parseEditTarget(new URL(href, "http://x").searchParams)).toEqual(target);
        }
    });
});

describe("editHrefFor", () => {
    const row = (fields: Partial<MineRow>): MineRow => ({
        key: "k",
        buildId: null,
        heroId: 7,
        name: "n",
        status: "local",
        waiting: false,
        updatedAt: null,
        published: false,
        build: null,
        favourites: null,
        version: null,
        edited: false,
        favorited: false,
        local: [],
        api: null,
        queue: [],
        draft: null,
        draftOf: null,
        ...fields,
    });

    it("opens a draft row's draft, a file build by its local id, and an API-only build as public", () => {
        expect(
            editHrefFor(row({ draft: { id: "d1", heroId: 7, name: "", updatedAt: 1, buildId: 5, build: build(5) } })),
        ).toBe(editHref({ source: "draft", id: "d1" }));
        expect(editHrefFor(row({ buildId: 5, local: [entry("Unpublished", build(5))] }))).toBe(
            editHref({ source: "local", id: 5 }),
        );
        const api = {} as NonNullable<MineRow["api"]>;
        expect(editHrefFor(row({ buildId: 4000, published: true, api }))).toBe(
            editHref({ source: "public", id: 4000 }),
        );
        expect(editHrefFor(row({ buildId: 6 }))).toBeNull();
    });
});

describe("protoLanguage", () => {
    it("maps app locales to the game's language numbers as the backend does", () => {
        const expected: Record<string, number> = {
            en: 0,
            af: 0,
            de: 1,
            fr: 2,
            it: 3,
            ko: 4,
            es: 5,
            "es-419": 26,
            "es-MX": 26,
            "zh-CN": 6,
            "zh-TW": 7,
            ru: 8,
            th: 9,
            ja: 10,
            pt: 11,
            "pt-BR": 22,
            pl: 12,
            hu: 18,
            cs: 19,
            tr: 21,
            uk: 25,
            id: 28,
            PT_br: 22,
        };
        for (const [locale, number] of Object.entries(expected)) expect(protoLanguage(locale), locale).toBe(number);
    });
});

describe("newBuild", () => {
    it("is an unnamed build for the hero in the given language with one empty category that keeps its column everywhere", () => {
        const fit = { width: 99, height: 169 };
        const b = newBuild(12, 1, "Start");
        expect(b).toMatchObject({ heroId: 12, name: "", description: "", language: 1, heroBuildId: 0, version: 0 });
        expect(b.originBuildId).toBeNull();
        expect(b.abilityOrder).toEqual([]);
        expect(b.tags).toEqual([]);
        expect(b.modCategories).toEqual([
            { mods: [], name: "Start", description: "", width: fit.width, height: fit.height, optional: false },
        ]);
    });
});

describe("loadEditSession", () => {
    it("starts a new build with origin new and no draft", async () => {
        const session = await loadEditSession({ source: "new", heroId: 12 }, deps([]));
        expect(session).toEqual({ build: newBuild(12, 1, "Start"), origin: { kind: "new" } });
    });

    describe("draft", () => {
        const fresh = build(0, { name: "fresh" });
        const own = build(5);

        it("resumes the draft with the origin its source names", async () => {
            const d = deps(
                [],
                [
                    draft("d-new", { kind: "new" }, fresh),
                    draft("d-local", { kind: "local", section: "Unpublished", buildId: 5, base: "b5" }, own),
                    draft("d-public", { kind: "public", buildId: 4000 }, build(4000)),
                ],
            );
            expect(await loadEditSession({ source: "draft", id: "d-new" }, d)).toEqual({
                build: fresh,
                origin: { kind: "new" },
                draftId: "d-new",
            });
            expect(await loadEditSession({ source: "draft", id: "d-local" }, d)).toEqual({
                build: own,
                origin: { kind: "local", section: "Unpublished", base: "b5", buildId: 5 },
                draftId: "d-local",
            });
            expect((await loadEditSession({ source: "draft", id: "d-public" }, d))?.origin).toEqual({
                kind: "copyView",
            });
        });

        it("is missing when no draft has the id", async () => {
            expect(await loadEditSession({ source: "draft", id: "gone" }, deps([]))).toBeNull();
        });
    });

    describe("local", () => {
        it("edits the build's own section, Unpublished before a favourite copy", async () => {
            const b = build(5);
            const session = await loadEditSession(
                { source: "local", id: 5 },
                deps([entry("Favorites", b, "fav"), entry("Unpublished", b, "unp")]),
            );
            expect(session).toEqual({
                build: b,
                origin: { kind: "local", section: "Unpublished", base: "unp", buildId: 5 },
            });
        });

        it("resumes a draft of the same build over the file", async () => {
            const edited = build(5, { name: "edited" });
            const session = await loadEditSession(
                { source: "local", id: 5 },
                deps(
                    [entry("Unpublished", build(5), "unp")],
                    [
                        draft("other", { kind: "local", section: "Unpublished", buildId: 6, base: "b6" }, build(6)),
                        draft("mine", { kind: "local", section: "Unpublished", buildId: 5, base: "old" }, edited),
                    ],
                ),
            );
            expect(session).toEqual({
                build: edited,
                origin: { kind: "local", section: "Unpublished", base: "old", buildId: 5 },
                draftId: "mine",
            });
        });

        it("copies another player's published build kept as a favourite", async () => {
            const theirs = build(4000, { authorAccountId: OTHER, name: "Theirs" });
            const session = await loadEditSession({ source: "local", id: 4000 }, deps([entry("Favorites", theirs)]));
            expect(session).toEqual({ build: { ...theirs, name: "Theirs (copy)" }, origin: { kind: "copyView" } });
        });

        it("is missing when the file does not hold it", async () => {
            expect(await loadEditSession({ source: "local", id: 5 }, deps([]))).toBeNull();
        });
    });

    describe("public", () => {
        const published = build(4000, { name: "Pub" });

        it("edits the own published build's SavedLastUsed entry, where the game keeps local edits", async () => {
            const lastUsed = build(4000, { name: "Pub (edited)" });
            const d = deps([entry("SavedLastUsed", lastUsed, "slu")], [], () => published);
            expect(await loadEditSession({ source: "public", id: 4000 }, d)).toEqual({
                build: lastUsed,
                origin: { kind: "local", section: "SavedLastUsed", base: "slu", buildId: 4000 },
            });
            expect(d.fetched).toEqual([]);
        });

        it("copies an own published build with no local edit as new", async () => {
            const session = await loadEditSession(
                { source: "public", id: 4000 },
                deps([], [], () => published),
            );
            expect(session).toEqual({ build: { ...published, name: "Pub (copy)" }, origin: { kind: "copyView" } });
        });

        it("copies another player's build even when it is their SavedLastUsed entry", async () => {
            const theirs = build(4000, { authorAccountId: OTHER, name: "Theirs" });
            const session = await loadEditSession(
                { source: "public", id: 4000 },
                deps([entry("SavedLastUsed", theirs)], [], () => theirs),
            );
            expect(session?.origin).toEqual({ kind: "copyView" });
            expect(session?.build.name).toBe("Theirs (copy)");
        });

        it("resumes a draft of the same published build", async () => {
            const copy = build(4000, { name: "Pub (copy) tuned" });
            const session = await loadEditSession(
                { source: "public", id: 4000 },
                deps([], [draft("d9", { kind: "public", buildId: 4000 }, copy)], () => published),
            );
            expect(session).toEqual({ build: copy, origin: { kind: "copyView" }, draftId: "d9" });
        });

        it("falls back to a favourite in the file when the API does not have it", async () => {
            const theirs = build(4000, { authorAccountId: OTHER, name: "Fav" });
            const d = deps([entry("Favorites", theirs)], [], () => {
                throw new Error("offline");
            });
            const session = await loadEditSession({ source: "public", id: 4000 }, d);
            expect(session).toEqual({ build: { ...theirs, name: "Fav (copy)" }, origin: { kind: "copyView" } });
        });

        it("is missing when neither the API nor the file has it", async () => {
            expect(await loadEditSession({ source: "public", id: 4000 }, deps([]))).toBeNull();
        });
    });
});
