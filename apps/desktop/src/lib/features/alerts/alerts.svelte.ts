import { listAlerts, markAlertsRead, onAlertsChanged, refreshAlerts } from "./api";
import { unreadCount, type Alert } from "./alerts";

export class AlertsStore {
    items = $state<Alert[]>([]);
    status = $state<"loading" | "ready" | "error">("loading");
    unread = $derived(unreadCount(this.items));

    async refresh() {
        try {
            this.items = await listAlerts();
            this.status = "ready";
        } catch {
            // Outside Tauri, a failed command or a malformed body: keep the last good list.
            this.status = "error";
        }
    }

    async fetchNow() {
        try {
            await refreshAlerts();
        } catch {
            // Not running inside Tauri.
        }
        await this.refresh();
    }

    async markAllRead() {
        if (this.unread === 0) return;
        try {
            await markAlertsRead();
        } catch {
            // Not running inside Tauri.
        }
    }

    start() {
        void this.refresh();
        const unlisten = onAlertsChanged(() => void this.refresh()).catch(() => () => {});
        return () => void unlisten.then((fn) => fn());
    }
}

export const alerts = new AlertsStore();
