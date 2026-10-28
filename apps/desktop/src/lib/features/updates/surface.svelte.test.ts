import { describe, expect, it, vi } from "vitest";
import { UpdateSurface, type SurfaceDeps, type UpdaterStore } from "./surface.svelte";
import type { UpdatePreview } from "./preview";

function store(over: Partial<UpdaterStore> = {}): UpdaterStore {
    return {
        phase: "available",
        version: "1.1.0",
        progress: null,
        error: null,
        channel: "release",
        check: vi.fn(async () => true),
        download: vi.fn(async () => true),
        restart: vi.fn(async () => {}),
        setChannel: vi.fn(async () => true),
        ...over,
    };
}

function setup(updater: UpdaterStore, preview: UpdatePreview | null = null) {
    const deps: SurfaceDeps = {
        updater,
        preview,
        currentVersion: () => "1.0.0",
        track: vi.fn(),
        navigate: vi.fn(),
        openUrl: vi.fn(),
    };
    return { surface: new UpdateSurface(deps), deps };
}

describe("update surface", () => {
    it("reads the live updater when no preview state is pinned", () => {
        const { surface } = setup(store({ phase: "downloading" }), { state: null, channel: null });
        expect(surface.stage).toBe("downloading");
        expect(surface.source.version).toBe("1.1.0");
    });

    it("shows the pinned preview state and never touches the updater from it", async () => {
        const updater = store({ phase: "upToDate", version: null });
        const { surface, deps } = setup(updater, { state: "ready", channel: null });
        expect(surface.stage).toBe("ready");
        expect(surface.source.version).toBe("1.1.0");
        await surface.download();
        await surface.restart();
        await surface.retry();
        await surface.check();
        expect(deps.track).not.toHaveBeenCalled();
        expect(updater.download).not.toHaveBeenCalled();
        expect(updater.restart).not.toHaveBeenCalled();
        expect(updater.check).not.toHaveBeenCalled();
    });

    it("downloads without installing, and reports the click", async () => {
        const updater = store();
        const { surface, deps } = setup(updater);
        await surface.download();
        expect(updater.download).toHaveBeenCalledOnce();
        expect(updater.restart).not.toHaveBeenCalled();
        expect(deps.track).toHaveBeenCalledWith("1.1.0", "panel");
    });

    it("sends a toast or banner install to the page, where the download starts", async () => {
        const updater = store();
        const { surface, deps } = setup(updater);
        await surface.startFrom("toast");
        expect(deps.navigate).toHaveBeenCalledWith("/updates");
        expect(updater.download).toHaveBeenCalledOnce();
        expect(deps.track).toHaveBeenCalledWith("1.1.0", "toast");
    });

    it("restarts through the store once the update is downloaded", async () => {
        const updater = store({ phase: "ready" });
        await setup(updater).surface.restart();
        expect(updater.restart).toHaveBeenCalledOnce();
    });

    it("retries a failed check by checking, and a failed download or install by downloading again", async () => {
        const failedCheck = store({ phase: "error", error: "check" });
        await setup(failedCheck).surface.retry();
        expect(failedCheck.check).toHaveBeenCalledOnce();
        expect(failedCheck.download).not.toHaveBeenCalled();

        for (const error of ["download", "install"]) {
            const failed = store({ phase: "error", error });
            await setup(failed).surface.retry();
            expect(failed.download).toHaveBeenCalledOnce();
        }
    });

    it("reads and changes the store's channel", () => {
        const updater = store({ channel: "beta" });
        const { surface } = setup(updater);
        expect(surface.channel).toBe("beta");
        surface.setChannel("nightly");
        expect(updater.setChannel).toHaveBeenCalledWith("nightly");
    });

    it("keeps a preview's channel change on the page only", () => {
        const updater = store();
        const { surface } = setup(updater, { state: "available", channel: "beta" });
        expect(surface.channel).toBe("beta");
        surface.setChannel("nightly");
        expect(surface.channel).toBe("nightly");
        expect(updater.setChannel).not.toHaveBeenCalled();
    });

    it("opens the updates page", () => {
        const { surface, deps } = setup(store());
        surface.show();
        expect(deps.navigate).toHaveBeenCalledWith("/updates");
    });

    it("sends the manual download to the page for the current channel", () => {
        const { surface, deps } = setup(store({ channel: "nightly" }));
        surface.openManualDownload();
        expect(deps.openUrl).toHaveBeenCalledWith("https://github.com/deadlock-plus/deadlock-plus/releases");
    });
});
