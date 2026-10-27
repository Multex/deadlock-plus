import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DEFAULT_TRACKS,
    WORKER_SILENCE_MS,
    pickSupport,
    probeVideoSupport,
    runEncodeWorker,
    videoFileName,
    type EncodeProbe,
    type EncodeWorker,
} from "./export-video";
import type { EncodeJob, EncodeReply, EncodeRequest } from "./encode.worker";
import { isVideoKind } from "./scene";
import { VIDEO_SIZES } from "./timeline";

describe("Dispatch video support", () => {
    it("takes AAC when the system has H.264 and AAC", () => {
        expect(pickSupport({ avc: true, aac: true, opus: true })).toEqual({ audioCodec: "aac" });
        expect(pickSupport({ avc: true, aac: true, opus: false })).toEqual({ audioCodec: "aac" });
    });

    it("falls back to Opus without AAC", () => {
        expect(pickSupport({ avc: true, aac: false, opus: true })).toEqual({ audioCodec: "opus" });
    });

    it("is unsupported without H.264, or without any audio codec", () => {
        expect(pickSupport({ avc: false, aac: true, opus: true })).toBeNull();
        expect(pickSupport({ avc: true, aac: false, opus: false })).toBeNull();
    });

    const probe = (over: Partial<EncodeProbe> = {}): EncodeProbe => ({
        canEncodeVideo: vi.fn(async () => true),
        canEncodeAudio: vi.fn(async () => true),
        ...over,
    });

    it("asks for H.264 at every export size and audio at 48 kHz stereo", async () => {
        const deps = probe();
        expect(await probeVideoSupport(deps)).toEqual({ audioCodec: "aac" });
        expect(vi.mocked(deps.canEncodeVideo).mock.calls.map(([codec, o]) => [codec, o.width, o.height])).toEqual(
            Object.values(VIDEO_SIZES).map(({ width, height }) => ["avc", width, height]),
        );
        expect(vi.mocked(deps.canEncodeAudio).mock.calls[0]).toEqual([
            "aac",
            expect.objectContaining({ sampleRate: 48_000, numberOfChannels: 2 }),
        ]);
    });

    it("is unsupported when one export size cannot encode", async () => {
        const deps = probe({ canEncodeVideo: vi.fn(async (_c, o) => o.width !== 1440) });
        expect(await probeVideoSupport(deps)).toBeNull();
    });

    it("falls back to Opus through the probe", async () => {
        const deps = probe({ canEncodeAudio: vi.fn(async (codec) => codec === "opus") });
        expect(await probeVideoSupport(deps)).toEqual({ audioCodec: "opus" });
    });

    it("is unsupported when the probe itself throws", async () => {
        const deps = probe({
            canEncodeVideo: vi.fn(async () => {
                throw new ReferenceError("VideoEncoder is not defined");
            }),
        });
        expect(await probeVideoSupport(deps)).toBeNull();
    });
});

describe("Dispatch video file name", () => {
    it("names the kind, the edition and the shape, without repeating the kind", () => {
        expect(videoFileName("collectors-season_1", "collectors", "9:16")).toBe(
            "deadlock-plus-collectors-copy-season-1-9x16.mp4",
        );
        expect(videoFileName("year_end-2026", "year_end", "16:9")).toBe("deadlock-plus-year-end-special-2026-16x9.mp4");
        expect(videoFileName("monthly-2026-09", "monthly", "9:16")).toBe("deadlock-plus-monthly-2026-09-9x16.mp4");
    });

    it("keeps an id that does not start with its kind whole", () => {
        expect(videoFileName("Season 2 (Beta)", "collectors", "1:1")).toBe(
            "deadlock-plus-collectors-copy-season-2-beta-1x1.mp4",
        );
    });

    it("stays within the 100 characters a save name may have", () => {
        const name = videoFileName(`collectors-${"x".repeat(200)}`, "collectors", "1:1");
        expect(name.length).toBeLessThanOrEqual(100);
        expect(name).toMatch(/^deadlock-plus-collectors-copy-x+-1x1\.mp4$/);
    });
});

describe("Dispatch video music default", () => {
    it("opens on a hit for a Collector's Copy, on the menu build for a Year-End Special, on the title theme for a Monthly", () => {
        expect(DEFAULT_TRACKS).toEqual({ monthly: "title", collectors: "postgame", year_end: "menu" });
    });
});

