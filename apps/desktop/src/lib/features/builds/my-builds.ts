import type { Build } from "@deadlock-plus/deadlock-api";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ConflictView } from "@deadlock-plus/ipc-types/ConflictView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { QueuedSaveView } from "@deadlock-plus/ipc-types/QueuedSaveView";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import type { WinRate } from "./public-builds";

/** Ids below this are local builds; the GC hands out ids above it on Publish. */
export const LOCAL_ID_LIMIT = 1000;

export type MineStatus = "draft" | "waiting" | "inGame" | "published";

/** A row's place: a draft only the app holds, a build in the game's file, or one the game published. */
export type RowStatus = "draft" | "local" | "public";

/** A build being edited in the app that was not saved to the game yet. */
export interface Draft {
    id: string;
    heroId: number;
    name: string;
    /** Unix seconds. */
    updatedAt: number;
    /** The saved build the draft edits, or `null` for a new build. */
    buildId: number | null;
    build: BuildView;
}

export function toDraft(stored: DraftView): Draft {
    return {
        id: stored.id,
        heroId: stored.heroId,
        name: stored.build.name,
        updatedAt: stored.updatedAt,
        buildId: stored.source.kind === "new" ? null : stored.source.buildId,
        build: stored.build,
    };
}

export interface DraftSource {
    list(): Promise<Draft[]>;
    remove(id: string): Promise<void>;
}

export interface MineInput {
    accountId: number;
    local: readonly LocalBuild[];
    queue: readonly QueuedSaveView[];
    /** The player's own builds from the Deadlock API. */
    published: readonly Build[];
    drafts: readonly Draft[];
}

export interface MineRow {
    key: string;
    buildId: number | null;
    /** `null` for a queued new build: the queue does not say which hero it is for. */
    heroId: number | null;
    name: string;
    status: RowStatus;
    /** A save of this build is queued until Deadlock closes. */
    waiting: boolean;
    /** Unix seconds. */
    updatedAt: number | null;
    published: boolean;
    /** The version the game shows, for the shop preview; `null` for a queued new build. */
    build: BuildView | null;
    /** From the Deadlock API; `null` when it has no row for the build. */
    favourites: number | null;
    /** Only a published build's version means anything to the player. */
    version: number | null;
    /** A published build with local edits in `SavedLastUsed`, uploaded only by pressing Publish in-game. */
    edited: boolean;
    favorited: boolean;
    /** File entries in the order Unpublished, Favorites, SavedLastUsed. */
    local: LocalBuild[];
    api: Build | null;
    queue: QueuedSaveView[];
    /** Set on a draft row only: a draft never merges into the saved build it edits. */
    draft: Draft | null;
    /** On a draft row, the name of the player's saved build the draft edits. */
    draftOf: string | null;
}

export interface MineGroup {
    heroId: number | null;
    rows: MineRow[];
}

const SECTION_ORDER = ["Unpublished", "Favorites", "SavedLastUsed"] as const;
// The name the game shows: its local edit first, then the build as saved, then the published copy.
const NAME_ORDER = ["SavedLastUsed", "Unpublished", "Favorites"] as const;

function isMine(entry: LocalBuild, accountId: number): boolean {
    return entry.section === "Unpublished" || entry.build.authorAccountId === accountId;
}

function newestApi(rows: readonly Build[], accountId: number): Map<number, Build> {
    const out = new Map<number, Build>();
    for (const row of rows) {
        const b = row.hero_build;
        if (b.author_account_id !== accountId) continue;
        const kept = out.get(b.hero_build_id);
        if (!kept || kept.hero_build.version < b.version) out.set(b.hero_build_id, row);
    }
    return out;
}

function maxOf(values: (number | null | undefined)[]): number | null {
    const known = values.filter((v): v is number => typeof v === "number");
    return known.length > 0 ? Math.max(...known) : null;
}

