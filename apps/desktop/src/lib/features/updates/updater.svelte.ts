import { failureText } from "$lib/core/errors";
import { restartAfterSaves, runBeforeExitWithinLimit } from "$lib/core/exit";
import { t } from "$lib/core/i18n.svelte";
import { platform } from "$lib/core/platform";
import type { Update } from "$lib/core/updater";
import { settings } from "$lib/features/settings/settings.svelte";
import { flushTelemetry } from "$lib/features/telemetry/api";
import { checkUpdate } from "./api";
import type { UpdateChannel } from "./channel";

export type UpdatePhase = "idle" | "checking" | "upToDate" | "available" | "downloading" | "ready" | "error";
export type UpdateFailure = "check" | "download" | "install";

/** Why the last check failed, for the UI to show where it chooses. Cleared by the next check that succeeds. */
export interface CheckError {
    message: string;
    /** `Date.now()` when the check failed. */
    at: number;
}

/** Long enough to smooth over chunk bursts, short enough that the speed follows a connection that slows down. */
const SPEED_WINDOW_MS = 3000;
const MIN_SPEED_SPAN_MS = 200;

class Updater {
    phase = $state<UpdatePhase>("idle");
    version = $state<string | null>(null);
    /** The found update's release notes (Markdown), or null when it has none. */
    notes = $state<string | null>(null);
    progress = $state<number | null>(null);
    received = $state(0);
    /** Null when the server sent no length. */
    total = $state<number | null>(null);
    /** Bytes per second over the last few seconds; null until there is enough to measure. */
    speed = $state<number | null>(null);
    error = $state<UpdateFailure | null>(null);
    checkError = $state<CheckError | null>(null);

    private update: Update | null = null;
    private checking: Promise<boolean> | null = null;
    private finishing: Promise<void> | null = null;
    private samples: { at: number; received: number }[] = [];

    /** The update channel setting. */
    get channel(): UpdateChannel {
        return settings.updateChannel;
    }

    /**
     * Returns true when the channel offers a build newer than the running one. Never throws: failures land in
     * `error` and `checkError`. A call while a check runs waits for that check. A downloaded update is kept.
     */
    check(): Promise<boolean> {
        if (this.phase === "downloading" || this.phase === "ready") return Promise.resolve(true);
        return (this.checking ??= this.runCheck().finally(() => (this.checking = null)));
    }

    /**
     * Saves the channel and checks it. Moving to a more stable channel never downgrades: until that channel has a
     * newer build than the running one, the check finds nothing. A download already running or done is left alone.
     */
    async setChannel(channel: UpdateChannel): Promise<boolean> {
        if (channel !== this.channel) {
            await settings.setUpdateChannel(channel);
            if (this.channel !== channel) return false;
        }
        if (this.phase === "downloading" || this.phase === "ready") return true;
        this.update = null;
        this.version = null;
        this.notes = null;
        return this.check();
    }

    private async runCheck(): Promise<boolean> {
        for (;;) {
            const channel = this.channel;
            // A recheck with an update already found leaves it on show, so the banner neither blinks nor
            // disappears when one hourly check fails.
            const found = this.phase === "available" && this.update !== null;
            if (!found) this.phase = "checking";
            this.error = null;
            let update: Update | null;
            try {
                update = await checkUpdate(channel);
            } catch (e) {
                if (channel !== this.channel) continue;
                console.warn("update check failed:", e);
                this.checkError = { message: failureText(e, t("updates.status.check_failed")), at: Date.now() };
                if (found) return true;
                this.phase = "error";
                this.error = "check";
                return false;
            }
            if (channel !== this.channel) continue;
            this.update = update;
            this.version = update?.version ?? null;
            this.notes = update?.body?.trim() ? update.body : null;
            this.checkError = null;
            this.phase = update ? "available" : "upToDate";
            return update !== null;
        }
    }

    /** Downloads and verifies the update, ending in "ready". Nothing is installed and no exit task runs yet. */
    async download(): Promise<boolean> {
        if (!(await this.fetch())) return false;
        this.phase = "ready";
        return true;
    }

    /**
     * Installs a "ready" update and starts the new version. The Windows installer ends the process itself; elsewhere
     * the app relaunches after its exit tasks.
     */
    async restart() {
        if (this.phase !== "ready") return;
        await (this.finishing ??= this.finish("install").finally(() => (this.finishing = null)));
    }

    /** Download and restart in one step. On Windows a successful call rarely returns. */
    async install() {
        if (await this.fetch()) await this.finish("download");
    }

    private async fetch(): Promise<boolean> {
        const update = this.update;
        if (!update || this.phase === "downloading" || this.phase === "ready") return false;
        this.phase = "downloading";
        this.progress = null;
        this.received = 0;
        this.total = null;
        this.speed = null;
        this.error = null;
        try {
            await update.download((event) => {
                if (event.event === "Started") {
                    this.total = event.data.contentLength || null;
                    this.samples = [{ at: Date.now(), received: 0 }];
                }
                if (event.event === "Progress") this.advance(event.data.chunkLength);
            });
            return true;
        } catch (e) {
            console.warn("update download failed:", e);
            this.phase = "error";
            this.error = "download";
            return false;
        }
    }

    private advance(chunk: number) {
        const at = Date.now();
        this.received += chunk;
        this.progress = this.total ? Math.min(this.received / this.total, 1) : null;
        this.samples.push({ at, received: this.received });
        // Keeps the newest sample older than the window as the baseline, so the span is never shorter than it.
        while (this.samples.length > 2 && this.samples[1]!.at <= at - SPEED_WINDOW_MS) this.samples.shift();
        const base = this.samples[0]!;
        const span = at - base.at;
        this.speed = span >= MIN_SPEED_SPAN_MS ? ((this.received - base.received) * 1000) / span : null;
    }

    private async finish(failure: UpdateFailure) {
        const update = this.update;
        if (!update) return;
        try {
            if (platform === "windows") {
                // The Windows installer ends the process without the backend's exit flush, so the queued
                // install click would never leave the machine.
                await Promise.all([runBeforeExitWithinLimit(), flushTelemetry()]);
                await update.install();
            } else {
                await flushTelemetry();
                await update.install();
                await restartAfterSaves();
            }
        } catch (e) {
            console.warn("update install failed:", e);
            this.phase = "error";
            this.error = failure;
        }
    }
}

export const updater = new Updater();
