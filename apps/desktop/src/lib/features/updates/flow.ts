import { REPO_URL, SITE_URL } from "@deadlock-plus/links";
import { compareVersions, parseChangelog, type ChangelogEntry } from "./changelog";
import { UPDATE_CHANNELS, type UpdateChannel } from "./channel";

export { UPDATE_CHANNELS, type UpdateChannel };

export type UpdateStage = "idle" | "checking" | "upToDate" | "available" | "downloading" | "ready" | "failed";
export type FailureStep = "check" | "download" | "install";
export type IndicatorKind = "available" | "downloading" | "ready" | "failed";

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
    /** Bytes per second over the last few seconds; null until there is enough to measure. */
    readonly speed?: number | null;
    /** Why the last check failed, already worded for the user. */
    readonly checkError?: { readonly message: string } | null;
}

export interface ByteProgress {
    fraction: number | null;
    received: number | null;
    total: number | null;
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
    if (s.error === "install") return "install";
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
            return failureStep(s) === "check" ? null : "failed";
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

export function timeLeft(seconds: number): { unit: "seconds" | "minutes"; count: number } {
    return seconds < 60 ? { unit: "seconds", count: seconds } : { unit: "minutes", count: Math.ceil(seconds / 60) };
}

export interface RecentRelease {
    version: string;
    date: string | null;
    headlines: string[];
    installed: boolean;
}

/** Feature headings are short; a release without them is named by its first line alone, which can run long. */
const RELEASE_HEADLINES = 2;

export function recentReleases(history: ChangelogEntry[], current: string, limit: number): RecentRelease[] {
    return [...history]
        .sort((a, b) => compareVersions(b.version, a.version))
        .slice(0, limit)
        .map((entry) => {
            const groups = entry.sections.flatMap((section) => (section.groups ?? []).map((group) => group.title));
            const lines =
                groups.length > 0
                    ? groups.slice(0, RELEASE_HEADLINES)
                    : entry.sections.flatMap((section) => section.items).slice(0, 1);
            return {
                version: entry.version,
                date: entry.date,
                headlines: lines,
                installed: compareVersions(entry.version, current) === 0,
            };
        });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CADENCE_RELEASES = 6;

/** The median days between the last few dated releases; one long gap (a holiday) does not skew it. */
export function releaseCadenceDays(history: ChangelogEntry[]): number | null {
    const dates = [...history]
        .sort((a, b) => compareVersions(b.version, a.version))
        .map((entry) => (entry.date ? Date.parse(entry.date) : Number.NaN))
        .filter((at) => !Number.isNaN(at))
        .slice(0, CADENCE_RELEASES);
    if (dates.length < 3) return null;
    const gaps = dates
        .slice(1)
        .map((at, i) => (dates[i] - at) / DAY_MS)
        .sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
    return Math.max(1, Math.round(median));
}