function rowFor(buildId: number, local: LocalBuild[], api: Build | null, queue: QueuedSaveView[]): MineRow {
    local.sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));
    const named = NAME_ORDER.map((s) => local.find((l) => l.section === s)).find(Boolean);
    const published = api !== null || buildId >= LOCAL_ID_LIMIT;
    return {
        key: `build:${buildId}`,
        buildId,
        heroId: local[0]?.build.heroId ?? api?.hero_build.hero_id ?? null,
        name: named?.build.name ?? api?.hero_build.name ?? queue[0]?.label ?? "",
        status: published ? "public" : "local",
        waiting: queue.length > 0,
        updatedAt: maxOf([
            ...local.map((l) => l.build.lastUpdatedTimestamp),
            api?.hero_build.last_updated_timestamp,
            ...queue.map((q) => q.queuedAt),
        ]),
        published,
        build: named?.build ?? (api ? viewOfPublished(api) : null),
        favourites: api?.num_favorites ?? null,
        version: published ? (api?.hero_build.version ?? named?.build.version ?? null) : null,
        edited: published && local.some((l) => l.section === "SavedLastUsed"),
        favorited: local.some((l) => l.section === "Favorites"),
        local,
        api,
        queue,
        draft: null,
        draftOf: null,
    };
}

/** One row per build across the file, the queue and the API, plus one per draft, grouped by hero. */
export function mergeMine(input: MineInput): MineGroup[] {
    const local = new Map<number, LocalBuild[]>();
    for (const entry of input.local) {
        if (!isMine(entry, input.accountId)) continue;
        const id = entry.build.heroBuildId;
        local.set(id, [...(local.get(id) ?? []), entry]);
    }
    const api = newestApi(input.published, input.accountId);
    const queue = new Map<number, QueuedSaveView[]>();
    for (const save of input.queue) queue.set(save.buildId, [...(queue.get(save.buildId) ?? []), save]);

    const ids = new Set<number>([...local.keys(), ...api.keys()]);
    // A queued save with no row is a new local build; a high id with no row is another player's build.
    for (const id of queue.keys()) if (id < LOCAL_ID_LIMIT) ids.add(id);

    const rows: MineRow[] = [...ids].map((id) =>
        rowFor(id, local.get(id) ?? [], api.get(id) ?? null, queue.get(id) ?? []),
    );
    const names = new Map(rows.map((r) => [r.buildId, r.name]));
    for (const d of input.drafts) {
        rows.push({
            key: `draft:${d.id}`,
            buildId: null,
            heroId: d.heroId,
            name: d.name,
            status: "draft",
            waiting: false,
            updatedAt: d.updatedAt,
            published: false,
            build: d.build,
            favourites: null,
            version: null,
            edited: false,
            favorited: false,
            local: [],
            api: null,
            queue: [],
            draft: d,
            draftOf: d.buildId === null ? null : (names.get(d.buildId) ?? null),
        });
    }
    return groupRows(rows);
}

/** Another player's build the player favourited, kept in the file's `Favorites`. */
export interface FavouriteRow {
    key: string;
    buildId: number;
    heroId: number;
    name: string;
    authorAccountId: number;
    version: number;
    /** Unix seconds. */
    updatedAt: number | null;
    build: BuildView;
}

/** The `Favorites` entries `mergeMine` leaves out, newest first. */
export function foreignFavourites(accountId: number, local: readonly LocalBuild[]): FavouriteRow[] {
    return local
        .filter((entry) => entry.section === "Favorites" && !isMine(entry, accountId))
        .map(({ build }) => ({
            key: `favourite:${build.heroBuildId}`,
            buildId: build.heroBuildId,
            heroId: build.heroId,
            name: build.name,
            authorAccountId: build.authorAccountId,
            version: build.version,
            updatedAt: build.lastUpdatedTimestamp,
            build,
        }))
        .sort(newestFirst);
}

