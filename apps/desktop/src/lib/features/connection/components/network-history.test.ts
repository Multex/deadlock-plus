import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { networkMonitor } from "../monitor.svelte";
import NetworkHistory from "./network-history.svelte";

const SNAPSHOT = { gameRunning: true, relay: null, needsPermission: false, traceError: null };
const fail = () => {
    throw { code: "common.internal" };
};

function healthy() {
    answers.clear();
    answers.set("start_network_monitor", () => undefined);
    answers.set("network_poll", () => ({
        snapshot: SNAPSHOT,
        tail: [
            { t: 1, raw: 40 },
            { t: 2, raw: 42 },
        ],
    }));
    answers.set("engine_ping_latest", () => null);
}

const body = () => render(NetworkHistory).body;

describe("live network history region", () => {
    beforeEach(() => {
        networkMonitor.reset();
        healthy();
    });

    it("shows the history card when the poll answers", async () => {
        await networkMonitor.start();
        expect(body()).not.toContain('data-region-state="error"');
        expect(body()).toContain("Last 0 min");
    });

    for (const [label, answer] of [
        ["throws", fail],
        ["answers null", () => null],
        ["answers without a tail", () => ({ snapshot: SNAPSHOT })],
        ["answers a null snapshot", () => ({ snapshot: null, tail: [] })],
    ] as const) {
        it(`shows a calm error with Retry when network_poll ${label}`, async () => {
            answers.set("network_poll", answer);
            await networkMonitor.start();
            const html = body();
            expect(html).toContain('data-region="live-network-history"');
            expect(html).toContain('data-region-state="error"');
            expect(html).toContain("Retry");
            expect(html).not.toContain("Check the log");
        });
    }

    it("clears the error once a later poll answers", async () => {
        answers.set("network_poll", fail);
        await networkMonitor.start();
        healthy();
        await networkMonitor.refresh();
        expect(body()).not.toContain('data-region-state="error"');
    });

    it("settles start and shows the error when start_network_monitor throws", async () => {
        answers.set("start_network_monitor", fail);
        await expect(networkMonitor.start()).resolves.toBeUndefined();
        const html = body();
        expect(html).toContain('data-region="live-network-history"');
        expect(html).toContain('data-region-state="error"');
        expect(html).toContain("Retry");
    });

    it("retry restarts the monitor and clears the error", async () => {
        answers.set("start_network_monitor", fail);
        await networkMonitor.start();
        healthy();
        await expect(networkMonitor.retry()).resolves.toBeUndefined();
        expect(body()).not.toContain('data-region-state="error"');
    });

    it("retry settles when the monitor still fails", async () => {
        answers.set("start_network_monitor", fail);
        await networkMonitor.start();
        await expect(networkMonitor.retry()).resolves.toBeUndefined();
        expect(body()).toContain('data-region-state="error"');
    });
});
