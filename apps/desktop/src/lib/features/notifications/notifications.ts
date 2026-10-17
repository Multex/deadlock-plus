import { t } from "$lib/core/i18n.svelte";
import type { AppNotification } from "@deadlock-plus/ipc-types/AppNotification";

export type { AppNotification };
export function notificationText(item: AppNotification): { title: string; body: string } {
    if (!item.key) return { title: item.title ?? "", body: item.body ?? "" };
    const params: Record<string, string> = {};
    for (const [name, value] of Object.entries(item.params)) if (value !== undefined) params[name] = value;
    return { title: t(`${item.key}.title`, params), body: t(`${item.key}.body`, params) };
}

export const unreadCount = (items: AppNotification[]): number => items.filter((n) => !n.read).length;

export function formatRelative(unixSeconds: number): string {
    const minutes = Math.max(0, Math.round((Date.now() - unixSeconds * 1000) / 60000));
    if (minutes < 1) return t("notification_list.relative.now");
    if (minutes < 60) return t("notification_list.relative.minutes", { count: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("notification_list.relative.hours", { count: hours });
    const days = Math.round(hours / 24);
    return days === 1
        ? t("notification_list.relative.yesterday")
        : t("notification_list.relative.days", { count: days });
}

export function notificationTarget(item: { kind: string; link: string | null }): string | null {
    if (item.link) return item.link;
    if (item.kind === "maintenance") return "/settings/notifications";
    return null;
}

export const NOTIFICATION_OPEN_EVENT = "notifications://open";

export interface NotificationOpenDeps {
    goto: (target: string) => unknown;
    markRead: (id: string) => unknown;
}

export function openNotificationFromEvent(
    payload: unknown,
    items: AppNotification[],
    deps: NotificationOpenDeps,
): void {
    if (typeof payload !== "object" || payload === null) return;
    const { id, kind, link } = payload as Record<string, unknown>;
    if (typeof id !== "string" || id === "") return;
    const item = items.find((n) => n.id === id);
    const target = notificationTarget(
        item ?? { kind: typeof kind === "string" ? kind : "", link: typeof link === "string" ? link : null },
    );
    deps.markRead(id);
    if (target) void deps.goto(target);
}
