import { untrack } from "svelte";
import type { AnalyticsFilter, DeadlockApi } from "@deadlock-plus/deadlock-api";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";
import { gradeMatch, type GradeTargets, type MatchGrades } from "@deadlock-plus/stats/grades";
import {
    groupFilter,
    groupLabel,
    nextGroup,
    startGroup,
    type ComparisonGroup,
    type GroupLabel,
} from "@deadlock-plus/stats/lobby-badge";
import { deadlockApi } from "$lib/core/deadlock-api";
import { live } from "./live.svelte";
import {
    apiGameMode,
    failureReason,
    gradeDisplay,
    gradesShown,
    groupSource,
    heroMatches,
    liveValues,
    toTargets,
    unrankedBadge,
    yourPlayer,
    type ApiGameMode,
    type GradeDisplay,
    type GroupSource,
    type NoTargetsReason,
} from "./grades";

export const RETRY_DELAYS_MS = [15_000, 30_000, 60_000] as const;
export const MAX_HERO_STATS_CALLS = 6;
const FIRST_GRADE_SECS = 60;

/** What the grade strip shows. Every state but `hidden` carries the values the tiles show. */
export type GradesView =
    | { kind: "hidden" }
    | { kind: "firstMinute"; heroId: number; display: GradeDisplay }
    | { kind: "loading"; heroId: number; display: GradeDisplay }
    | { kind: "noTargets"; reason: NoTargetsReason; heroId: number; display: GradeDisplay }
    | {
          kind: "graded";
          heroId: number;
          display: GradeDisplay;
          grades: MatchGrades;
          frozen: boolean;
          group: GroupLabel;
      };

export interface GradesDeps {
    live: { readonly state: LiveState | null; readonly match: LiveMatch | null };
    api: Pick<DeadlockApi, "performanceCurve" | "playerStatsMetrics" | "heroStats" | "playerRanks">;
    nowSecs: () => number;
    /** Calls `onChange` with `read()` now and each time it changes. Returns the stop. */
    watch?: (read: () => string | null, onChange: (key: string | null) => void) => () => void;
}

function watchWithEffect(read: () => string | null, onChange: (key: string | null) => void): () => void {
    return $effect.root(() => {
        $effect(() => {
            const key = read();
            untrack(() => onChange(key));
        });
    });
}

interface Job {
    key: string;
    heroId: number;
    gameMode: ApiGameMode;
    source: GroupSource;
}

type Fetched =
    | { kind: "loading" }
    | { kind: "failed"; reason: NoTargetsReason }
    | { kind: "ready"; targets: GradeTargets | null; group: GroupLabel };

const HIDDEN: GradesView = { kind: "hidden" };
const LOADING: Fetched = { kind: "loading" };

// The reader fills ranks and players in over the first seconds of pregame, so the key follows the
// group source too; the session cache keeps the repeat calls cheap.
function sourceKey(source: GroupSource): string {
    switch (source.kind) {
        case "streetBrawl":
            return "";
        case "ranked":
            return String(source.badge);
        case "unranked":
            return source.accountIds.join(",");
    }
}

function jobKey(state: LiveState | null, match: LiveMatch | null): string | null {
    const heroId = yourPlayer(match)?.heroId;
    if (!gradesShown(state, match) || match === null || !heroId) return null;
    return `${heroId}|${match.gameMode}|${match.matchMode}|${sourceKey(groupSource(match))}`;
}

const filterKey = (f: AnalyticsFilter) => `${f.gameMode}|${f.minAverageBadge ?? ""}|${f.maxAverageBadge ?? ""}`;

export class GradesStore {
    private fetched = $state.raw<{ key: string; status: Fetched } | null>(null);
    private readonly key = $derived.by(() => jobKey(this.deps.live.state, this.deps.live.match));
    private readonly cache = new Map<string, Promise<unknown>>();
    private token = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;

    readonly view: GradesView = $derived.by(() => this.compute());

    constructor(private readonly deps: GradesDeps) {}

