import type { CaptureStatus } from "@deadlock-plus/ipc-types/CaptureStatus";
import type { FrameStats } from "@deadlock-plus/ipc-types/FrameStats";
import type { NetworkSnapshot } from "@deadlock-plus/ipc-types/NetworkSnapshot";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { unelevatedScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const NEEDS_PERMISSION = { code: "server_picker.needs_permission", params: {} };
const FAR = { id: "fra", description: "Frankfurt", relayIps: ["203.0.113.1"] };

let handle: DemoHandle | undefined;
afterEach(() => handle?.uninstall());

const start = () => (handle = install(unelevatedScenario(OPTIONS)));
const blocked = () => handle!.invoke("list_blocked_group_ids", { candidateIds: ["fra", "hkg"] });
const captureStatus = () => handle!.invoke("frame_capture_status", {}) as CaptureStatus;
const snapshot = () => handle!.invoke("network_snapshot", {}) as NetworkSnapshot;
const polled = () => (handle!.invoke("network_poll", { sinceT: null }) as { snapshot: NetworkSnapshot }).snapshot;

it("runs without administrator rights until allowed", () => {
    start();
    expect(handle!.scenario).toBe("unelevated");
    expect(handle!.invoke("admin_access_status", {})).toEqual({
        elevated: false,
        route: "needsPermission",
        canPrompt: true,
        gameRunsAsAdmin: false,
    });
    expect(handle!.invoke("allow_admin_access", { always: false })).toEqual({ status: "applied" });
});

it("keeps each install's permission to itself", () => {
    const scenario = unelevatedScenario(OPTIONS);
    const first = install(scenario);
    first.invoke("allow_admin_access", { always: true });
    handle = install(scenario);
    try {
        expect(() => handle!.invoke("block_server_groups", { groups: [FAR] })).toThrow(
            expect.objectContaining(NEEDS_PERMISSION),
        );
        first.invoke("block_server_groups", { groups: [FAR] });
    } finally {
        first.uninstall();
    }
});

describe("firewall writes", () => {
    it("fail with needs_permission and change nothing until allowed", () => {
        start();
        expect(() => handle!.invoke("block_server_groups", { groups: [FAR] })).toThrow(
            expect.objectContaining(NEEDS_PERMISSION),
        );
        expect(() => handle!.invoke("unblock_server_groups", { ids: ["hkg"] })).toThrow(
            expect.objectContaining(NEEDS_PERMISSION),
        );
        expect(() => handle!.invoke("import_external_blocks", { gameId: "deadlock" })).toThrow(
            expect.objectContaining(NEEDS_PERMISSION),
        );
        expect(blocked()).toEqual(["hkg"]);
    });

    it("succeed after allowing, through the helper or the service, and fail again after removing", () => {
        for (const always of [false, true]) {
            const current = start();
            current.invoke("allow_admin_access", { always });
            current.invoke("block_server_groups", { groups: [FAR] });
            current.invoke("unblock_server_groups", { ids: ["hkg"] });
            expect(current.invoke("import_external_blocks", { gameId: "deadlock" })).toEqual([]);
            expect(blocked()).toEqual(["fra"]);
            current.invoke("remove_admin_access", {});
            expect(() => current.invoke("unblock_server_groups", { ids: ["fra"] })).toThrow(
                expect.objectContaining(NEEDS_PERMISSION),
            );
            current.uninstall();
        }
        handle = undefined;
    });
});

describe("frame capture", () => {
    it("fails as ETW does without administrator rights, and stops with nothing recorded", () => {
        start();
        handle!.invoke("start_frame_capture", {});
        expect(captureStatus()).toMatchObject({
            state: "failed",
            error: "diagnostics.frame_trace_needs_admin",
            frames: 0,
            recentFrametimesMs: [],
        });
        expect((handle!.invoke("stop_frame_capture", {}) as FrameStats).frameCount).toBe(0);
        expect(captureStatus()).toMatchObject({ state: "idle", error: null });
    });

    it("captures after allowing", () => {
        start();
        handle!.invoke("start_frame_capture", {});
        handle!.invoke("stop_frame_capture", {});
        handle!.invoke("allow_admin_access", { always: false });
        handle!.invoke("start_frame_capture", {});
        captureStatus();
        expect(captureStatus()).toMatchObject({ state: "capturing", error: null });
        expect((handle!.invoke("stop_frame_capture", {}) as FrameStats).frameCount).toBeGreaterThan(0);
    });
});

describe("connection monitor", () => {
    it("reports that it needs permission once started", () => {
        start();
        handle!.invoke("start_network_monitor", { allowPrompt: false });
        for (const network of [snapshot(), polled()]) {
            expect(network).toMatchObject({ monitoring: true, needsPermission: true, relay: null });
        }
    });

    it("traces again when restarted with a prompt after allowing", () => {
        start();
        handle!.invoke("start_network_monitor", { allowPrompt: false });
        handle!.invoke("allow_admin_access", { always: false });
        expect(snapshot().needsPermission).toBe(true);
        handle!.invoke("start_network_monitor", { allowPrompt: false });
        expect(snapshot().needsPermission).toBe(true);
        handle!.invoke("start_network_monitor", { allowPrompt: true });
        expect(snapshot().needsPermission).toBe(false);
        expect(polled().needsPermission).toBe(false);
    });
});
