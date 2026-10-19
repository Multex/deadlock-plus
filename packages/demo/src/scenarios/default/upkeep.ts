import type { AddonScan } from "@deadlock-plus/ipc-types/AddonScan";
import type { AddonScanReport } from "@deadlock-plus/ipc-types/AddonScanReport";
import type { CaptureStatus } from "@deadlock-plus/ipc-types/CaptureStatus";
import type { CleanupMatch } from "@deadlock-plus/ipc-types/CleanupMatch";
import type { CleanupRule } from "@deadlock-plus/ipc-types/CleanupRule";
import type { ClearReport } from "@deadlock-plus/ipc-types/ClearReport";
import type { DeletePreview } from "@deadlock-plus/ipc-types/DeletePreview";
import type { DeleteReport } from "@deadlock-plus/ipc-types/DeleteReport";
import type { Demo } from "@deadlock-plus/ipc-types/Demo";
import type { DemoListing } from "@deadlock-plus/ipc-types/DemoListing";
import type { DemoStatus } from "@deadlock-plus/ipc-types/DemoStatus";
import type { EntryId } from "@deadlock-plus/ipc-types/EntryId";
import type { EntryInfo } from "@deadlock-plus/ipc-types/EntryInfo";
import type { EntryStats } from "@deadlock-plus/ipc-types/EntryStats";
import type { Finding } from "@deadlock-plus/ipc-types/Finding";
import type { FrameSpike } from "@deadlock-plus/ipc-types/FrameSpike";
import type { FrameStats } from "@deadlock-plus/ipc-types/FrameStats";
import type { LayerStatus } from "@deadlock-plus/ipc-types/LayerStatus";
import type { MatchSummary } from "@deadlock-plus/ipc-types/MatchSummary";
import type { MetaResult } from "@deadlock-plus/ipc-types/MetaResult";
import type { PlayerSummary } from "@deadlock-plus/ipc-types/PlayerSummary";
import type { VoiceBanFile } from "@deadlock-plus/ipc-types/VoiceBanFile";

import type { Handlers } from "../../backend";
import { seeded } from "../../random";
import type { Identity, Module } from "../../scenario";
import { MATCH_IDS, fakeAccountId, fakeName } from "./identity";
import { historyRows, type HistoryRow } from "./progress";

