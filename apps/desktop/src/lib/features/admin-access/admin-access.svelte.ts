import { untrack } from "svelte";
import type { AdminAccessOutcome } from "@deadlock-plus/ipc-types/AdminAccessOutcome";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";
import { failureText } from "$lib/core/errors";
import { listen, type Unlisten } from "$lib/core/tauri";
import { t } from "$lib/core/i18n.svelte";
import { live } from "$lib/features/live/live.svelte";
import { adminAccessStatus, allowAdminAccess, removeAdminAccess } from "./api";
import { buttons, type AdminButtons } from "./buttons";
import { outcomeView, type AdminNotice } from "./outcome";

/** `kind` tells a cancelled prompt from a failure. `retry`: run the action that needed admin access again. `message`: text to show, if any. */
export interface AdminAllowResult {
    kind: "applied" | "cancelled" | "failed";
    retry: boolean;
    message: string | null;
}

export interface AdminAccessDeps {
    live: { readonly state: LiveState | null };
    api: {
        status(): Promise<AdminAccessStatus>;
        allow(always: boolean): Promise<AdminAccessOutcome>;
        remove(): Promise<void>;
    };
    /** Calls `onChange` with `read()` now and each time it changes. Returns the stop. */
    watch?: (read: () => string | null, onChange: (key: string | null) => void) => () => void;
    listen?: (event: string, handler: () => void) => Promise<Unlisten>;
}

const CHANGED_EVENT = "admin-access-changed";

function watchWithEffect(read: () => string | null, onChange: (key: string | null) => void): () => void {
    return $effect.root(() => {
        $effect(() => {
            const key = read();
            untrack(() => onChange(key));
        });
    });
}

const allowFailed = () => t("errors.admin_access.allow_failed");

function noticeText(notice: AdminNotice): string {
    return notice.kind === "nothing_changed"
        ? t("admin_access.nothing_changed")
        : failureText(notice.error, allowFailed());
}

export class AdminAccessStore {
    status = $state.raw<AdminAccessStatus | null>(null);
    busy = $state(false);
    readonly buttons = $derived<AdminButtons>(this.status ? buttons(this.status) : { kind: "hidden" });
    private latest = 0;

    constructor(private readonly deps: AdminAccessDeps) {}

    async refresh() {
        const request = ++this.latest;
        try {
            const next = await this.deps.api.status();
            if (request === this.latest) this.status = next;
        } catch {
            // Not running inside Tauri.
        }
    }

    /** Never throws: a refused or failed request comes back as a message. */
    async allow(always: boolean): Promise<AdminAllowResult> {
        this.busy = true;
        try {
            const view = outcomeView(await this.deps.api.allow(always));
            return {
                kind:
                    view.notice === null ? "applied" : view.notice.kind === "nothing_changed" ? "cancelled" : "failed",
                retry: view.retry,
                message: view.notice ? noticeText(view.notice) : null,
            };
        } catch (error) {
            return { kind: "failed", retry: false, message: failureText(error, allowFailed()) };
        } finally {
            await this.refresh();
            this.busy = false;
        }
    }

    /** Turns Always allow off. Returns the failure text, or null. */
    async remove(): Promise<string | null> {
        this.busy = true;
        try {
            await this.deps.api.remove();
            return null;
        } catch (error) {
            return failureText(error, t("errors.admin_access.remove_failed"));
        } finally {
            await this.refresh();
            this.busy = false;
        }
    }

    /**
     * Loads the status, then reloads it on each live phase change (prompts lock in pregame and in a match) and when
     * the backend says the game's access changed (an elevated game leaves the phase at `gameClosed`).
     */
    start(): () => void {
        const watch = this.deps.watch ?? watchWithEffect;
        const stopWatch = watch(
            () => this.deps.live.state?.phase ?? null,
            () => void this.refresh(),
        );
        let stopped = false;
        let unlisten: Unlisten | null = null;
        (this.deps.listen ?? listen)(CHANGED_EVENT, () => void this.refresh()).then(
            (off) => {
                if (stopped) return off();
                unlisten = off;
                // A flip between the first load and the listener registering would otherwise be missed.
                void this.refresh();
            },
            () => {
                // Not running inside Tauri.
            },
        );
        return () => {
            stopped = true;
            stopWatch();
            unlisten?.();
        };
    }
}

export const adminAccess = new AdminAccessStore({
    live,
    api: { status: adminAccessStatus, allow: allowAdminAccess, remove: removeAdminAccess },
});
