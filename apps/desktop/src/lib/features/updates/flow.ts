import { REPO_URL, SITE_URL } from "@deadlock-plus/links";
import { parseChangelog } from "./changelog";

export type UpdateChannel = "release" | "beta" | "nightly";
export type UpdateStage = "idle" | "checking" | "upToDate" | "available" | "downloading" | "ready" | "failed";
export type FailureStep = "check" | "download";
export type IndicatorKind = "available" | "downloading" | "ready" | "failed";

/** Steadiest first: the order the channel picker lists them in. */
export const UPDATE_CHANNELS: readonly UpdateChannel[] = ["release", "beta", "nightly"];

/**
 * What the update surfaces read from the updater store. The optional fields are ones the store may not report;
 * every surface still works from the required ones alone.
 */
export interface UpdateSource {
    readonly phase: string;
    readonly version: string | null;
    readonly progress: number | null;
    readonly error: string | null;
    /** The release notes of `version`, as the Markdown body of its changelog section. */
    readonly notes?: string | null;
    readonly received?: number | null;
    readonly total?: number | null;
}

export interface ByteProgress {
    fraction: number | null;
    received: number | null;
    total: number | null;
}

export interface RateSample {
    at: number;
    bytes: number;
}

export interface Headline {
    title: string;
    lead: string | null;
}

export interface ReleaseHighlights {
    headlines: Headline[];
    total: number;
}

const STAGES: Record<string, UpdateStage> = {
    idle: "idle",
    checking: "checking",
    upToDate: "upToDate",
    available: "available",
    downloading: "downloading",
    ready: "ready",
    error: "failed",
};

export function updateStage(s: UpdateSource): UpdateStage {
    return Object.hasOwn(STAGES, s.phase) ? STAGES[s.phase] : "idle";
}

export function failureStep(s: UpdateSource): FailureStep | null {
    if (updateStage(s) !== "failed") return null;
    return s.error === "download" ? "download" : "check";
}

export function byteProgress(s: UpdateSource): ByteProgress {
    const received = s.received ?? null;
    const total = s.total ?? null;
    if (received === null) return { fraction: s.progress, received, total };
    const fraction = total !== null && total > 0 ? Math.min(received / total, 1) : null;
    return { fraction, received, total };
}

export function mebibytes(bytes: number): number {
    return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

const RATE_WINDOW_MS = 4000;
const MIN_RATE_SPAN_MS = 500;

/** Bytes per second over the last few seconds, so a stall shows soon and one fast chunk does not swing it. */
export function downloadRate(samples: RateSample[], now: number, windowMs = RATE_WINDOW_MS): number | null {
    const recent = samples.filter((sample) => now - sample.at <= windowMs);
    if (recent.length < 2) return null;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const span = last.at - first.at;
    if (span < MIN_RATE_SPAN_MS) return null;
    return ((last.bytes - first.bytes) / span) * 1000;
}

export function secondsLeft(received: number, total: number | null, rate: number | null): number | null {
    if (total === null || rate === null || rate <= 0) return null;
    return Math.ceil(Math.max(total - received, 0) / rate);
}

const MAX_HEADLINES = 3;

/**
 * A release's headline features are its `####` groups, each with its first line; a release without groups leads
 * with its first added lines instead.
 */
export function releaseHighlights(version: string, notes: string | null | undefined): ReleaseHighlights {
    if (!notes?.trim()) return { headlines: [], total: 0 };
    const [entry] = parseChangelog(`## [${version}]\n${notes}`);
    if (!entry) return { headlines: [], total: 0 };

    let total = 0;
    const groups: Headline[] = [];
    for (const section of entry.sections) {
        total += section.items.length;
        for (const group of section.groups ?? []) {
            total += group.items.length;
            groups.push({ title: group.title, lead: group.items[0] ?? null });
        }
    }
    if (groups.length > 0) return { headlines: groups.slice(0, MAX_HEADLINES), total };

    const added = entry.sections.find((section) => section.title.toLowerCase() === "added") ?? entry.sections[0];
    const headlines = (added?.items ?? []).slice(0, MAX_HEADLINES).map((title) => ({ title, lead: null }));
    return { headlines, total };
}

/** A failed background check is not the user's problem until they ask, so only a failed download shows. */
export function indicatorKind(s: UpdateSource): IndicatorKind | null {
    switch (updateStage(s)) {
        case "available":
            return "available";
        case "downloading":
            return "downloading";
        case "ready":
            return "ready";
        case "failed":
            return failureStep(s) === "download" ? "failed" : null;
        default:
            return null;
    }
}

/** Moving to a steadier channel never downgrades: the build stays until that channel has a newer one. */
export function keepsCurrentBuild(from: UpdateChannel, to: UpdateChannel): boolean {
    return UPDATE_CHANNELS.indexOf(to) < UPDATE_CHANNELS.indexOf(from);
}

export function manualDownloadUrl(channel: UpdateChannel): string {
    return channel === "release" ? `${SITE_URL}/download` : `${REPO_URL}/releases`;
}

/** Test channels publish under their own tags, so they get the release list instead of a guessed tag. */
export function releaseNotesUrl(channel: UpdateChannel, version: string): string {
    return channel === "release" ? `${REPO_URL}/releases/tag/v${version}` : `${REPO_URL}/releases`;
}

export type StepState = "todo" | "current" | "done";

export function timeLeft(seconds: number): { unit: "seconds" | "minutes"; count: number } {
    return seconds < 60 ? { unit: "seconds", count: seconds } : { unit: "minutes", count: Math.ceil(seconds / 60) };
}

/** The download, restart and release notes steps. A failed download is still the step the user is on. */
export function stepStates(stage: UpdateStage): StepState[] {
    switch (stage) {
        case "downloading":
        case "failed":
            return ["current", "todo", "todo"];
        case "ready":
            return ["done", "current", "todo"];
        default:
            return ["todo", "todo", "todo"];
    }
}
