import type { OverlayPosition } from "@deadlock-plus/ipc-types/OverlayPosition";
import type { OverlaySettings } from "@deadlock-plus/ipc-types/OverlaySettings";
import type { OverlayStatus } from "@deadlock-plus/ipc-types/OverlayStatus";

export type { OverlayPosition, OverlaySettings, OverlayStatus };

export const DEFAULT_OVERLAY: OverlaySettings = {
    enabled: true,
    position: "topRight",
    durationSecs: 6,
    matchFound: true,
    queueStopped: true,
};

export const OVERLAY_POSITIONS: readonly OverlayPosition[] = [
    "topLeft",
    "topCenter",
    "topRight",
    "left",
    "right",
    "bottomLeft",
    "bottomCenter",
    "bottomRight",
];

export const DURATION_RANGE = { min: 3, max: 15, step: 1 };

export const NO_GAME: OverlayStatus = { gameOpen: false, exclusiveFullscreen: false };

function isPosition(value: unknown): value is OverlayPosition {
    return OVERLAY_POSITIONS.includes(value as OverlayPosition);
}

function duration(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_OVERLAY.durationSecs;
    return Math.min(DURATION_RANGE.max, Math.max(DURATION_RANGE.min, Math.round(value)));
}

export function resolveOverlay(stored: unknown): OverlaySettings {
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return { ...DEFAULT_OVERLAY };
    const { enabled, position, durationSecs, matchFound, queueStopped } = stored as Record<string, unknown>;
    return {
        enabled: typeof enabled === "boolean" ? enabled : DEFAULT_OVERLAY.enabled,
        position: isPosition(position) ? position : DEFAULT_OVERLAY.position,
        durationSecs: duration(durationSecs),
        matchFound: typeof matchFound === "boolean" ? matchFound : DEFAULT_OVERLAY.matchFound,
        queueStopped: typeof queueStopped === "boolean" ? queueStopped : DEFAULT_OVERLAY.queueStopped,
    };
}