/** Match stats key on the build id, which only a published build has to itself. */
export function statsHeroes(groups: readonly MineGroup[]): number[] {
    const heroes = groups.flatMap((g) => g.rows.filter((r) => r.published).map((r) => r.heroId));
    return [...new Set(heroes.filter((id): id is number => id !== null))];
}

export type MineView = "mine" | "favourites";
export const MINE_VIEWS: readonly MineView[] = ["mine", "favourites"];

/** `waiting` is a build with a save queued until Deadlock closes, whatever its place. */
export type MineStatusFilter = "all" | RowStatus | "waiting";
export const MINE_STATUSES: readonly MineStatusFilter[] = ["all", "public", "local", "draft", "waiting"];

export type MineSort = "updated" | "name" | "favorites" | "win_rate" | "versions";
export const MINE_SORTS: readonly MineSort[] = ["updated", "name", "favorites", "win_rate", "versions"];
/** Another player's favourite carries no favourite count or win rate. */
export const FAVOURITE_SORTS: readonly MineSort[] = ["updated", "name", "versions"];

export interface MineFilters {
    view: MineView;
    hero: number | null;
    status: MineStatusFilter;
    sort: MineSort;
    tag: number | null;
    /** A Steam ELanguage id. */
    language: "any" | number;
    name: string;
    /** Favourites only: the author's SteamID3. */
    author: number | null;
}

export const DEFAULT_MINE_FILTERS: MineFilters = {
    view: "mine",
    hero: null,
    status: "all",
    sort: "updated",
    tag: null,
    language: "any",
    name: "",
    author: null,
};

/** Prefixed so the Mine tab's filters live in the URL beside the Public tab's. */
const MINE_PARAMS = {
    view: "view",
    hero: "mhero",
    status: "status",
    sort: "msort",
    tag: "mtag",
    language: "mlang",
    name: "mq",
    author: "mauthor",
} as const satisfies Record<keyof MineFilters, string>;

const paramId = (raw: string | null): number | null => {
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
};

const oneOf = <T extends string>(raw: string | null, values: readonly T[], fallback: T): T =>
    raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : fallback;

export function mineFiltersFromParams(params: URLSearchParams): MineFilters {
    const get = (key: keyof MineFilters) => params.get(MINE_PARAMS[key]);
    const d = DEFAULT_MINE_FILTERS;
    return {
        view: oneOf(get("view"), MINE_VIEWS, d.view),
        hero: paramId(get("hero")),
        status: oneOf(get("status"), MINE_STATUSES, d.status),
        sort: oneOf(get("sort"), MINE_SORTS, d.sort),
        tag: paramId(get("tag")),
        language: paramId(get("language")) ?? "any",
        name: get("name") ?? "",
        author: paramId(get("author")),
    };
}

/** Writes non-default filters over `params`; every other parameter is kept. */
export function mineFiltersToParams(filters: MineFilters, params: URLSearchParams): URLSearchParams {
    const out = new URLSearchParams(params);
    const d = DEFAULT_MINE_FILTERS;
    const set = (key: keyof MineFilters, value: string | null) =>
        value === null ? out.delete(MINE_PARAMS[key]) : out.set(MINE_PARAMS[key], value);
    const id = (n: number | null) => (n === null ? null : String(n));
    set("view", filters.view === d.view ? null : filters.view);
    set("hero", id(filters.hero));
    set("status", filters.status === d.status ? null : filters.status);
    set("sort", filters.sort === d.sort ? null : filters.sort);
    set("tag", id(filters.tag));
    set("language", filters.language === "any" ? null : String(filters.language));
    set("name", filters.name.trim() || null);
    set("author", id(filters.author));
    return out;
}

/** The view and the sort only arrange the list; everything else can hide builds. */
export function mineFiltered(filters: MineFilters): boolean {
    const d = DEFAULT_MINE_FILTERS;
    return (
        filters.hero !== d.hero ||
        filters.status !== d.status ||
        filters.tag !== d.tag ||
        filters.language !== d.language ||
        filters.name.trim() !== "" ||
        filters.author !== d.author
    );
}

