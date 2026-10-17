import { t, tn } from "$lib/core/i18n.svelte";
import { formatBytes } from "$lib/features/demos/demos";
import type { BadgeVariant } from "@deadlock-plus/ui/badge.svelte";

import type { EntryId } from "@deadlock-plus/ipc-types/EntryId";
import type { EntryInfo } from "@deadlock-plus/ipc-types/EntryInfo";
import type { EntryStats } from "@deadlock-plus/ipc-types/EntryStats";
import type { ClearReport } from "@deadlock-plus/ipc-types/ClearReport";

export type { EntryId, EntryInfo, EntryStats, ClearReport };

export const ENTRY_IDS: EntryId[] = [
    "replays",
    "addons",
    "addons-backups",
    "config-backups",
    "gameinfo-backups",
    "hero-presence-cache",
    "shader-cache",
    "console-log",
    "voice-ban-backups",
    "frame-runs",
    "settings",
    "server-presets",
    "replay-rules",
    "connection-history",
    "notifications",
    "patch-notes-index",
    "stats-cache",
    "server-list-cache",
    "replay-info-cache",
    "match-cache",
    "postgame-detail",
    "match-ping",
    "mvp-grades",
    "other-app-files",
    "logs",
];

export type OwnerId = "deadlock" | "deadlock-plus" | "mods";
export type Kind = "regenerates" | "history" | "backup" | "yours" | "managed";

export const OWNERS: { id: OwnerId }[] = [{ id: "deadlock" }, { id: "deadlock-plus" }, { id: "mods" }];

export const KIND_META: Record<Kind, { variant: BadgeVariant }> = {
    regenerates: { variant: "success" },
    history: { variant: "warning" },
    backup: { variant: "secondary" },
    yours: { variant: "default" },
    managed: { variant: "outline" },
};

const catalogKey = (id: string) => id.replaceAll("-", "_");

export function ownerText(id: OwnerId): { label: string; blurb: string } {
    const base = `storage.owners.${catalogKey(id)}`;
    return { label: t(`${base}.label`), blurb: t(`${base}.blurb`) };
}

export function kindText(kind: Kind): { label: string; hint: string } {
    const base = `storage.kinds.${kind}`;
    return { label: t(`${base}.label`), hint: t(`${base}.hint`) };
}

export function entryText(id: EntryId): { label: string; description: string; consequence: string } {
    const base = `storage.entries.${catalogKey(id)}`;
    return { label: t(`${base}.label`), description: t(`${base}.description`), consequence: t(`${base}.consequence`) };
}

interface EntryMeta {
    owner: OwnerId;
    kind: Kind;
    countable?: boolean;
    link?: string;
}

export const ENTRY_META: Record<EntryId, EntryMeta> = {
    replays: {
        owner: "deadlock",
        kind: "history",
        countable: true,
        link: "/demos",
    },
    "hero-presence-cache": {
        owner: "deadlock",
        kind: "regenerates",
    },
    "shader-cache": {
        owner: "deadlock",
        kind: "regenerates",
    },
    "console-log": {
        owner: "deadlock",
        kind: "regenerates",
    },
    "voice-ban-backups": {
        owner: "deadlock-plus",
        kind: "backup",
        countable: true,
    },
    "frame-runs": {
        owner: "deadlock-plus",
        kind: "history",
        link: "/performance",
    },
    settings: {
        owner: "deadlock-plus",
        kind: "yours",
    },
    "server-presets": {
        owner: "deadlock-plus",
        kind: "yours",
    },
    "replay-rules": {
        owner: "deadlock-plus",
        kind: "yours",
    },
    "connection-history": {
        owner: "deadlock-plus",
        kind: "history",
    },
    notifications: {
        owner: "deadlock-plus",
        kind: "history",
    },
    "patch-notes-index": {
        owner: "deadlock-plus",
        kind: "regenerates",
    },
    "stats-cache": {
        owner: "deadlock-plus",
        kind: "regenerates",
    },
    "server-list-cache": {
        owner: "deadlock-plus",
        kind: "regenerates",
    },
    "match-cache": {
        owner: "deadlock-plus",
        kind: "regenerates",
        countable: true,
    },
    "postgame-detail": {
        owner: "deadlock-plus",
        kind: "history",
        countable: true,
    },
    "match-ping": {
        owner: "deadlock-plus",
        kind: "history",
        countable: true,
    },
    "mvp-grades": {
        owner: "deadlock-plus",
        kind: "regenerates",
        countable: true,
    },
    "replay-info-cache": {
        owner: "deadlock-plus",
        kind: "regenerates",
    },
    "other-app-files": {
        owner: "deadlock-plus",
        kind: "yours",
    },
    logs: {
        owner: "deadlock-plus",
        kind: "history",
        countable: true,
    },
    addons: {
        owner: "mods",
        kind: "managed",
    },
    "addons-backups": {
        owner: "mods",
        kind: "backup",
        countable: true,
    },
    "config-backups": {
        owner: "mods",
        kind: "backup",
        countable: true,
    },
    "gameinfo-backups": {
        owner: "mods",
        kind: "backup",
        countable: true,
    },
};

