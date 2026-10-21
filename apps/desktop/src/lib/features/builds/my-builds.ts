import type { Build } from "@deadlock-plus/deadlock-api";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ConflictView } from "@deadlock-plus/ipc-types/ConflictView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { QueuedSaveView } from "@deadlock-plus/ipc-types/QueuedSaveView";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";

/** Ids below this are local builds; the GC hands out ids above it on Publish. */
export const LOCAL_ID_LIMIT = 1000;

export type MineStatus = "draft" | "waiting" | "inGame" | "published";

/** A build being edited in the app that was not saved to the game yet. */
export interface Draft {
    id: string;
    heroId: number;
    name: string;
    /** Unix seconds. */
    updatedAt: number;
    /** The saved build the draft edits, or `null` for a new build. */
    buildId: number | null;
}

export function toDraft(stored: DraftView): Draft {
    return {
        id: stored.id,
        heroId: stored.heroId,
        name: stored.build.name,
        updatedAt: stored.updatedAt,
        buildId: stored.source.kind === "new" ? null : stored.source.buildId,
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
    status: MineStatus;
    /** Unix seconds. */
    updatedAt: number | null;
    published: boolean;
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

function statusOf(row: Omit<MineRow, "status">): MineStatus {
    if (row.queue.length > 0) return "waiting";
    if (row.published) return "published";
    if (row.local.length > 0) return "inGame";
    return "draft";
}

function maxOf(values: (number | null | undefined)[]): number | null {
    const known = values.filter((v): v is number => typeof v === "number");
    return known.length > 0 ? Math.max(...known) : null;
}

function rowFor(buildId: number, local: LocalBuild[], api: Build | null, queue: QueuedSaveView[]): MineRow {
    local.sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));
    const named = NAME_ORDER.map((s) => local.find((l) => l.section === s)).find(Boolean);
    const published = api !== null || buildId >= LOCAL_ID_LIMIT;
    const partial = {
        key: `build:${buildId}`,
        buildId,
        heroId: local[0]?.build.heroId ?? api?.hero_build.hero_id ?? null,
        name: named?.build.name ?? api?.hero_build.name ?? queue[0]?.label ?? "",
        updatedAt: maxOf([
            ...local.map((l) => l.build.lastUpdatedTimestamp),
            api?.hero_build.last_updated_timestamp,
            ...queue.map((q) => q.queuedAt),
        ]),
        published,
        edited: published && local.some((l) => l.section === "SavedLastUsed"),
        favorited: local.some((l) => l.section === "Favorites"),
        local,
        api,
        queue,
        draft: null,
        draftOf: null,
    };
    return { ...partial, status: statusOf(partial) };
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
            updatedAt: d.updatedAt,
            published: false,
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

function newestFirst(a: MineRow, b: MineRow): number {
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
