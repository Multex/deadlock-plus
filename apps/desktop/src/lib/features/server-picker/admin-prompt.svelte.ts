import { errorCode, failureText } from "$lib/core/errors";
import type { AdminAllowResult } from "$lib/features/admin-access/admin-access.svelte";
import type { AdminButtons } from "$lib/features/admin-access/buttons";

export type NotifyTone = "info" | "warning" | "error";

const NEEDS_PERMISSION = "server_picker.needs_permission";

export interface AdminPromptDeps {
    access: { readonly buttons: AdminButtons; allow(always: boolean): Promise<AdminAllowResult> };
    notify(text: string, tone: NotifyTone): void;
}

export interface FirewallFailure {
    /** Names the write that failed, as the dialog's title. */
    title: string;
    /** The toast for any failure the dialog does not take. */
    fallback: string;
    /** Runs the same write again. */
    retry: () => Promise<void>;
}

/** A firewall write refused for want of administrator access asks for it, then runs again once given. */
export class AdminPrompt {
    pending = $state.raw<{ title: string; retry: () => Promise<void> } | null>(null);

    constructor(private readonly deps: AdminPromptDeps) {}

    failed(error: unknown, { title, fallback, retry }: FirewallFailure) {
        if (errorCode(error) === NEEDS_PERMISSION && this.deps.access.buttons.kind === "prompt") {
            this.pending = { title, retry };
            return;
        }
        this.deps.notify(failureText(error, fallback), "error");
    }

    dismiss() {
        this.pending = null;
    }

    async allow(always: boolean) {
        const pending = this.pending;
        if (!pending) return;
        const { kind, retry, message } = await this.deps.access.allow(always);
        this.pending = null;
        if (message) this.deps.notify(message, kind === "cancelled" ? "info" : retry ? "warning" : "error");
        if (retry) await pending.retry();
    }
}