interface Sortable {
    name: string;
    updatedAt: number | null;
}

/** Higher first; a row without the value goes after every row with one. */
function byValue<T extends Sortable>(value: (row: T) => number | null) {
    return (a: T, b: T) => {
        const x = value(a);
        const y = value(b);
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        return y - x;
    };
}

function sortRows<T extends Sortable>(rows: T[], compare: ((a: T, b: T) => number) | null): T[] {
    if (compare === null) return rows.sort((a, b) => a.name.localeCompare(b.name) || newestFirst(a, b));
    return rows.sort((a, b) => compare(a, b) || newestFirst(a, b));
}

function matchesBuild(build: BuildView | null, name: string, filters: MineFilters): boolean {
    const query = filters.name.trim().toLocaleLowerCase();
    if (query !== "" && !name.toLocaleLowerCase().includes(query)) return false;
    if (filters.tag !== null && !build?.tags.includes(filters.tag)) return false;
    return filters.language === "any" || build?.language === filters.language;
}

function matchesStatus(row: MineRow, status: MineStatusFilter): boolean {
    if (status === "all") return true;
    return status === "waiting" ? row.waiting : row.status === status;
}

export function filterMine(
    rows: readonly MineRow[],
    filters: MineFilters,
    winRates: ReadonlyMap<number, WinRate>,
): MineRow[] {
    const kept = rows.filter(
        (row) =>
            (filters.hero === null || row.heroId === filters.hero) &&
            matchesStatus(row, filters.status) &&
            matchesBuild(row.build, row.name, filters),
    );
    const rate = (row: MineRow) => {
        const won = row.buildId === null ? undefined : winRates.get(row.buildId);
        return won ? won.wins / won.matches : null;
    };
    const compare: Record<MineSort, ((a: MineRow, b: MineRow) => number) | null> = {
        updated: () => 0,
        name: null,
        favorites: byValue((row) => row.favourites),
        win_rate: byValue(rate),
        versions: byValue((row) => row.version ?? row.build?.version ?? null),
    };
    return sortRows(kept, compare[filters.sort]);
}

export function filterFavourites(rows: readonly FavouriteRow[], filters: MineFilters): FavouriteRow[] {
    const kept = rows.filter(
        (row) =>
            (filters.hero === null || row.heroId === filters.hero) &&
            (filters.author === null || row.authorAccountId === filters.author) &&
            matchesBuild(row.build, row.name, filters),
    );
    const sort = FAVOURITE_SORTS.includes(filters.sort) ? filters.sort : "updated";
    if (sort === "name") return sortRows(kept, null);
    return sortRows(kept, sort === "versions" ? byValue((row) => row.version) : () => 0);
}

export function favouriteViewHref(row: FavouriteRow): string {
    return `/builds/view?source=local&id=${row.buildId}`;
}

function newestFirst(a: Pick<MineRow, "updatedAt" | "name">, b: Pick<MineRow, "updatedAt" | "name">): number {
    return (b.updatedAt ?? -Infinity) - (a.updatedAt ?? -Infinity) || a.name.localeCompare(b.name);
}

function groupRows(rows: MineRow[]): MineGroup[] {
    const groups = new Map<number | null, MineRow[]>();
    for (const row of rows) groups.set(row.heroId, [...(groups.get(row.heroId) ?? []), row]);
    const out = [...groups].map(([heroId, list]) => ({ heroId, rows: list.sort(newestFirst) }));
    return out.sort((a, b) => {
        if (a.heroId === null || b.heroId === null) return a.heroId === null ? 1 : -1;
        return newestFirst(a.rows[0]!, b.rows[0]!) || a.heroId - b.heroId;
    });
}

export function openHref(row: MineRow): string | null {
    const href = (source: string, id: string | number) =>
        `/builds/view?source=${source}&id=${encodeURIComponent(String(id))}`;
    if (row.buildId !== null && row.local.length > 0) return href("local", row.buildId);
    if (row.buildId !== null && row.api) return href("public", row.buildId);
    if (row.buildId === null && row.draft) return href("draft", row.draft.id);
    return null;
}

