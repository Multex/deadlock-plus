import { describe, expect, it, vi } from "vitest";
import { UpdateSurface, type SurfaceDeps, type UpdaterStore } from "./surface.svelte";
import type { UpdatePreview } from "./preview";

function store(over: Partial<UpdaterStore> = {}): UpdaterStore {
    return {
        phase: "available",
        version: "1.1.0",
        progress: null,
        error: null,
        check: vi.fn(async () => true),
        install: vi.fn(async () => {}),
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

const PAGE: UpdatePreview = { layout: "page", state: null, channel: null, chip: "plaque" };

describe("update surface", () => {
    it("reads the live updater when no preview state is pinned", () => {
        const { surface } = setup(store({ phase: "downloading", version: "1.1.0" }), PAGE);
        expect(surface.stage).toBe("downloading");
        expect(surface.source.version).toBe("1.1.0");
    });

    it("shows the pinned preview state and never touches the updater from it", async () => {
        const updater = store({ phase: "upToDate", version: null });
        const { surface, deps } = setup(updater, { layout: "dialog", state: "ready", channel: null, chip: "plaque" });
        expect(surface.stage).toBe("ready");
        expect(surface.source.version).toBe("1.1.0");
        await surface.download();
        await surface.restart();
        await surface.retry();
        expect(deps.track).not.toHaveBeenCalled();
        expect(updater.install).not.toHaveBeenCalled();
        expect(updater.check).not.toHaveBeenCalled();
    });

    it("downloads through the store's own download step when it has one, and reports the click", async () => {
        const download = vi.fn(async () => {});
        const updater = store({ download });
        const { surface, deps } = setup(updater);
        await surface.download();
        expect(download).toHaveBeenCalledOnce();
        expect(updater.install).not.toHaveBeenCalled();
        expect(deps.track).toHaveBeenCalledWith("1.1.0", "panel");
    });

    it("falls back to the store's install, which downloads and restarts in one go", async () => {
        const updater = store();
        const { surface, deps } = setup(updater);
        await surface.download();
        expect(updater.install).toHaveBeenCalledOnce();
        expect(deps.track).toHaveBeenCalledWith("1.1.0", "panel");
    });

    it("restarts through the store once the update is downloaded", async () => {
        const restart = vi.fn(async () => {});
        const { surface } = setup(store({ phase: "ready", restart }));
        await surface.restart();
        expect(restart).toHaveBeenCalledOnce();
    });

    it("retries the step that failed", async () => {
        const check = vi.fn(async () => true);
        const failedCheck = setup(store({ phase: "error", error: "check", check }));
        await failedCheck.surface.retry();
        expect(check).toHaveBeenCalledOnce();

        const download = vi.fn(async () => {});
        const failedDownload = setup(store({ phase: "error", error: "download", download }));
        await failedDownload.surface.retry();
        expect(download).toHaveBeenCalledOnce();
    });

    it("is on Release until the store knows a channel", () => {
        expect(setup(store()).surface.channel).toBe("release");
        expect(setup(store({ channel: "beta" })).surface.channel).toBe("beta");
    });

    it("hands a channel change to the store", () => {
        const setChannel = vi.fn();
        const { surface } = setup(store({ channel: "release", setChannel }));
        surface.setChannel("nightly");
        expect(setChannel).toHaveBeenCalledWith("nightly");
    });

    it("keeps a preview's channel change on the page only", () => {
        const setChannel = vi.fn();
        const { surface } = setup(store({ setChannel }), {
            layout: "page",
            state: "available",
            channel: "beta",
            chip: "plaque",
        });
        expect(surface.channel).toBe("beta");
        surface.setChannel("nightly");
        expect(surface.channel).toBe("nightly");
        expect(setChannel).not.toHaveBeenCalled();
    });

    it("opens the page layout by route and the others in place", () => {
        const page = setup(store(), PAGE);
        page.surface.show();
        expect(page.deps.navigate).toHaveBeenCalledWith("/updates");
        expect(page.surface.open).toBe(false);

        const dialog = setup(store(), { layout: "dialog", state: null, channel: null, chip: "plaque" });
        dialog.surface.show();
        expect(dialog.deps.navigate).not.toHaveBeenCalled();
        expect(dialog.surface.open).toBe(true);
    });

    it("opens a dialog or popover preview at once so it can be shot", () => {
        expect(
            setup(store(), { layout: "popover", state: "downloading", channel: null, chip: "plaque" }).surface.open,
        ).toBe(true);
        expect(
            setup(store(), { layout: "page", state: "downloading", channel: null, chip: "plaque" }).surface.open,
        ).toBe(false);
    });

    it("sends the manual download to the page for the current channel", () => {
        const { surface, deps } = setup(store({ channel: "nightly" }));
        surface.openManualDownload();
        expect(deps.openUrl).toHaveBeenCalledWith("https://github.com/deadlock-plus/deadlock-plus/releases");
    });
});
