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
import { bestGameCandidates, buildEdition, windowRows } from "@deadlock-plus/stats/dispatch/edition";
import { KNOWN_SEASONS, mergeSeasons, parseRankedSeasons } from "@deadlock-plus/stats/dispatch/seasons";
import {
    BEST_GAME_CANDIDATES,
    EDITION_SCHEMA,
    MIN_EDITION_MATCHES,
    type DispatchIndex,
    type Edition,
    type EditionKind,
    type EditionWindow,
    type Enrichment,
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
    enrich(window: EditionWindow, accountId: number, candidates: readonly Match[]): Promise<Enrichment>;
    notify(kind: EditionKind): Promise<void>;
    /** The body of `/v1/assets/ranked-seasons`. */
    rankedSeasons(): Promise<unknown>;
}

export interface DispatchService {
    /** Issues the newest closed window of each kind when due; resolves with what it issued. */
    issueDue(): Promise<Edition[]>;
    print(window: EditionWindow): Promise<Edition | null>;
    open(editionId: string): Promise<Edition | null>;
    /** `null` while the account is unknown. */
    view(): Promise<DispatchView | null>;
}

const KINDS: readonly EditionKind[] = ["weekly", "monthly", "collectors", "year_end"];
const NO_ENRICHMENT: Enrichment = { mates: null, enemies: null, heroCombat: null, grades: null };

/** The settings gate for new-edition notifications; the issue itself never depends on it. */
export const alertWhen =
    (enabled: () => boolean, send: (kind: EditionKind) => Promise<unknown>) =>
    async (kind: EditionKind): Promise<void> => {
        if (enabled()) await send(kind);
    };

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

    async function issueDueNow(): Promise<Edition[]> {
        const accountId = deps.accountId();
        if (accountId === null) return [];
        const history = await deps.history(accountId);
        // A saved copy can miss last week's games, and a window wrongly skipped is never offered automatically again.
        if (!history.live) return [];
        const known = await loadSeasons();
        const issued: Edition[] = [];
        for (const kind of KINDS) {
            const index = await readIndex(accountId);
            const window = dueWindow(kind, deps.nowS(), deps.tz(), index, known);
            if (!window) continue;
            if (windowRows(history.matches, window).length < MIN_EDITION_MATCHES) {
                await saveIndex(accountId, recordSkipped(index, window.id));
                continue;
            }
            const edition = await issue(accountId, window, history.matches, false, seasonOf(window, known));
            if (edition) issued.push(edition);
        }
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
            const edition = await readEdition(accountId, editionId);
            if (!edition) return null;
            const index = await readIndex(accountId);
            const seen = markSeen(index, editionId);
            if (seen !== index) await saveIndex(accountId, seen);
            return edition;
        });
    }

    async function view(): Promise<DispatchView | null> {
        const accountId = deps.accountId();
        if (accountId === null) return null;
        const [index, history, known] = await Promise.all([
            readIndex(accountId),
            deps.history(accountId),
            loadSeasons(),
        ]);
        const matches = history.matches;
        const now = deps.nowS();
        const tz = deps.tz();
        const firstS = matches.reduce((min, m) => Math.min(min, m.startTime), Infinity);

        const shelfOf = (kind: EditionKind): ShelfEntry[] => {
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
            return entry ? readEdition(accountId, entry.id) : Promise.resolve(null);
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
            soFarMatches: windowRows(matches, live).length,
            shelf: {
                weekly: shelfOf("weekly"),
                monthly: shelfOf("monthly"),
                collectors: shelfOf("collectors"),
                year_end: shelfOf("year_end"),
            },
            unseen: unseenCount(index),
            unseenIds: unseenIds(index),
        };
    }

    return { issueDue, print, open, view };
}
