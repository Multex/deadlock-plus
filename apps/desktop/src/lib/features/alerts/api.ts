import { command, listen, type Unlisten } from "$lib/core/tauri";
import type { Alert } from "./alerts";

const CHANGED_EVENT = "alerts-changed";

const STRING_FIELDS = ["id", "title", "link", "source", "published", "kind", "summary"] as const;

function isAlert(value: unknown): value is Alert {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        STRING_FIELDS.every((field) => typeof v[field] === "string") &&
        (v.image === null || typeof v.image === "string") &&
        typeof v.read === "boolean"
    );
}

/** Rejects a body that is not a list, and drops entries that would throw where the list is rendered. */
export async function listAlerts(): Promise<Alert[]> {
    const body: unknown = await command("list_alerts");
    if (!Array.isArray(body)) throw new Error("list_alerts answered something other than a list");
    return body.filter(isAlert);
}

export const refreshAlerts = () => command("refresh_alerts");
export const markAlertsRead = () => command("mark_alerts_read");
export const onAlertsChanged = (handler: () => void): Promise<Unlisten> => listen(CHANGED_EVENT, handler);
