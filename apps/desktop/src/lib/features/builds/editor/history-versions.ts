import type { BuildVersionMeta } from "@deadlock-plus/ipc-types/BuildVersionMeta";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { EditOrigin } from "./session";

const IDENTITY = [
    "heroBuildId",
    "authorAccountId",
    "version",
    "originBuildId",
    "publishTimestamp",
    "lastUpdatedTimestamp",
] as const satisfies readonly (keyof BuildView)[];

/** The version's content under the current build's identity, so a save edits this build instead of an older copy. */
export function restoredBuild(current: BuildView, version: BuildView): BuildView {
    const restored = { ...version };
    for (const key of IDENTITY) (restored as Record<string, unknown>)[key] = current[key];
    return restored;
}

/** Only a build already in the game file has saved versions. */
export function historyBuildId(origin: EditOrigin): number | null {
    return origin.kind === "local" ? origin.buildId : null;
}

export function itemCount(build: BuildView): number {
    return build.modCategories.reduce((sum, category) => sum + category.mods.length, 0);
}

export type AgeUnit = "now" | "minutes" | "hours" | "days";

/** Both times in Unix seconds. */
export function ageOf(thenS: number, nowS: number): { unit: AgeUnit; count: number } {
    const minutes = Math.floor(Math.max(0, nowS - thenS) / 60);
    if (minutes < 1) return { unit: "now", count: 0 };
    if (minutes < 60) return { unit: "minutes", count: minutes };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { unit: "hours", count: hours };
    return { unit: "days", count: Math.floor(hours / 24) };
}

export interface VersionRow {
    id: string;
    savedAt: number;
    /** `null` when it matches the current build's name. */
    name: string | null;
    /** `null` until the version is loaded, or when it matches the current build's count. */
    items: number | null;
}

/** Ids are `<savedAt>-<n>`, `n` counting saves within that second. */
const sequence = (id: string): number => Number(id.slice(id.lastIndexOf("-") + 1)) || 0;

export function versionRows(
    metas: readonly BuildVersionMeta[],
    loaded: ReadonlyMap<string, BuildView>,
    current: BuildView,
): VersionRow[] {
    const currentName = current.name.trim();
    const currentItems = itemCount(current);
    return [...metas]
        .sort((a, b) => b.savedAt - a.savedAt || sequence(b.id) - sequence(a.id))
        .map((meta) => {
            const version = loaded.get(meta.id);
            const items = version ? itemCount(version) : null;
            return {
                id: meta.id,
                savedAt: meta.savedAt,
                name: meta.name.trim() === currentName ? null : meta.name,
                items: items === currentItems ? null : items,
            };
        });
}
