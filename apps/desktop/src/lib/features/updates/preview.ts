import { UPDATE_CHANNELS, type UpdateChannel, type UpdateSource } from "./flow";

export type UpdateLayout = "page" | "dialog" | "popover";
export type PreviewState = "available" | "downloading" | "ready" | "failed" | "check-failed" | "up-to-date";

export const UPDATE_LAYOUTS: readonly UpdateLayout[] = ["page", "dialog", "popover"];
export const DEFAULT_LAYOUT: UpdateLayout = "page";
export const PREVIEW_STATES: readonly PreviewState[] = [
    "available",
    "downloading",
    "ready",
    "failed",
    "check-failed",
    "up-to-date",
];

/** Demo builds only: picks the update surface's layout and pins the updater to one state for screenshots. */
export interface UpdatePreview {
    layout: UpdateLayout;
    state: PreviewState | null;
    channel: UpdateChannel | null;
}

function oneOf<T extends string>(value: string | null, options: readonly T[]): T | null {
    return value !== null && (options as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseUpdatePreview(search: string): UpdatePreview {
    const query = new URLSearchParams(search);
    return {
        layout: oneOf(query.get("update-layout"), UPDATE_LAYOUTS) ?? DEFAULT_LAYOUT,
        state: oneOf(query.get("update-state"), PREVIEW_STATES),
        channel: oneOf(query.get("update-channel"), UPDATE_CHANNELS),
    };
}

function nextMinor(version: string): string {
    const [major, minor] = version.split(".").map((part) => Number.parseInt(part, 10));
    return `${major}.${(minor || 0) + 1}.0`;
}

const SAMPLE_NOTES = [
    "### Added",
    "",
    '- A "Queue stopped" alert in the game overlay tells you when your queue ends without a match.',
    "- A Delay setting holds back what Discord presence shows by up to two minutes.",
    "- Discord presence can show the Deadlock+ logo.",
    "",
    "#### Deadlock+ Dispatch",
    "",
    "- A new Dispatch page prints your Deadlock week and month as a newspaper.",
    "- A Weekly Edition comes out every Monday and covers the week before.",
    "- A Monthly Edition comes out on the 1st and covers the month before.",
    "",
    "#### Match front page",
    "",
    "- When Deadlock+ captures a match, its front page lands on the window by itself.",
    "- A front page carries a box score, lane report and objectives timeline.",
    "",
    "### Fixed",
    "",
    "- Deadlock+ starts again after an update instead of closing.",
    "- The tray icon no longer stays behind after a quit.",
].join("\n");

/** A steady 3.4 MB/s, so the preview shows a speed and time left. */
export const PREVIEW_RATE = 3_565_158;

const SAMPLE_TOTAL = 40_507_392;
const SAMPLE_RECEIVED = 25_165_824;

export function previewSource(state: PreviewState, currentVersion: string): UpdateSource {
    const version = nextMinor(currentVersion);
    const update = { version, notes: SAMPLE_NOTES };
    switch (state) {
        case "available":
            return { ...update, phase: "available", progress: null, error: null };
        case "downloading":
            return {
                ...update,
                phase: "downloading",
                progress: SAMPLE_RECEIVED / SAMPLE_TOTAL,
                error: null,
                received: SAMPLE_RECEIVED,
                total: SAMPLE_TOTAL,
            };
        case "ready":
            return {
                ...update,
                phase: "ready",
                progress: 1,
                error: null,
                received: SAMPLE_TOTAL,
                total: SAMPLE_TOTAL,
            };
        case "failed":
            return { ...update, phase: "error", progress: null, error: "download" };
        case "check-failed":
            return { phase: "error", version: null, progress: null, error: "check" };
        case "up-to-date":
            return { phase: "upToDate", version: null, progress: null, error: null };
    }
}
