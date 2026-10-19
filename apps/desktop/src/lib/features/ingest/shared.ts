import { formatDate } from "$lib/core/i18n.svelte";
import { relativeDay } from "$lib/features/home/home";
import { matchHref } from "$lib/features/match-history/components/list/view-model";

import type { ShareSource } from "@deadlock-plus/ipc-types/ShareSource";
import type { SharedMatch } from "@deadlock-plus/ipc-types/SharedMatch";

export type SourceCount = { source: ShareSource; count: number };
export type SharedRow = Omit<SharedMatch, "at"> & { href: string; when: string };

const SOURCES: readonly ShareSource[] = ["steam", "deadlock", "login"];

export const SOURCE_LABEL_KEY: Record<ShareSource, string> = {
    steam: "settings.privacy.shared.source_steam",
    deadlock: "settings.privacy.shared.source_deadlock",
    login: "settings.privacy.shared.source_login",
};

export function sourceCounts(list: readonly SharedMatch[]): SourceCount[] {
    return SOURCES.map((source) => ({ source, count: list.filter((m) => m.source === source).length })).filter(
        (c) => c.count > 0,
    );
}

export function replayCount(list: readonly SharedMatch[]): number {
    return list.filter((m) => m.replay).length;
}

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

const dayStart = (s: number) => {
    const d = new Date(s * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function sharedWhen(atS: number, nowS: number): string {
    const days = Math.round((dayStart(nowS) - dayStart(atS)) / 86_400_000);
    if (days > 1) return formatDate(atS * 1000, { day: "numeric", month: "short", ...TIME });
    return `${relativeDay(atS, nowS)} ${formatDate(atS * 1000, TIME)}`;
}

export function sharedRows(list: readonly SharedMatch[], nowS: number): SharedRow[] {
    return list.map(({ at, ...m }) => ({ ...m, href: matchHref(m.matchId), when: sharedWhen(at, nowS) }));
}
