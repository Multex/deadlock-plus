import { toast } from "svelte-sonner";
import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import { dismissCrash, openCrashIssue, pendingCrash, revealCrashBundle, type CrashReport } from "./crash";

class CrashPrompt {
    report = $state<CrashReport | null>(null);
    reportPath = $state<string | null>(null);
    busy = $state(false);
    dismissed = $state(false);
    /** Closed without pressing Dismiss: hidden until the next launch, the markers stay. */
    closed = $state(false);
    private started: Promise<void> | null = null;

    init(): Promise<void> {
        this.started ??= this.load();
        return this.started;
    }

    private async load() {
        try {
            this.report = await pendingCrash();
        } catch {
            // Not running inside Tauri, or the backend cannot read its markers: no dialog.
        }
    }

    async reveal() {
        await this.run(t("crash.reveal_failed"), async (id) => {
            this.reportPath = await revealCrashBundle(id);
        });
    }

    async openIssue() {
        await this.run(t("crash.issue_failed"), async (id) => {
            this.reportPath = await openCrashIssue(id);
        });
    }

    async dismiss(): Promise<boolean> {
        return this.run(t("crash.dismiss_failed"), async () => {
            await dismissCrash();
            this.dismissed = true;
        });
    }

    private async run(fallback: string, action: (id: string) => Promise<void>): Promise<boolean> {
        const report = this.report;
        if (report === null || this.busy) return false;
        this.busy = true;
        try {
            await action(report.id);
            return true;
        } catch (e) {
            toast.error(failureText(e, fallback));
            return false;
        } finally {
            this.busy = false;
        }
    }
}

export const crashPrompt = new CrashPrompt();
