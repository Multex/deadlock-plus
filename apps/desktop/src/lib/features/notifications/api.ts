import { command, listen, type Unlisten } from "$lib/core/tauri";
import { NOTIFICATION_OPEN_EVENT, type AppNotification } from "./notifications";

const CHANGED_EVENT = "notifications-changed";

const isNullableString = (value: unknown) => value === null || typeof value === "string";

function isNotification(value: unknown): value is AppNotification {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.id === "string" &&
        typeof v.kind === "string" &&
        typeof v.params === "object" &&
        v.params !== null &&
        isNullableString(v.key) &&
        isNullableString(v.title) &&
        isNullableString(v.body) &&
        isNullableString(v.link) &&
        typeof v.timestamp === "number" &&
        typeof v.read === "boolean"
    );
}

/** Rejects a body that is not a list, and drops entries that would throw where the list is rendered. */
export async function listNotifications(): Promise<AppNotification[]> {
    const body: unknown = await command("list_notifications");
    if (!Array.isArray(body)) throw new Error("list_notifications answered something other than a list");
    return body.filter(isNotification);
}

export const markNotificationsRead = () => command("mark_notifications_read");
export const markNotificationRead = (id: string) => command("mark_notification_read", { id });
export const onNotificationsChanged = (handler: () => void): Promise<Unlisten> => listen(CHANGED_EVENT, handler);
export const onNotificationOpen = (handler: (payload: unknown) => void): Promise<Unlisten> =>
    listen<unknown>(NOTIFICATION_OPEN_EVENT, handler);