/** Published builds are deleted in-game only: that needs the GC. */
export function canDelete(row: MineRow): boolean {
    return deleteTargets(row).length > 0;
}

export function deleteTargets(row: MineRow): LocalBuild[] {
    return row.published ? [] : row.local;
}

export type FavouriteAction =
    { kind: "favourite"; id: number } | { kind: "favourite"; view: BuildView } | { kind: "unfavourite"; id: number };

/** A build in the file is favourited by id; one only the API lists, by its published view. */
export function favouriteAction(row: MineRow): FavouriteAction | null {
    if (row.buildId === null) return null;
    if (row.local.length > 0) {
        return row.favorited ? { kind: "unfavourite", id: row.buildId } : { kind: "favourite", id: row.buildId };
    }
    return row.api ? { kind: "favourite", view: viewOfPublished(row.api) } : null;
}

/** Copies the version the game would show: the local edit of a published build over the published one. */
export function copyRequest(row: MineRow, name: string): SaveRequest | null {
    const source = NAME_ORDER.map((s) => row.local.find((l) => l.section === s)).find(Boolean);
    if (source) return { kind: "copy", source: source.base, build: { ...source.build, name } };
    if (row.api) return { kind: "copyView", build: { ...viewOfPublished(row.api), name } };
    return null;
}

export function viewOfPublished(row: Build): BuildView {
    const b = row.hero_build;
    return {
        heroBuildId: b.hero_build_id,
        heroId: b.hero_id,
        authorAccountId: b.author_account_id,
        lastUpdatedTimestamp: b.last_updated_timestamp ?? null,
        name: b.name,
        description: b.description ?? "",
        language: b.language,
        version: b.version,
        originBuildId: b.origin_build_id || null,
        modCategories: b.details.mod_categories.map((c) => ({
            name: c.name,
            description: c.description ?? "",
            width: c.width ?? null,
            height: c.height ?? null,
            optional: c.optional ?? false,
            mods: (c.mods ?? []).map((m) => ({
                abilityId: m.ability_id,
                annotation: m.annotation ?? null,
                requiredFlexSlots: m.required_flex_slots ?? null,
                sellPriority: m.sell_priority ?? null,
                imbueTargetAbilityId: m.imbue_target_ability_id ?? null,
            })),
        })),
        abilityOrder: (b.details.ability_order?.currency_changes ?? []).map((c) => ({
            abilityId: c.ability_id,
            currencyType: c.currency_type,
            delta: c.delta,
            annotation: c.annotation ?? null,
        })),
        tags: b.tags ?? [],
        developmentBuild: b.development_build ?? false,
        publishTimestamp: b.publish_timestamp ?? null,
        favorited: false,
    };
}

export function waitingCount(queue: readonly QueuedSaveView[]): number {
    return new Set(queue.map((q) => q.buildId)).size;
}

/** Only a queued save's conflict can be resolved; one from a save made right away is retried by the player. */
export function conflictsOf(flush: FlushView): ConflictView[] {
    return flush.kind === "conflict" ? flush.conflicts.filter((c) => c.saveId !== null) : [];
}

export interface ConflictSide {
    name: string;
    updatedAt: number | null;
    deleted: boolean;
}

export function conflictSides(c: ConflictView): { ours: ConflictSide; game: ConflictSide } {
    const name = c.ours?.name ?? c.game?.name ?? c.base?.name ?? "";
    const side = (build: BuildView | null): ConflictSide =>
        build
            ? { name: build.name, updatedAt: build.lastUpdatedTimestamp, deleted: false }
            : { name, updatedAt: null, deleted: true };
    return { ours: side(c.ours), game: side(c.game) };
}

export function flushFailure(flush: FlushView): { code: string } | null {
    return flush.kind === "failed" ? { code: flush.code } : null;
}
