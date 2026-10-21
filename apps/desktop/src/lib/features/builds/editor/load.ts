import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { DraftSource } from "@deadlock-plus/ipc-types/DraftSource";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import { parseTarget, pickLocal } from "../build-detail.svelte";
import { LOCAL_ID_LIMIT, type MineRow } from "../my-builds";
import { fitEverywhere } from "./row-ops";
import type { EditOrigin } from "./session";

export type EditTarget =
    { source: "draft"; id: string } | { source: "local" | "public"; id: number } | { source: "new"; heroId: number };

export function parseEditTarget(params: URLSearchParams): EditTarget | null {
    const hero = params.get("new");
    if (hero !== null) {
        if (!/^\d+$/.test(hero)) return null;
        const heroId = Number(hero);
        return Number.isSafeInteger(heroId) && heroId > 0 ? { source: "new", heroId } : null;
    }
    return parseTarget(params);
}

export function editHref(target: EditTarget): string {
    if (target.source === "new") return `/builds/edit?new=${target.heroId}`;
    return `/builds/edit?source=${target.source}&id=${encodeURIComponent(String(target.id))}`;
}

export function editHrefFor(row: MineRow): string | null {
    if (row.draft) return editHref({ source: "draft", id: row.draft.id });
    if (row.buildId === null) return null;
    if (row.local.length > 0) return editHref({ source: "local", id: row.buildId });
    return row.api ? editHref({ source: "public", id: row.buildId }) : null;
}

const PROTO_LANGUAGES: Record<string, number> = {
    german: 1,
    french: 2,
    italian: 3,
    koreana: 4,
    spanish: 5,
    schinese: 6,
    tchinese: 7,
    russian: 8,
    thai: 9,
    japanese: 10,
    portuguese: 11,
    polish: 12,
    hungarian: 18,
    czech: 19,
    turkish: 21,
    brazilian: 22,
    ukrainian: 25,
    latam: 26,
    indonesian: 28,
};

const BY_BASE: Record<string, string> = {
    cs: "czech",
    de: "german",
    es: "spanish",
    fr: "french",
    hu: "hungarian",
    id: "indonesian",
    it: "italian",
    ja: "japanese",
    ko: "koreana",
    pl: "polish",
    ru: "russian",
    th: "thai",
    tr: "turkish",
    uk: "ukrainian",
};

/** Steam ELanguage for an app locale, matching the backend's `game_language` then `proto_language`. */
export function protoLanguage(locale: string): number {
    const [base = "", region = ""] = locale.replace(/_/g, "-").toLowerCase().split("-");
    let game: string | undefined;
    if (base === "pt") game = region === "br" ? "brazilian" : "portuguese";
    else if (base === "zh") game = ["tw", "hk", "mo", "hant"].includes(region) ? "tchinese" : "schinese";
    else if (base === "es" && ["419", "mx", "ar", "cl", "co", "pe", "ve", "latn"].includes(region)) game = "latam";
    else game = BY_BASE[base];
    return (game && PROTO_LANGUAGES[game]) || 0;
}

/** The ids, author and timestamps are placeholders: the backend assigns them on the first save. */
export function newBuild(heroId: number, language: number, categoryName: string): BuildView {
    const fit = fitEverywhere(0);
    return {
        heroBuildId: 0,
        heroId,
        authorAccountId: 0,
        lastUpdatedTimestamp: null,
        name: "",
        description: "",
        language,
        version: 0,
        originBuildId: null,
        modCategories: [
            { mods: [], name: categoryName, description: "", width: fit.width, height: fit.height, optional: false },
        ],
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

export interface EditSession {
    build: BuildView;
    origin: EditOrigin;
    /** Set when the session resumes a stored draft. */
    draftId?: string;
}

export interface LoadDeps {
    local(): Promise<LocalBuilds>;
    /** Newest first. */
    drafts(): Promise<DraftView[]>;
    /** The newest published version, or null when the API does not list it. */
    published(id: number): Promise<BuildView | null>;
    /** The game language number new builds take. */
    language: number;
    copyName(name: string): string;
    categoryName: string;
}

function originOf(source: DraftSource): EditOrigin {
    if (source.kind === "new") return { kind: "new" };
    if (source.kind === "public") return { kind: "copyView" };
    return { kind: "local", section: source.section, base: source.base, buildId: source.buildId };
}

function localOrigin(entry: LocalBuild): EditOrigin {
    return { kind: "local", section: entry.section, base: entry.base, buildId: entry.build.heroBuildId };
}

/** Only the player's own builds are edited in place; anything else becomes a new local copy. */
export function editsInPlace(entry: Pick<LocalBuild, "section" | "build">, accountId: number | null): boolean {
    const id = entry.build.heroBuildId;
    return entry.section === "Unpublished" || id < LOCAL_ID_LIMIT || entry.build.authorAccountId === accountId;
}

function matches(source: DraftSource, origin: EditOrigin, buildId: number): boolean {
    if (origin.kind === "local") return source.kind === "local" && source.buildId === buildId;
    return source.kind === "public" && source.buildId === buildId;
}

/** A draft of the same build is resumed over the file: it holds edits the player has not saved yet. */
async function resumed(session: EditSession, buildId: number, deps: LoadDeps): Promise<EditSession> {
    const draft = (await deps.drafts()).find((d) => matches(d.source, session.origin, buildId));
    return draft ? { build: draft.build, origin: originOf(draft.source), draftId: draft.id } : session;
}

function copyOf(build: BuildView, deps: LoadDeps): EditSession {
    return { build: { ...build, name: deps.copyName(build.name) }, origin: { kind: "copyView" } };
}

export async function loadEditSession(target: EditTarget, deps: LoadDeps): Promise<EditSession | null> {
    if (target.source === "new") {
        return { build: newBuild(target.heroId, deps.language, deps.categoryName), origin: { kind: "new" } };
    }
    if (target.source === "draft") {
        const draft = (await deps.drafts()).find((d) => d.id === target.id);
        return draft ? { build: draft.build, origin: originOf(draft.source), draftId: draft.id } : null;
    }

    const listed = await deps.local();
    const id = target.id;
    if (target.source === "local") {
        const entry = pickLocal(listed.builds, id);
        if (!entry) return null;
        const session = editsInPlace(entry, listed.accountId)
            ? { build: entry.build, origin: localOrigin(entry) }
            : copyOf(entry.build, deps);
        return resumed(session, id, deps);
    }

    const lastUsed = listed.builds.find(
        (b) =>
            b.section === "SavedLastUsed" && b.build.heroBuildId === id && b.build.authorAccountId === listed.accountId,
    );
    if (lastUsed) return resumed({ build: lastUsed.build, origin: localOrigin(lastUsed) }, id, deps);

    const published = (await deps.published(id).catch(() => null)) ?? pickLocal(listed.builds, id)?.build ?? null;
    return published ? resumed(copyOf(published, deps), id, deps) : null;
}
