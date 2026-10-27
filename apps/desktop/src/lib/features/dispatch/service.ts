import {
    editionKey,
    indexKey,
    markSeen,
    nextNumber,
    parseIndex,
    recordIssued,
    recordSkipped,
    unseenCount,
    unseenIds,
} from "@deadlock-plus/stats/dispatch/archive";
import { bestGameCandidates, buildEdition, buildEditionBase, windowRows } from "@deadlock-plus/stats/dispatch/edition";
import { KNOWN_SEASONS, mergeSeasons, parseRankedSeasons } from "@deadlock-plus/stats/dispatch/seasons";
import { detectDispatchStories } from "@deadlock-plus/stats/dispatch/stories";
import {
    BEST_GAME_CANDIDATES,
    EDITION_SCHEMA,
    MIN_EDITION_MATCHES,
    type DispatchIndex,
    type Edition,
    type EditionKind,
    type EditionWindow,
    type Enrichment,
    type PendingField,
    type RankedSeason,
} from "@deadlock-plus/stats/dispatch/types";
import { collectorsWindow, dueWindow, pastWindows, soFarWindow } from "@deadlock-plus/stats/dispatch/window";
import type { Match } from "@deadlock-plus/stats/stats";

export type ShelfStatus = "issued" | "printable" | "too_few";

export interface ShelfEntry {
    window: EditionWindow;
    status: ShelfStatus;
    /** Matches in the window, from history rows. */
    matches: number;
    /** Issue number when issued. */
    number: number | null;
    onRequest: boolean;
}

export interface DispatchView {
    latest: Record<EditionKind, Edition | null>;
    soFar: Edition | null;
    soFarMatches: number;
    shelf: Record<EditionKind, ShelfEntry[]>;
    unseen: number;
    /** Unseen automatic issues, newest first. */
    unseenIds: string[];
    /** The match history did not load: the shelf holds the frozen issues only, with no proofs and nothing so far. */
    historyMissing: boolean;
}

export interface DispatchHistory {
    matches: readonly Match[];
    /** false while the rows are a saved copy from an earlier run (offline). */
    live: boolean;
}

export interface DispatchDeps {
    nowS(): number;
    tz(): string;
    accountId(): number | null;
    /** The viewer's Steam persona name, read when an edition is built. */
    playerName(): string | null;
    history(accountId: number): Promise<DispatchHistory>;
    kv: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
    /** `pending` lists the fields the API turned away (rate limit or outage). */
    enrich(
        window: EditionWindow,
        accountId: number,
        candidates: readonly Match[],
    ): Promise<Enrichment & { pending?: PendingField[] }>;
    notify(kind: EditionKind): Promise<void>;
    /** The body of `/v1/assets/ranked-seasons`. */
    rankedSeasons(): Promise<unknown>;
}

export interface DispatchService {
    /** Issues the newest closed window of each kind when due; resolves with what it issued. */
    issueDue(): Promise<Edition[]>;
    print(window: EditionWindow): Promise<Edition | null>;
    /** Marks the edition seen, after enriching again the fields it froze as pending. */
    open(editionId: string): Promise<Edition | null>;
    /** A frozen edition from kv, leaving its unseen badge alone. */
    peek(editionId: string): Promise<Edition | null>;
    /** `null` while the account is unknown. */
    view(): Promise<DispatchView | null>;
}

const KINDS: readonly EditionKind[] = ["weekly", "monthly", "collectors", "year_end"];
const NO_ENRICHMENT: Enrichment & { pending?: PendingField[] } = {
    mates: null,
    enemies: null,
    heroCombat: null,
    grades: null,
};

/** The settings gate for new-edition notifications; the issue itself never depends on it. */
export const alertWhen =
    (enabled: () => boolean, send: (kind: EditionKind) => Promise<unknown>) =>
    async (kind: EditionKind): Promise<void> => {
        if (enabled()) await send(kind);
    };

/**
 * Equal for an equal history: the stats store hands back a fresh list on every load, even a failed one, and a
 * shelf that re-read on identity would load again for ever while the API is down.
 */
export function historyStamp(matches: readonly Match[]): string {
    let ids = 0;
    for (const m of matches) ids += m.matchId;
    return `${matches.length}:${ids}`;
}

const isEdition = (v: unknown, id: string): v is Edition =>
    typeof v === "object" && v !== null && (v as Edition).schema === EDITION_SCHEMA && (v as Edition).id === id;

