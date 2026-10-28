import { runBeforeExit } from "$lib/core/exit";
import type { Update } from "$lib/core/updater";
import { settings } from "$lib/features/settings/settings.svelte";
import { flushTelemetry } from "$lib/features/telemetry/api";
import { checkUpdate } from "./api";
import type { UpdateChannel } from "./channel";

export type UpdatePhase = "idle" | "checking" | "upToDate" | "available" | "downloading" | "error";
export type UpdateFailure = "check" | "download";

class Updater {
    phase = $state<UpdatePhase>("idle");
    version = $state<string | null>(null);
    progress = $state<number | null>(null);
    error = $state<UpdateFailure | null>(null);

    private update: Update | null = null;
    private checking: Promise<boolean> | null = null;

    /** The update channel setting. */
    get channel(): UpdateChannel {
        return settings.updateChannel;
    }

    /**
     * Returns true when the channel offers a build newer than the running one. Never throws: failures land in
     * `error`. A call while a check runs waits for that check.
     */
    check(): Promise<boolean> {
        if (this.phase === "downloading") return Promise.resolve(true);
        return (this.checking ??= this.runCheck().finally(() => (this.checking = null)));
    }

    /**
     * Saves the channel and checks it. Moving to a more stable channel never downgrades: until that channel has a
     * newer build than the running one, the check finds nothing. A download already running is left alone.
     */
    async setChannel(channel: UpdateChannel): Promise<boolean> {
        if (channel !== this.channel) {
            await settings.setUpdateChannel(channel);
            if (this.channel !== channel) return false;
        }
        if (this.phase === "downloading") return true;
        this.update = null;
        this.version = null;
        return this.check();
    }

    private async runCheck(): Promise<boolean> {
        for (;;) {
            const channel = this.channel;
            this.phase = "checking";
            this.error = null;
            let update: Update | null;
            try {
                update = await checkUpdate(channel);
            } catch (e) {
                if (channel !== this.channel) continue;
                console.warn("update check failed:", e);
                this.phase = "error";
                this.error = "check";
                return false;
            }
            if (channel !== this.channel) continue;
            this.update = update;
            this.version = update?.version ?? null;
            this.phase = update ? "available" : "upToDate";
            return update !== null;
        }
    }

    /** On Windows the installer takes over and the app exits, so a successful call rarely returns. */
    async install() {
        const update = this.update;
        if (!update || this.phase === "downloading") return;
        this.phase = "downloading";
        this.progress = null;
        this.error = null;
        let total = 0;
        let received = 0;
        try {
            await update.download((event) => {
                if (event.event === "Started") total = event.data.contentLength ?? 0;
                if (event.event === "Progress") {
                    received += event.data.chunkLength;
                    this.progress = total > 0 ? Math.min(received / total, 1) : null;
                }
            });
            // The Windows installer ends the process without the backend's exit flush, so the queued
            // install click would never leave the machine.
            await Promise.all([runBeforeExit(), flushTelemetry()]);
            await update.install();
        } catch (e) {
            console.warn("update download failed:", e);
            this.phase = "error";
            this.error = "download";
        }
    }
}

export const updater = new Updater();
