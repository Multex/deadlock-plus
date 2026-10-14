import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackUpdateInstallClicked, trackUpdateShown, fakeUpdater } = vi.hoisted(() => ({
    trackUpdateInstallClicked: vi.fn(async () => {}),
    trackUpdateShown: vi.fn(async () => {}),
    fakeUpdater: { phase: "available", version: "0.12.0" as string | null, install: vi.fn(async () => {}) },
}));
vi.mock("$lib/features/telemetry/api", () => ({ trackUpdateInstallClicked, trackUpdateShown }));
vi.mock("./updater.svelte", () => ({ updater: fakeUpdater }));

import { UpdateBanner, installUpdate, type BannerDeps } from "./banner.svelte";
import { BANNER_AFTER_MS, createShownTracker, type FirstSeenStore } from "./nudge";
import type { UpdatePhase } from "./updater.svelte";

const DAY = BANNER_AFTER_MS;

function memoryStore(): FirstSeenStore {
    let value: string | null = null;
    return { get: () => value, set: (v) => (value = v) };
}

function setup(store = memoryStore()) {
    const clock = { now: 0 };
    const updater = { phase: "available" as UpdatePhase, version: "0.12.0" as string | null };
    const send = vi.fn();
    const deps: BannerDeps = { updater, store, now: () => clock.now, reportShown: createShownTracker(send) };
    return { banner: new UpdateBanner(deps), clock, updater, send, store, deps };
}

describe("update banner", () => {
    it("stays hidden for the first day an update is known, then shows and reports it once", () => {
        const { banner, clock, send } = setup();
        banner.refresh();
        expect(banner.visible).toBe(false);
        clock.now = DAY / 2;
        banner.reveal();
        expect(banner.visible).toBe(false);
        expect(send).not.toHaveBeenCalled();
        clock.now = DAY + 1;
        banner.refresh();
        expect(banner.visible).toBe(true);
        banner.reveal();
        expect(send.mock.calls).toEqual([["0.12.0"]]);
    });

    it("comes back on the next launch without waiting another day", () => {
        const first = setup();
        first.banner.refresh();
        const relaunched = new UpdateBanner({ ...first.deps, now: () => DAY + 1 });
        relaunched.refresh();
        expect(relaunched.visible).toBe(true);
    });

    it("hides on dismiss until the window is shown again", () => {
        const { banner, clock } = setup();
        banner.refresh();
        clock.now = DAY + 1;
        banner.refresh();
        banner.dismiss();
        expect(banner.visible).toBe(false);
        banner.refresh();
        expect(banner.visible).toBe(false);
        banner.reveal();
        expect(banner.visible).toBe(true);
    });

    it("is hidden while nothing is waiting to install", () => {
        const { banner, clock, updater } = setup();
        banner.refresh();
        clock.now = DAY + 1;
        updater.phase = "downloading";
        banner.refresh();
        expect(banner.visible).toBe(false);
        updater.phase = "upToDate";
        updater.version = null;
        banner.reveal();
        expect(banner.visible).toBe(false);
    });
});

describe("installUpdate", () => {
    beforeEach(() => {
        trackUpdateInstallClicked.mockClear();
        fakeUpdater.install.mockClear();
    });

    it("records the click with its source and runs the same install as Settings", async () => {
        await installUpdate("banner");
        expect(trackUpdateInstallClicked).toHaveBeenCalledWith("0.12.0", "banner");
        expect(fakeUpdater.install).toHaveBeenCalledTimes(1);
    });

    it("still installs when the event cannot be sent", async () => {
        trackUpdateInstallClicked.mockRejectedValueOnce(new Error("no ipc"));
        await installUpdate("about");
        expect(fakeUpdater.install).toHaveBeenCalledTimes(1);
    });
});