export function createDispatchService(deps: DispatchDeps): DispatchService {
    // Every index write goes through here, so an issue, a print and an open never interleave their read-modify-write.
    let queue: Promise<unknown> = Promise.resolve();
    const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
        const next = queue.then(run, run);
        queue = next.catch(() => {});
        return next;
    };
    let issuing: Promise<Edition[]> | null = null;

    let seasons: Promise<RankedSeason[]> | null = null;
    // Fetched once per session; a failed fetch falls back to the pinned table and is retried on the next call.
    function loadSeasons(): Promise<RankedSeason[]> {
        seasons ??= deps.rankedSeasons().then((body) => mergeSeasons(KNOWN_SEASONS, parseRankedSeasons(body)));
        return seasons.catch(() => {
            seasons = null;
            return [...KNOWN_SEASONS];
        });
    }
    const seasonOf = (window: EditionWindow, list: readonly RankedSeason[]) =>
        list.find((s) => collectorsWindow(s, window.tz).id === window.id);

    const readIndex = async (accountId: number) => parseIndex(await deps.kv.get(indexKey(accountId)));
    const saveIndex = (accountId: number, index: DispatchIndex) => deps.kv.set(indexKey(accountId), index);

    async function readEdition(accountId: number, editionId: string): Promise<Edition | null> {
        const raw = await deps.kv.get(editionKey(accountId, editionId));
        return isEdition(raw, editionId) ? raw : null;
    }

    async function issue(
        accountId: number,
        window: EditionWindow,
        history: readonly Match[],
        onRequest: boolean,
        season: RankedSeason | undefined,
    ): Promise<Edition | null> {
        // A Collector's Copy is frozen for good, so one is never issued without the season it names.
        if (window.kind === "collectors" && !season) return null;
        const rows = windowRows(history, window);
        if (rows.length < MIN_EDITION_MATCHES) return null;
        const candidates = bestGameCandidates(rows, BEST_GAME_CANDIDATES);
        const enrichment = await deps.enrich(window, accountId, candidates).catch(() => NO_ENRICHMENT);

        // Enrichment takes seconds; the index is read again so the number comes from what is stored now.
        const index = await readIndex(accountId);
        if (index.issued.some((e) => e.id === window.id)) return readEdition(accountId, window.id);
        const now = deps.nowS();
        const edition = buildEdition({
            window,
            accountId,
            history,
            enrichment,
            season,
            playerName: deps.playerName(),
            number: nextNumber(index),
            issuedAt: now,
        });
        if (!edition || edition.number === null) return null;
        if (enrichment.pending?.length) edition.pending = enrichment.pending;

        await deps.kv.set(editionKey(accountId, window.id), edition);
        await saveIndex(
            accountId,
            recordIssued(index, {
                id: window.id,
                kind: window.kind,
                number: edition.number,
                issuedAt: now,
                startS: window.startS,
                endS: window.endS,
                matches: rows.length,
                onRequest,
            }),
        );
        return edition;
    }

    /**
     * Asks again for the fields frozen as pending and takes only those: everything frozen good stays as it was, and
     * the number and dates never change. A field the API answers, or fails for any other reason, stops being pending.
     */
    async function refill(accountId: number, frozen: Edition): Promise<Edition> {
        const pending = frozen.pending;
        if (!pending?.length) return frozen;
        const [history, fresh] = await Promise.all([
            deps.history(accountId).catch(() => null),
            deps.enrich(frozen.window, accountId, []).catch(() => null),
        ]);
        if (!history || !fresh) return frozen;
        const left = pending.filter((f) => fresh.pending?.includes(f));
        if (left.length === pending.length) return frozen;

        // Rebuilt only to borrow the builder's sorting and rival picks for the fields that came back.
        const rebuilt = buildEditionBase({
            window: frozen.window,
            accountId,
            history: history.matches,
            enrichment: fresh,
            number: frozen.number,
            issuedAt: frozen.issuedAt,
        });
        if (!rebuilt) return frozen;
        const filled = (f: PendingField) => pending.includes(f) && !left.includes(f) && fresh[f] !== null;
        const { stories: _stories, pending: _pending, ...kept } = frozen;
        const base = {
            ...kept,
            ...(filled("mates") ? { mates: rebuilt.mates } : {}),
            ...(filled("enemies") ? { nemesis: rebuilt.nemesis, rivals: rebuilt.rivals } : {}),
            ...(filled("heroCombat") ? { combat: rebuilt.combat } : {}),
        };
        const edition: Edition = {
            ...base,
            stories: detectDispatchStories(base),
            ...(left.length > 0 ? { pending: left } : {}),
        };
        await deps.kv.set(editionKey(accountId, frozen.id), edition);
        return edition;
    }

    async function issueDueNow(): Promise<Edition[]> {
        const accountId = deps.accountId();
        if (accountId === null) return [];
        const history = await deps.history(accountId).catch(() => null);
        // A saved copy can miss last week's games, and a window wrongly skipped is never offered automatically again.
        if (!history?.live) return [];
        const known = await loadSeasons();
        const issued: Edition[] = [];
        const issueKind = async (kind: EditionKind) => {
            const index = await readIndex(accountId);
            const window = dueWindow(kind, deps.nowS(), deps.tz(), index, known);
            if (!window) return;
            if (windowRows(history.matches, window).length < MIN_EDITION_MATCHES) {
                await saveIndex(accountId, recordSkipped(index, window.id));
                return;
            }
            const edition = await issue(accountId, window, history.matches, false, seasonOf(window, known));
            if (edition) issued.push(edition);
        };
        // A kind kv could not store stays due, so the next run tries it again.
        for (const kind of KINDS) await issueKind(kind).catch(() => {});
        return issued;
    }

    function issueDue(): Promise<Edition[]> {
        if (issuing) return issuing;
        const run = exclusive(issueDueNow).then(async (issued) => {
            for (const e of issued) await deps.notify(e.window.kind).catch(() => {});
            return issued;
        });
        issuing = run.finally(() => {
            issuing = null;
        });
        return issuing;
    }

    function print(window: EditionWindow): Promise<Edition | null> {
        return exclusive(async () => {
            const accountId = deps.accountId();
            if (accountId === null) return null;
            const index = await readIndex(accountId);
            if (index.issued.some((e) => e.id === window.id)) {
                const frozen = await readEdition(accountId, window.id);
                if (frozen) return frozen;
            }
            const history = await deps.history(accountId);
            const season = window.kind === "collectors" ? seasonOf(window, await loadSeasons()) : undefined;
            return issue(accountId, window, history.matches, true, season);
        });
    }

    function open(editionId: string): Promise<Edition | null> {
        return exclusive(async () => {
            const accountId = deps.accountId();
            if (accountId === null) return null;
            const frozen = await readEdition(accountId, editionId);
            if (!frozen) return null;
            const edition = await refill(accountId, frozen);
            const index = await readIndex(accountId);
            const seen = markSeen(index, editionId);
            if (seen !== index) await saveIndex(accountId, seen);
            return edition;
        });
    }

    async function peek(editionId: string): Promise<Edition | null> {
        const accountId = deps.accountId();
        return accountId === null ? null : readEdition(accountId, editionId);
    }

    async function view(): Promise<DispatchView | null> {
        const accountId = deps.accountId();
        if (accountId === null) return null;
        const [index, history, known] = await Promise.all([
            readIndex(accountId),
            deps.history(accountId).catch(() => null),
            loadSeasons(),
        ]);
        const matches = history?.matches ?? [];
        const now = deps.nowS();
        const tz = deps.tz();
        const firstS = matches.reduce((min, m) => Math.min(min, m.startTime), Infinity);

        // Frozen issues live in kv, so they stay readable while the API is down.
        const frozenOf = (kind: EditionKind): ShelfEntry[] =>
            index.issued
                .filter((e) => e.kind === kind)
                .sort((a, b) => b.startS - a.startS)
                .map((e) => ({
                    window: { kind, id: e.id, startS: e.startS, endS: e.endS, tz },
                    status: "issued",
                    matches: e.matches,
                    number: e.number,
                    onRequest: e.onRequest,
                }));

        const shelfOf = (kind: EditionKind): ShelfEntry[] => {
            if (!history) return frozenOf(kind);
            if (!Number.isFinite(firstS)) return [];
            return pastWindows(kind, now, tz, firstS, known).map((window) => {
                const entry = index.issued.find((e) => e.id === window.id);
                const count = windowRows(matches, window).length;
                const status: ShelfStatus = entry ? "issued" : count < MIN_EDITION_MATCHES ? "too_few" : "printable";
                return {
                    window,
                    status,
                    matches: count,
                    number: entry?.number ?? null,
                    onRequest: entry?.onRequest ?? false,
                };
            });
        };
        const latestOf = (kind: EditionKind) => {
            const entry = index.issued.find((e) => e.kind === kind);
            // One unreadable copy costs its cover only; the room says so when it is picked up.
            return entry ? readEdition(accountId, entry.id).catch(() => null) : Promise.resolve(null);
        };

        const live = soFarWindow(now, tz);
        const [weekly, monthly, collectors, year_end] = await Promise.all(KINDS.map(latestOf));
        return {
            latest: { weekly, monthly, collectors, year_end },
            soFar: buildEdition({
                window: live,
                accountId,
                history: matches,
                enrichment: NO_ENRICHMENT,
                playerName: deps.playerName(),
                number: null,
                issuedAt: null,
            }),
            soFarMatches: history ? windowRows(matches, live).length : 0,
            shelf: {
                weekly: shelfOf("weekly"),
                monthly: shelfOf("monthly"),
                collectors: shelfOf("collectors"),
                year_end: shelfOf("year_end"),
            },
            unseen: unseenCount(index),
            unseenIds: unseenIds(index),
            historyMissing: !history,
        };
    }

    return { issueDue, print, open, peek, view };
}