/** A saved frame-time run, in the shape the frontend keeps in the `frame-runs` store. */
interface SavedRun {
    id: string;
    label: string;
    savedAt: number;
    addons: string[];
    stats: FrameStats;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const MB = 1024 * 1024;

const STEAM = "C:\\Program Files (x86)\\Steam";
const CITADEL = `${STEAM}\\steamapps\\common\\Deadlock\\game\\citadel`;
const REPLAYS_DIR = `${CITADEL}\\addons\\replays`;
const APP_DATA = "C:\\Users\\Player\\AppData\\Roaming\\app.deadlockplus";
const APP_LOGS = "C:\\Users\\Player\\AppData\\Local\\app.deadlockplus\\logs";

const STEAM64_OFFSET = 76561197960265728n;
const MUTED_COUNT = 14;

const steam64 = (accountId: number) => (BigInt(accountId) + STEAM64_OFFSET).toString();

function voiceBanText(accountIds: number[]): string {
    const users = accountIds.map((id) => `\t\t{\n\t\t\tflags = 3\n\t\t\tsteamid = ${steam64(id)}\n\t\t},`);
    return [
        "<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:generic:version{7412167c-06e9-4698-aff2-e63eb59037e7} -->",
        "{",
        "\tusers =",
        "\t[",
        ...users,
        "\t]",
        "}",
        "",
    ].join("\n");
}

function playersByName(identity: Identity, url: URL) {
    const query = (url.searchParams.get("search_query") ?? "").toLowerCase();
    const limit = Number(url.searchParams.get("limit") ?? 8);
    return identity.names
        .map((_, index) => ({
            account_id: fakeAccountId(identity, index),
            personaname: fakeName(identity, index),
            avatarmedium: null,
            profileurl: null,
        }))
        .filter((p) => p.personaname.toLowerCase().includes(query))
        .slice(0, limit);
}

const REFERENCE_BUILD = 11032;
const OLDER_BUILD = 10987;
const HERO_IDS = [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 19, 20, 25, 27, 31, 35, 50, 52];

interface Replay {
    matchIndex: number;
    status: DemoStatus;
}

const REPLAYS: Replay[] = [
    { matchIndex: 0, status: "partial" },
    { matchIndex: 1, status: "complete" },
    { matchIndex: 2, status: "complete" },
    { matchIndex: 4, status: "complete" },
    { matchIndex: 7, status: "complete" },
    { matchIndex: 9, status: "complete" },
    { matchIndex: 13, status: "complete" },
    { matchIndex: 18, status: "complete" },
    { matchIndex: 22, status: "outdated" },
    { matchIndex: 27, status: "outdated" },
    { matchIndex: 33, status: "outdated" },
    { matchIndex: 41, status: "outdated" },
];
const PINNED_INDEXES = [2, 9, 27];

/** The player's own line comes from the shared match list, so Replays, Match History and Stats agree. */
function matchSummary(replay: Replay, rows: readonly HistoryRow[], identity: Identity): MatchSummary {
    const matchId = MATCH_IDS[replay.matchIndex]!;
    const own = rows.find((row) => row.match_id === matchId)!;
    const next = seeded(matchId);
    const others = HERO_IDS.filter((heroId) => heroId !== own.hero_id);
    const firstHero = Math.floor(next() * others.length);
    const players: PlayerSummary[] = Array.from({ length: 12 }, (_, slot) =>
        slot === 0
            ? {
                  accountId: identity.accountId,
                  heroId: own.hero_id,
                  team: own.player_team,
                  kills: own.player_kills,
                  deaths: own.player_deaths,
                  assists: own.player_assists,
              }
            : {
                  accountId: fakeAccountId(identity, (replay.matchIndex * 5 + slot) % identity.names.length),
                  heroId: others[(firstHero + slot) % others.length]!,
                  team: (own.player_team + slot) % 2,
                  kills: Math.floor(2 + next() * 13),
                  deaths: Math.floor(1 + next() * 9),
                  assists: Math.floor(3 + next() * 16),
              },
    );
    return {
        matchId,
        startTime: own.start_time,
        durationS: own.match_duration_s,
        winningTeam: own.match_result,
        players,
    };
}

function replayFile(replay: Replay, summary: MatchSummary): Demo {
    const partial = replay.status === "partial";
    const bytesPerSecond = 165_000 + seeded(summary.matchId + 1)() * 25_000;
    return {
        matchId: summary.matchId,
        fileName: `${summary.matchId}.dem${partial ? ".partial" : ""}`,
        size: Math.round(bytesPerSecond * summary.durationS * (partial ? 0.2 : 1)),
        modifiedMs: (summary.startTime + summary.durationS) * 1000 + 40_000,
        status: replay.status,
        buildNum: partial ? null : replay.status === "outdated" ? OLDER_BUILD : REFERENCE_BUILD,
    };
}

function ruleMatches(rule: CleanupRule, demo: Demo, now: number): boolean {
    switch (rule.kind) {
        case "olderThanDays":
            return demo.modifiedMs < now - rule.days * DAY_MS;
        case "largerThanMb":
            return demo.size > rule.mb * MB;
        case "outdated":
            return demo.status === "outdated";
        case "partial":
            return demo.status === "partial";
    }
}

interface StorageRow {
    id: EntryId;
    path: string;
    clearable?: boolean;
    bytes: number;
    count?: number;
    oldestDays?: number;
}

const storageRows = (remote: string): StorageRow[] => [
    { id: "replays", path: REPLAYS_DIR, bytes: 0, count: 0, oldestDays: 20 },
    { id: "addons", path: `${CITADEL}\\addons`, bytes: 412 * MB },
    { id: "addons-backups", path: `${CITADEL}\\addons-backups`, bytes: 96 * MB, count: 3, oldestDays: 41 },
    { id: "config-backups", path: CITADEL, bytes: 184_000, count: 2, oldestDays: 33 },
    { id: "gameinfo-backups", path: CITADEL, bytes: 21_500, count: 2, oldestDays: 33 },
    { id: "hero-presence-cache", path: `${CITADEL}\\hero_presence_cache.json`, bytes: 38_200 },
    { id: "shader-cache", path: `${CITADEL}\\shadercache`, clearable: true, bytes: 688 * MB },
    { id: "console-log", path: `${CITADEL}\\console.log`, clearable: true, bytes: 3.4 * MB },
    { id: "voice-ban-backups", path: remote, clearable: true, bytes: 9_800, count: 5, oldestDays: 26 },
    { id: "frame-runs", path: `${APP_DATA}\\frame-runs.json`, bytes: 14_300 },
    { id: "settings", path: APP_DATA, bytes: 6_100 },
    { id: "server-presets", path: `${APP_DATA}\\presets.json`, bytes: 1_900 },
    { id: "replay-rules", path: APP_DATA, bytes: 640 },
    { id: "connection-history", path: `${APP_DATA}\\connection-history.jsonl`, bytes: 412_000 },
    { id: "notifications", path: APP_DATA, bytes: 23_400 },
    { id: "patch-notes-index", path: `${APP_DATA}\\patch-notes-index.json`, bytes: 1.8 * MB },
    { id: "stats-cache", path: `${APP_DATA}\\stats-cache.json`, bytes: 356_000 },
    { id: "server-list-cache", path: `${APP_DATA}\\server-picker-cache.json`, bytes: 47_000 },
    { id: "replay-info-cache", path: `${APP_DATA}\\demo-metadata.json`, bytes: 18_700 },
    { id: "match-cache", path: `${APP_DATA}\\matches`, clearable: true, bytes: 61 * MB, count: 58, oldestDays: 44 },
    {
        id: "postgame-detail",
        path: `${APP_DATA}\\postgame`,
        clearable: true,
        bytes: 7.6 * MB,
        count: 46,
        oldestDays: 38,
    },
    { id: "match-ping", path: `${APP_DATA}\\match-ping`, clearable: true, bytes: 2.3 * MB, count: 46, oldestDays: 38 },
    { id: "mvp-grades", path: `${APP_DATA}\\mvp`, clearable: true, bytes: 412_000, count: 46, oldestDays: 38 },
    { id: "shared-matches", path: `${APP_DATA}\\shared-matches.json`, clearable: true, bytes: 96_000 },
    { id: "other-app-files", path: APP_DATA, bytes: 88_000 },
    { id: "logs", path: APP_LOGS, clearable: true, bytes: 5.2 * MB, count: 9, oldestDays: 12 },
];

const SPIKE_MEDIAN_FACTOR = 2.5;
const SPIKE_FLOOR_MS = 33;

function frametimes(seed: number, avgMs: number, jitter: number, framesPerHitch: number, durationMs: number) {
    const next = seeded(seed);
    const slowRate = jitter / 20;
    const baseMs = avgMs / (1 + jitter / 4 + slowRate * 0.8);
    const frames: FrameSpike[] = [];
    let atMs = 0;
    while (atMs < durationMs) {
        const hitch = next() < 1 / framesPerHitch;
        const slow = next() < slowRate ? 1.4 + next() * 0.8 : 1;
        const frametimeMs = hitch
            ? 36 + next() * 48
            : baseMs * slow * (1 - jitter / 2 + jitter * next() + jitter * next() * next());
        frames.push({ atMs, frametimeMs });
        atMs += frametimeMs;
    }
    return { frames, durationMs: atMs };
}

function frameStats(seed: number, avgMs: number, jitter: number, framesPerHitch: number, minutes: number): FrameStats {
    const { frames, durationMs } = frametimes(seed, avgMs, jitter, framesPerHitch, minutes * MINUTE_MS);
    const sorted = frames.map((frame) => frame.frametimeMs).sort((a, b) => a - b);
    const count = sorted.length;
    const percentile = (p: number) => sorted[Math.min(count, Math.max(1, Math.ceil(p * count))) - 1]!;
    const medianMs = percentile(0.5);
    const threshold = Math.max(medianMs * SPIKE_MEDIAN_FACTOR, SPIKE_FLOOR_MS);
    return {
        frameCount: count,
        durationMs,
        backgroundMs: 0,
        avgMs: durationMs / count,
        medianMs,
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        p999Ms: percentile(0.999),
        maxMs: sorted[count - 1]!,
        low1pctFps: 1000 / percentile(0.99),
        low01pctFps: 1000 / percentile(0.999),
        spikes: frames.filter((frame) => frame.frametimeMs > threshold),
    };
}

interface Addon {
    fileName: string;
    label: string;
    enabled: boolean;
    scripts: number;
    findings?: { path: string; findings: Finding[] }[];
}

const ADDONS: Addon[] = [
    {
        fileName: "pak01_dir.vpk",
        label: "Brass Killfeed",
        enabled: true,
        scripts: 4,
        findings: [
            {
                path: "panorama/scripts/hud/brass_killfeed.js",
                findings: [
                    {
                        rule: "unguardedRearm",
                        severity: "high",
                        function: "RefreshFeed",
                        line: 42,
                        snippet: "function RefreshFeed() {",
                    },
                    {
                        rule: "nulledNotCancelled",
                        severity: "medium",
                        function: "HideFeed",
                        line: 118,
                        snippet: "    fadeTimer = null;",
                    },
                ],
            },
        ],
    },
    {
        fileName: "pak02_dir.vpk",
        label: "Soul Timer Overlay",
        enabled: true,
        scripts: 2,
        findings: [
            {
                path: "panorama/scripts/hud/soul_timer.js",
                findings: [
                    {
                        rule: "nulledNotCancelled",
                        severity: "high",
                        function: "OnRoundStart",
                        line: 67,
                        snippet: "    tickHandle = null;",
                    },
                ],
            },
        ],
    },
    { fileName: "pak03_dir.vpk", label: "Lantern Minimap", enabled: true, scripts: 6 },
    { fileName: "pak04_dir.vpk", label: "Compact Shop", enabled: true, scripts: 3 },
    { fileName: "pak05_dir.vpk", label: "Copper Damage Numbers", enabled: false, scripts: 1 },
    { fileName: "pak06_dir.vpk", label: "Night Ferry Skybox", enabled: true, scripts: 0 },
    { fileName: "pak07_dir.vpk", label: "Thistle Crosshairs", enabled: true, scripts: 0 },
    { fileName: "pak08_dir.vpk", label: "Quiet Lobby Music", enabled: true, scripts: 0 },
];

const ENABLED_ADDONS = ADDONS.filter((addon) => addon.enabled)
    .map((addon) => addon.label)
    .sort();

const ADDON_REPORT: AddonScanReport = {
    listing: {
        dir: `${CITADEL}\\addons`,
        addons: ADDONS.map(({ fileName, enabled }) => ({ fileName, modId: null, enabled })),
    },
    scans: ADDONS.map(({ fileName, label, scripts, findings }): AddonScan => ({
        fileName,
        label,
        scriptsScanned: scripts,
        scripts: findings ?? [],
    })),
    failures: [],
};

const savedRuns = (now: number, afterShaderCache: FrameStats): SavedRun[] => [
    {
        id: "demo-run-after-shader-cache",
        label: "After shader cache",
        savedAt: now - 2 * DAY_MS - 95 * MINUTE_MS,
        addons: ENABLED_ADDONS,
        stats: afterShaderCache,
    },
    {
        id: "demo-run-before-shader-cache",
        label: "Before shader cache",
        savedAt: now - 2 * DAY_MS - 140 * MINUTE_MS,
        addons: ENABLED_ADDONS,
        stats: frameStats(7101, 1000 / 111, 0.62, 800, 6),
    },
    {
        id: "demo-run-all-addons",
        label: "All addons on",
        savedAt: now - 6 * DAY_MS - 30 * MINUTE_MS,
        addons: ADDONS.map((addon) => addon.label).sort(),
        stats: frameStats(7100, 1000 / 124, 0.48, 2200, 4),
    },
];

const POLL_MS = 500;
const LIVE_WINDOW = 300;

const FRAME_LAYER: LayerStatus = {
    supported: false,
    installed: false,
    libraryAvailable: false,
    launchOption: "",
    manifestPath: null,
};

export const upkeepModule: Module = {
    name: "upkeep",
    create(context) {
        const { identity, now } = context;
        const nowSecs = Math.floor(now / 1000);
        const remote = `${STEAM}\\userdata\\${identity.accountId}\\1422450\\remote`;
        const rows = historyRows(context);

        let voiceBan = voiceBanText(Array.from({ length: MUTED_COUNT }, (_, i) => fakeAccountId(identity, i)));
        let voiceBanBackups = 0;

        const summaries = new Map(
            REPLAYS.map((replay) => [MATCH_IDS[replay.matchIndex]!, matchSummary(replay, rows, identity)]),
        );
        let replays = REPLAYS.map((replay) => replayFile(replay, summaries.get(MATCH_IDS[replay.matchIndex]!)!));
        let pinned = PINNED_INDEXES.map((index) => MATCH_IDS[index]!);
        let cleanupRules: CleanupRule[] = [
            { id: 1, enabled: true, kind: "olderThanDays", days: 14 },
            { id: 4, enabled: true, kind: "partial" },
        ];

        const cleanupMatches = (): CleanupMatch[] => {
            const active = cleanupRules.filter((rule) => rule.enabled);
            return replays
                .filter((demo) => !pinned.includes(demo.matchId))
                .map((demo) => ({
                    fileName: demo.fileName,
                    matchId: demo.matchId,
                    size: demo.size,
                    ruleIds: active.filter((rule) => ruleMatches(rule, demo, now)).map((rule) => rule.id),
                }))
                .filter((match) => match.ruleIds.length > 0);
        };
        const replayBytes = (names: string[]) =>
            replays.filter((demo) => names.includes(demo.fileName)).reduce((sum, demo) => sum + demo.size, 0);

        const storage = storageRows(remote);
        const cleared = new Set<EntryId>();
        const storageStats = (id: EntryId): EntryStats => {
            const row = storage.find((entry) => entry.id === id)!;
            if (cleared.has(id)) return { bytes: 0, count: row.count === undefined ? null : 0, oldestSecs: null };
            const live = id === "replays";
            return {
                bytes: live ? replays.reduce((sum, demo) => sum + demo.size, 0) : Math.round(row.bytes),
                count: live ? replays.length : (row.count ?? null),
                oldestSecs: row.oldestDays === undefined ? null : nowSecs - row.oldestDays * 86_400,
            };
        };

        const afterShaderCache = frameStats(7102, 1000 / 141, 0.3, 9000, 6);
        const liveFrames = frametimes(7103, 1000 / 141, 0.3, 400, 20_000).frames.map((frame) => frame.frametimeMs);
        let capturePolls: number | null = null;
        const captureStatus = (): CaptureStatus => {
            const idle = capturePolls === null;
            const elapsedMs = (capturePolls ?? 0) * POLL_MS;
            if (capturePolls !== null) capturePolls += 1;
            const frames = Math.round((elapsedMs / 1000) * 141);
            const end = LIVE_WINDOW + (frames % (liveFrames.length - LIVE_WINDOW));
            return {
                state: idle ? "idle" : "capturing",
                error: null,
                frames,
                elapsedMs,
                otherProcessEvents: 0,
                truncated: false,
                gameFocused: true,
                recentFrametimesMs: frames > 0 ? liveFrames.slice(end - LIVE_WINDOW, end) : [],
            };
        };

        const handlers: Handlers = {
            read_voice_ban: (): VoiceBanFile => ({
                path: `${remote}\\voice_ban.dt`,
                exists: true,
                text: voiceBan,
                gameRunning: false,
            }),
            write_voice_ban: ({ text }) => {
                voiceBan = String(text);
                voiceBanBackups += 1;
                return `${remote}\\voice_ban.dt.backup-${nowSecs + voiceBanBackups}`;
            },

            local_steam_account_ids: () => [identity.accountId],
            list_demos: (): DemoListing => ({ dir: REPLAYS_DIR, referenceBuild: REFERENCE_BUILD, demos: replays }),
            demo_metadata: ({ matchId }): MetaResult => {
                const summary = summaries.get(Number(matchId));
                return summary ? { state: "ok", summary } : { state: "missing" };
            },
            list_pinned: () => pinned,
            set_pinned: ({ matchId, pinned: on }) => {
                const id = Number(matchId);
                pinned = on ? [...new Set([...pinned, id])] : pinned.filter((other) => other !== id);
                return pinned;
            },
            delete_preview: ({ fileNames }): DeletePreview => {
                const names = fileNames as string[];
                return {
                    count: names.length,
                    totalBytes: replayBytes(names),
                    recycle: "available",
                    binFreeBytes: null,
                };
            },
            delete_demos: ({ fileNames }): DeleteReport => {
                const names = fileNames as string[];
                const deleted = replays.filter((demo) => names.includes(demo.fileName)).map((demo) => demo.fileName);
                replays = replays.filter((demo) => !deleted.includes(demo.fileName));
                return { deleted, failed: [] };
            },
            reveal_demo: () => null,
            open_replays_dir: () => null,
            list_cleanup_rules: () => cleanupRules,
            save_cleanup_rules: ({ rules }) => {
                cleanupRules = rules as CleanupRule[];
                return null;
            },
            cleanup_matches: cleanupMatches,

            storage_entries: (): EntryInfo[] =>
                storage.map(({ id, path, clearable }) => ({ id, path, clearable: clearable === true })),
            storage_entry_stats: ({ id }) => storageStats(id as EntryId),
            storage_clear: ({ id }): ClearReport => {
                const entry = id as EntryId;
                const before = storageStats(entry);
                cleared.add(entry);
                return { freedBytes: before.bytes, removed: before.count ?? (before.bytes > 0 ? 1 : 0), failed: [] };
            },
            storage_reveal: () => null,

            frame_capture_status: captureStatus,
            start_frame_capture: () => {
                capturePolls = 0;
                return null;
            },
            stop_frame_capture: (): FrameStats => {
                capturePolls = null;
                return afterShaderCache;
            },
            frame_layer_status: () => FRAME_LAYER,
            install_frame_layer: () => FRAME_LAYER,
            uninstall_frame_layer: () => FRAME_LAYER,
            start_addon_scan: () => null,
            addon_scan_report: () => ADDON_REPORT,
        };

        return {
            handlers,
            kv: { "frame-runs": { runs: savedRuns(now, afterShaderCache) } },
            routes: [[/^\/v1\/players\/steam-search$/, (url) => playersByName(identity, url)]],
        };
    },
};
