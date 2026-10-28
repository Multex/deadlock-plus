import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
import type { AnnouncementSeverity } from "@deadlock-plus/ipc-types/AnnouncementSeverity";

export const MAX_SHOWN = 3;

const RANK: Record<AnnouncementSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function canDismiss(announcement: Announcement): boolean {
    return announcement.severity !== "critical";
}

/** Most severe first, the feed's own order within a severity, dismissed ones left out. */
export function shownAnnouncements(feed: readonly Announcement[], dismissed: readonly string[]): Announcement[] {
    const hidden = new Set(dismissed);
    return feed
        .filter((a) => !(canDismiss(a) && hidden.has(a.id)))
        .sort((a, b) => RANK[a.severity] - RANK[b.severity])
        .slice(0, MAX_SHOWN);
}

export function pruneDismissed(dismissed: readonly string[], feed: readonly Announcement[]): string[] {
    const live = new Set(feed.map((a) => a.id));
    return dismissed.filter((id) => live.has(id));
}

export function parseDismissed(stored: unknown): string[] {
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
}
