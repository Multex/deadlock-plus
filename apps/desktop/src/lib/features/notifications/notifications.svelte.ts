import { goto } from "$app/navigation";
import {
    listNotifications,
    markNotificationRead,
    markNotificationsRead,
    onNotificationOpen,
    onNotificationsChanged,
} from "./api";
import { openNotificationFromEvent, unreadCount, type AppNotification } from "./notifications";

export class NotificationsStore {
    items = $state<AppNotification[]>([]);
    status = $state<"loading" | "ready" | "error">("loading");
    unread = $derived(unreadCount(this.items));

    async refresh() {
        try {
            this.items = await listNotifications();
            this.status = "ready";
        } catch {
            // Outside Tauri, a failed command or a malformed body: keep the last good list.
            this.status = "error";
        }
    }

    async markAllRead() {
        if (this.unread === 0) return;
        try {
            await markNotificationsRead();
        } catch {
            // Not running inside Tauri.
        }
    }

    async markRead(id: string) {
        const item = this.items.find((n) => n.id === id);
        if (!item || item.read) return;
        try {
            await markNotificationRead(id);
        } catch {
            // Not running inside Tauri.
        }
    }

    start() {
        void this.refresh();
        const unlisten = onNotificationsChanged(() => void this.refresh()).catch(() => () => {});
        const unlistenOpen = onNotificationOpen((payload) =>
            openNotificationFromEvent(payload, this.items, { goto, markRead: (id) => this.markRead(id) }),
        ).catch(() => () => {});
        return () => {
            void unlisten.then((fn) => fn());
            void unlistenOpen.then((fn) => fn());
        };
    }
}

export const notifications = new NotificationsStore();
