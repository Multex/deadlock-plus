import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    startFrameCapture: vi.fn(),
    stopFrameCapture: vi.fn(),
    frameCaptureStatus: vi.fn(),
}));

vi.mock("./api", () => api);

import { frameCapture } from "./frames.svelte";

describe("frame capture failures", () => {
    beforeEach(async () => {
        api.frameCaptureStatus.mockReset();
        api.frameCaptureStatus.mockResolvedValue({});
        api.startFrameCapture.mockReset();
        api.stopFrameCapture.mockReset();
        api.startFrameCapture.mockResolvedValue(undefined);
        api.stopFrameCapture.mockResolvedValue({});
        if (frameCapture.active) await frameCapture.stop();
        frameCapture.error = null;
    });

    it("says recording did not start", async () => {
        api.startFrameCapture.mockRejectedValue({ code: "common.internal" });
        await frameCapture.start();
        expect(frameCapture.active).toBe(false);
        expect(frameCapture.error).toBe("Couldn't start recording. Try again.");
    });

    it("says the recording could not be finished", async () => {
        await frameCapture.start();
        api.stopFrameCapture.mockRejectedValue(new Error("pipe closed"));
        await frameCapture.stop();
        expect(frameCapture.error).toBe("Couldn't finish the recording. Try again.");
    });

    it("says the frames could not be read while recording", async () => {
        api.frameCaptureStatus.mockRejectedValue({ code: "common.internal" });
        await frameCapture.start();
        expect(frameCapture.error).toBe("Couldn't read frames just now.");
        api.frameCaptureStatus.mockResolvedValue({});
        await frameCapture.stop();
    });

    it("keeps a command's own sentence", async () => {
        api.startFrameCapture.mockRejectedValue({ code: "diagnostics.frames_read_failed" });
        await frameCapture.start();
        expect(frameCapture.error).toBe("Couldn't read frames from the game. Restart Deadlock and try again.");
    });
});
