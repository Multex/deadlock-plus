import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import { createPoller } from "$lib/core/poller";
import { frameCaptureStatus, startFrameCapture, stopFrameCapture, type CaptureStatus, type FrameStats } from "./api";

const POLL_MS = 500;

class FrameCaptureStore {
    status = $state<CaptureStatus | null>(null);
    result = $state.raw<FrameStats | null>(null);
    error = $state<string | null>(null);
    active = $state(false);

    private poller = createPoller(() => this.poll(), { intervalMs: POLL_MS, pauseWhenHidden: true });

    async start() {
        if (this.active) return;
        this.error = null;
        this.result = null;
        try {
            await startFrameCapture();
            this.active = true;
            await this.poll();
            this.poller.start();
        } catch (e) {
            this.error = failureText(e, t("performance.frametimes.start_failed"));
        }
    }

    async stop() {
        if (!this.active) return;
        this.poller.stop();
        this.active = false;
        try {
            this.result = await stopFrameCapture();
        } catch (e) {
            this.error = failureText(e, t("performance.frametimes.stop_failed"));
        }
        this.status = null;
    }

    private async poll() {
        try {
            this.status = await frameCaptureStatus();
        } catch (e) {
            this.error = failureText(e, t("performance.frametimes.read_failed"));
        }
    }
}

export const frameCapture = new FrameCaptureStore();
