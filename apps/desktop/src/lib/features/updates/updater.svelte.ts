import { runBeforeExit } from "$lib/core/exit";
import { check, type Update } from "$lib/core/updater";

export type UpdatePhase = "idle" | "checking" | "upToDate" | "available" | "downloading" | "error";
export type UpdateFailure = "check" | "download";

class Updater {
    phase = $state<UpdatePhase>("idle");
    version = $state<string | null>(null);
    progress = $state<number | null>(null);
    error = $state<UpdateFailure | null>(null);

    private update: Update | null = null;

    /** Returns true when a newer release was found. Never throws: failures land in `error`. */
    async check(): Promise<boolean> {
        if (this.phase === "checking" || this.phase === "downloading") return this.phase === "downloading";
        this.phase = "checking";
        this.error = null;
        try {
            this.update = await check();
        } catch (e) {
            console.warn("update check failed:", e);
            this.phase = "error";
            this.error = "check";
            return false;
        }
        this.version = this.update?.version ?? null;
        this.phase = this.update ? "available" : "upToDate";
        return this.update !== null;
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
            await runBeforeExit();
            await update.install();
        } catch (e) {
            console.warn("update download failed:", e);
            this.phase = "error";
            this.error = "download";
        }
    }
}

export const updater = new Updater();
