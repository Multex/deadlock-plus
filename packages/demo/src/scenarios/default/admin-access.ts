import type { AdminAccessOutcome } from "@deadlock-plus/ipc-types/AdminAccessOutcome";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import type { CaptureStatus } from "@deadlock-plus/ipc-types/CaptureStatus";
import type { FrameStats } from "@deadlock-plus/ipc-types/FrameStats";
import type { NetworkSnapshot } from "@deadlock-plus/ipc-types/NetworkSnapshot";

import type { Handlers } from "../../backend";
import type { Module } from "../../scenario";

export interface AdminAccessOptions {
    /** Where the app starts. Defaults to running elevated. */
    status?: AdminAccessStatus;
    /** What Allow answers. Anything but `applied` leaves the route as it was. */
    allow?: AdminAccessOutcome;
}

const ELEVATED: AdminAccessStatus = { elevated: true, route: "inProcess", canPrompt: false, gameRunsAsAdmin: false };
const APPLIED: AdminAccessOutcome = { status: "applied" };

const FIREWALL_WRITES = ["block_server_groups", "unblock_server_groups", "import_external_blocks"];
const FRAME_CAPTURE = ["start_frame_capture", "frame_capture_status", "stop_frame_capture"];
const NETWORK_MONITOR = ["start_network_monitor", "network_snapshot", "network_poll"];

const NO_FRAMES: FrameStats = {
    frameCount: 0,
    durationMs: 0,
    backgroundMs: 0,
    avgMs: 0,
    medianMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    p999Ms: 0,
    maxMs: 0,
    low1pctFps: 0,
    low01pctFps: 0,
    spikes: [],
};

const refuse = (code: string): never => {
    throw { code, params: {} };
};

/**
 * The admin-access commands, refusing the way the backend does: while elevated, and while a match runs. Until
 * access is allowed, the privileged commands of the modules listed before it fail as the app's do without it.
 */
export function adminAccessModule({ status = ELEVATED, allow = APPLIED }: AdminAccessOptions = {}): Module {
    return {
        name: "admin-access",
        overrides: [...FIREWALL_WRITES, ...FRAME_CAPTURE, ...NETWORK_MONITOR],
        create(_, replaced) {
            let state = status;
            const needsPermission = () => !state.elevated && state.route === "needsPermission";

            let captureFailed = false;
            let monitorStarted = false;
            let monitorNeedsPermission = false;
            const monitored = (snapshot: NetworkSnapshot): NetworkSnapshot =>
                monitorNeedsPermission ? { ...snapshot, needsPermission: true, relay: null } : snapshot;

            const guarded: Handlers = {
                ...Object.fromEntries(
                    FIREWALL_WRITES.map((command) => [
                        command,
                        (args) => {
                            if (needsPermission()) refuse("server_picker.needs_permission");
                            return replaced[command]!(args);
                        },
                    ]),
                ),
                // The capture itself starts either way; its trace fails afterwards, so only the status says so.
                start_frame_capture: (args) => {
                    captureFailed = needsPermission();
                    return captureFailed ? null : replaced.start_frame_capture!(args);
                },
                frame_capture_status: (args): CaptureStatus => {
                    const current = replaced.frame_capture_status!(args) as CaptureStatus;
                    if (!captureFailed) return current;
                    return { ...current, state: "failed", error: "diagnostics.frame_trace_needs_admin" };
                },
                stop_frame_capture: (args) => {
                    if (!captureFailed) return replaced.stop_frame_capture!(args);
                    captureFailed = false;
                    return NO_FRAMES;
                },
                // A running monitor only starts its trace again when the user asked, as the app's does.
                start_network_monitor: (args) => {
                    if (!monitorStarted || (monitorNeedsPermission && args.allowPrompt === true)) {
                        monitorNeedsPermission = needsPermission();
                    }
                    monitorStarted = true;
                    return replaced.start_network_monitor!(args);
                },
                network_snapshot: (args) => monitored(replaced.network_snapshot!(args) as NetworkSnapshot),
                network_poll: (args) => {
                    const poll = replaced.network_poll!(args) as { snapshot: NetworkSnapshot };
                    return { ...poll, snapshot: monitored(poll.snapshot) };
                },
            };

            return {
                handlers: {
                    ...Object.fromEntries(Object.entries(guarded).filter(([command]) => command in replaced)),
                    admin_access_status: () => state,
                    allow_admin_access: ({ always }) => {
                        if (state.elevated) refuse("admin_access.already_elevated");
                        if (!state.canPrompt) refuse("admin_access.in_match");
                        if (allow.status === "applied")
                            state = { ...state, route: always === true ? "service" : "helper" };
                        return allow;
                    },
                    remove_admin_access: () => {
                        if (state.elevated) refuse("admin_access.already_elevated");
                        state = { ...state, route: "needsPermission" };
                        return null;
                    },
                },
            };
        },
    };
}