describe("Dispatch video kinds", () => {
    it("makes a video for the Monthly, the Collector's Copy and the Year-End Special, never the Weekly", () => {
        expect(isVideoKind("monthly")).toBe(true);
        expect(isVideoKind("collectors")).toBe(true);
        expect(isVideoKind("year_end")).toBe(true);
        expect(isVideoKind("weekly")).toBe(false);
    });
});

class FakeWorker implements EncodeWorker {
    onmessage: EncodeWorker["onmessage"] = null;
    onerror: EncodeWorker["onerror"] = null;
    onmessageerror: EncodeWorker["onmessageerror"] = null;
    sent: EncodeRequest[] = [];
    terminate = vi.fn();
    postMessage(message: EncodeRequest) {
        this.sent.push(message);
    }
    reply(data: EncodeReply) {
        this.onmessage?.({ data } as MessageEvent<EncodeReply>);
    }
}

const JOB = { fonts: [], images: {} } as unknown as EncodeJob;

describe("Dispatch video worker", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function start(signal = new AbortController().signal) {
        const worker = new FakeWorker();
        const progress: number[] = [];
        const outcome = runEncodeWorker(worker, JOB, signal, (done) => progress.push(done)).then(
            (bytes) => ({ bytes }),
            (error: unknown) => ({ error }),
        );
        return { worker, progress, outcome };
    }

    it("resolves with the bytes and ends the worker when it finishes", async () => {
        const { worker, progress, outcome } = start();
        expect(worker.sent[0]?.type).toBe("start");
        worker.reply({ type: "progress", done: 0.5 });
        const bytes = new ArrayBuffer(4);
        worker.reply({ type: "done", bytes });
        expect(await outcome).toEqual({ bytes });
        expect(progress).toEqual([0.5]);
        expect(worker.terminate).toHaveBeenCalled();
    });

    it("gives up on a worker that goes silent, ends it and rejects", async () => {
        const { worker, outcome } = start();
        worker.reply({ type: "progress", done: 0.1 });
        await vi.advanceTimersByTimeAsync(WORKER_SILENCE_MS + 1);
        expect(await outcome).toEqual({ error: expect.any(Error) });
        expect(worker.terminate).toHaveBeenCalled();
    });

    it("gives up on a worker that never answers at all", async () => {
        const { outcome } = start();
        await vi.advanceTimersByTimeAsync(WORKER_SILENCE_MS + 1);
        expect(await outcome).toEqual({ error: expect.any(Error) });
    });

    it("waits as long as progress keeps coming", async () => {
        const { worker, outcome } = start();
        let settled = false;
        void outcome.then(() => (settled = true));
        for (let i = 0; i < 5; i++) {
            await vi.advanceTimersByTimeAsync(WORKER_SILENCE_MS - 1000);
            worker.reply({ type: "progress", done: i / 5 });
        }
        expect(settled).toBe(false);
        worker.reply({ type: "done", bytes: new ArrayBuffer(1) });
        expect(await outcome).toEqual({ bytes: expect.any(ArrayBuffer) });
    });

    it("counts a cancel the dead worker never answers as cancelled", async () => {
        const controller = new AbortController();
        const { worker, outcome } = start(controller.signal);
        controller.abort();
        expect(worker.sent.at(-1)?.type).toBe("cancel");
        await vi.advanceTimersByTimeAsync(WORKER_SILENCE_MS + 1);
        expect(await outcome).toEqual({ bytes: null });
        expect(worker.terminate).toHaveBeenCalled();
    });

    it("rejects and ends the worker when a reply cannot be read", async () => {
        const { worker, outcome } = start();
        worker.onmessageerror?.({} as MessageEvent);
        expect(await outcome).toEqual({ error: expect.any(Error) });
        expect(worker.terminate).toHaveBeenCalled();
    });

    it("rejects and ends the worker on an error event", async () => {
        const { worker, outcome } = start();
        worker.onerror?.({ message: "" } as ErrorEvent);
        expect(await outcome).toEqual({ error: expect.any(Error) });
        expect(worker.terminate).toHaveBeenCalled();
    });

    it("leaves no watchdog behind once it settles", async () => {
        const { worker, outcome } = start();
        worker.reply({ type: "done", bytes: new ArrayBuffer(1) });
        await outcome;
        expect(vi.getTimerCount()).toBe(0);
    });
});