    private compute(): GradesView {
        const { state, match } = this.deps.live;
        const you = yourPlayer(match);
        const heroId = you?.heroId;
        if (!gradesShown(state, match) || state === null || match === null || you === null || !heroId) return HIDDEN;

        const clockSecs = match.clockSecs ?? 0;
        const shown = { heroId, display: gradeDisplay(you, clockSecs) };
        if (state.phase === "pregame" || clockSecs < FIRST_GRADE_SECS) return { kind: "firstMinute", ...shown };

        const fetched = this.fetched !== null && this.fetched.key === this.key ? this.fetched.status : LOADING;
        switch (fetched.kind) {
            case "loading":
                return { kind: "loading", ...shown };
            case "failed":
                return { kind: "noTargets", reason: fetched.reason, ...shown };
            case "ready": {
                if (fetched.targets === null) return { kind: "noTargets", reason: "emptyData", ...shown };
                const grades = gradeMatch({ clockSecs, values: liveValues(you), targets: fetched.targets });
                return { kind: "graded", ...shown, grades, frozen: grades.frozen, group: fetched.group };
            }
        }
    }

    private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
        const hit = this.cache.get(key);
        if (hit !== undefined) return hit as Promise<T>;
        const pending = load();
        this.cache.set(key, pending);
        pending.catch(() => {
            if (this.cache.get(key) === pending) this.cache.delete(key);
        });
        return pending;
    }

    private async lobbyBadge(source: GroupSource): Promise<number | null> {
        switch (source.kind) {
            case "streetBrawl":
                return null;
            case "ranked":
                return source.badge;
            case "unranked": {
                if (source.accountIds.length === 0) return null;
                const rows = await this.cached(`ranks|${source.accountIds.join(",")}`, () =>
                    this.deps.api.playerRanks(source.accountIds),
                );
                return unrankedBadge(rows, source.you, this.deps.nowSecs());
            }
        }
    }

    private async resolve(job: Job): Promise<{ targets: GradeTargets | null; group: GroupLabel }> {
        const { api } = this.deps;
        const filterFor = (group: ComparisonGroup): AnalyticsFilter => {
            const { minAverageBadge, maxAverageBadge } = groupFilter(group);
            return {
                gameMode: job.gameMode,
                ...(minAverageBadge === undefined ? {} : { minAverageBadge }),
                ...(maxAverageBadge === undefined ? {} : { maxAverageBadge }),
            };
        };

        let group = startGroup({
            streetBrawl: job.source.kind === "streetBrawl",
            badge: await this.lobbyBadge(job.source),
        });
        for (let calls = 0; group.kind === "tiers" && calls < MAX_HERO_STATS_CALLS; calls++) {
            const filter = filterFor(group);
            const rows = await this.cached(`hero-stats|${filterKey(filter)}`, () => api.heroStats(filter));
            const wider = nextGroup(group, heroMatches(rows, job.heroId));
            if (wider === null) break;
            group = wider;
        }

        const filter = filterFor(group);
        const targets = await this.cached(`targets|${job.heroId}|${filterKey(filter)}`, async () => {
            const [curve, metrics] = await Promise.all([
                api.performanceCurve(job.heroId, filter),
                api.playerStatsMetrics(job.heroId, filter),
            ]);
            return toTargets(curve, metrics);
        });
        return { targets, group: groupLabel(group) };
    }

    private async attempt(job: Job, token: number, retry: number) {
        try {
            const result = await this.resolve(job);
            if (token === this.token) this.fetched = { key: job.key, status: { kind: "ready", ...result } };
        } catch (err) {
            if (token !== this.token) return;
            this.fetched = { key: job.key, status: { kind: "failed", reason: failureReason(err) } };
            const delay = RETRY_DELAYS_MS[retry];
            if (delay === undefined) return;
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.attempt(job, token, retry + 1);
            }, delay);
        }
    }

    private cancel() {
        this.token++;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    private begin(key: string | null) {
        this.cancel();
        const match = this.deps.live.match;
        const heroId = yourPlayer(match)?.heroId;
        if (key === null || match === null || !heroId) {
            this.fetched = null;
            return;
        }
        const job: Job = { key, heroId, gameMode: apiGameMode(match.gameMode), source: groupSource(match) };
        this.fetched = { key, status: LOADING };
        void this.attempt(job, this.token, 0);
    }

    /** Fetches targets whenever your hero or the match type changes. Returns the cleanup. */
    start(): () => void {
        const watch = this.deps.watch ?? watchWithEffect;
        const stopWatching = watch(
            () => this.key,
            (key) => this.begin(key),
        );
        return () => {
            stopWatching();
            this.cancel();
            this.fetched = null;
        };
    }
}

export const grades = new GradesStore({ live, api: deadlockApi, nowSecs: () => Math.floor(Date.now() / 1000) });
