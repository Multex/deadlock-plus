import { command } from "$lib/core/tauri";

import type { AddonInfo } from "@deadlock-plus/ipc-types/AddonInfo";
import type { AddonListing } from "@deadlock-plus/ipc-types/AddonListing";
import type { AddonScan } from "@deadlock-plus/ipc-types/AddonScan";
import type { AddonScanReport } from "@deadlock-plus/ipc-types/AddonScanReport";
import type { CaptureState } from "@deadlock-plus/ipc-types/CaptureState";
import type { CaptureStatus } from "@deadlock-plus/ipc-types/CaptureStatus";
import type { Finding } from "@deadlock-plus/ipc-types/Finding";
import type { FrameSpike } from "@deadlock-plus/ipc-types/FrameSpike";
import type { FrameStats } from "@deadlock-plus/ipc-types/FrameStats";
import type { LayerStatus } from "@deadlock-plus/ipc-types/LayerStatus";
import type { Rule } from "@deadlock-plus/ipc-types/Rule";
import type { ScriptReport } from "@deadlock-plus/ipc-types/ScriptReport";
import type { Severity } from "@deadlock-plus/ipc-types/Severity";

export type {
    AddonInfo,
    AddonListing,
    AddonScan,
    AddonScanReport,
    CaptureState,
    CaptureStatus,
    Finding,
    FrameSpike,
    FrameStats,
    LayerStatus,
    Rule,
    ScriptReport,
    Severity,
};

/** `force` runs the scan even while Deadlock is running, ignoring the pause and slowdown. */
export function startAddonScan(force: boolean) {
    return command<void>("start_addon_scan", { force });
}

export function addonScanReport() {
    return command<AddonScanReport>("addon_scan_report");
}

export function startFrameCapture() {
    return command<void>("start_frame_capture");
}

export function frameCaptureStatus() {
    return command<CaptureStatus>("frame_capture_status");
}

export function stopFrameCapture() {
    return command<FrameStats>("stop_frame_capture");
}

export function frameLayerStatus() {
    return command<LayerStatus>("frame_layer_status");
}

export function installFrameLayer() {
    return command<LayerStatus>("install_frame_layer");
}

export function uninstallFrameLayer() {
    return command<LayerStatus>("uninstall_frame_layer");
}