export function clearCopy(id: EntryId, bytes: number): { title: string; body: string } {
    const key = catalogKey(id);
    return {
        title: t("storage.clear.title", { name: t(`storage.entries.${key}.clear_name`) }),
        body: t("storage.clear.body", { size: formatBytes(bytes), consequence: entryText(id).consequence }),
    };
}

export function clearAllCopy(ids: EntryId[], stats: StatsById): { title: string; body: string } {
    const bytes = ids.reduce((sum, id) => sum + (stats[id]?.bytes ?? 0), 0);
    const names = ids.map((id) => entryText(id).label).join(", ");
    return {
        title: t("storage.clear.all_title"),
        body: t("storage.clear.all_body", { size: formatBytes(bytes), names }),
    };
}

export type StatsById = Partial<Record<EntryId, EntryStats>>;

export function knownTotal(stats: StatsById): number {
    return Object.values(stats).reduce((sum, s) => sum + (s?.bytes ?? 0), 0);
}

export interface Group {
    owner: (typeof OWNERS)[number];
    entries: EntryInfo[];
    bytes: number;
}

function bySizeThenOrder(a: { bytes?: number; index: number }, b: { bytes?: number; index: number }) {
    if (a.bytes === undefined || b.bytes === undefined) {
        if (a.bytes === b.bytes) return a.index - b.index;
        return a.bytes === undefined ? 1 : -1;
    }
    return b.bytes - a.bytes || a.index - b.index;
}

export function groupEntries(entries: EntryInfo[], stats: StatsById): Group[] {
    return OWNERS.map((owner) => {
        const sorted = entries
            .filter((e) => ENTRY_META[e.id].owner === owner.id)
            .map((entry, index) => ({ entry, index, bytes: stats[entry.id]?.bytes }))
            .sort(bySizeThenOrder);
        return {
            owner,
            entries: sorted.map((r) => r.entry),
            bytes: sorted.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
        };
    }).filter((g) => g.entries.length > 0);
}

export function reclaimable(entries: EntryInfo[], stats: StatsById): number {
    return entries.filter((e) => e.clearable && e.path).reduce((sum, e) => sum + (stats[e.id]?.bytes ?? 0), 0);
}

export function regenerableIds(entries: EntryInfo[], stats: StatsById): EntryId[] {
    return entries
        .filter(
            (e) => e.clearable && e.path && ENTRY_META[e.id].kind === "regenerates" && (stats[e.id]?.bytes ?? 0) > 0,
        )
        .map((e) => e.id);
}

export function sizeShare(bytes: number, total: number): number {
    return total > 0 ? bytes / total : 0;
}

const DAY_SECS = 86_400;

export function formatAge(thenSecs: number, nowSecs: number): string {
    const days = Math.max(0, Math.floor((nowSecs - thenSecs) / DAY_SECS));
    if (days === 0) return t("storage.age.today");
    if (days < 30) return tn("storage.age.days", days);
    if (days < 365) return tn("storage.age.months", Math.floor(days / 30));
    return tn("storage.age.years", Math.floor(days / 365));
}

export function describeUnits(id: EntryId, stats: EntryStats, nowSecs: number): string | null {
    if (!ENTRY_META[id].countable || !stats.count) return null;
    const units = tn(`storage.entries.${catalogKey(id)}.units`, stats.count);
    return stats.oldestSecs === null
        ? units
        : t("storage.units_oldest", { units, age: formatAge(stats.oldestSecs, nowSecs) });
}

export { storageClear, storageEntries, storageEntryStats, storageReveal } from "./api";
