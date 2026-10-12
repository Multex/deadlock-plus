import type { IdVisual } from "../../deep-dive/catalog";
import {
    averageBadgeOf,
    averageDisplayRank,
    findPlayer,
    MATCH_TEAMS,
    type MatchDetail,
    type MatchItem,
    type MatchPlayer,
    type MatchTeam,
    type PlayerOutcome,
} from "../../detail";
import { rowMode, type RowMode } from "../../list";

export interface StatRow {
    key: "souls" | "kills" | "deaths" | "assists" | "playerDamage" | "healing";
    /** Whether the highest or the lowest value in the row is the best one. */
    better: "high" | "low";
    compact: boolean;
}

export const STAT_ROWS: readonly StatRow[] = [
    { key: "souls", better: "high", compact: true },
    { key: "kills", better: "high", compact: false },
    { key: "deaths", better: "low", compact: false },
    { key: "assists", better: "high", compact: false },
    { key: "playerDamage", better: "high", compact: true },
    { key: "healing", better: "high", compact: true },
];

export type StatKey = StatRow["key"];

/** The game's own designation: rank 1 is the MVP, ranks 2 and 3 are key players. */
export type MvpKind = "mvp" | "key";

export function mvpKind(rank: number | undefined): MvpKind | null {
    if (rank === 1) return "mvp";
    if (rank === 2 || rank === 3) return "key";
    return null;
}

export interface BoardColumn {
    player: MatchPlayer;
    own: boolean;
    /** Tier * 10 + subrank, or null when the player has no rank. */
    badge: number | null;
    /** True where this player holds the best value of the row across everyone and the row is not all equal. */
    best: Record<StatKey, boolean>;
    mvp: MvpKind | null;
}

export interface BoardTeam {
    team: MatchTeam;
    score: number;
    won: boolean;
    /** Null when the match has no scored result. */
    result: "win" | "loss" | null;
    totals: { kills: number; souls: number; playerDamage: number };
    columns: BoardColumn[];
}

export function boardTeams(detail: MatchDetail, ownAccountId: number | null): BoardTeam[] {
    const everyone = detail.teams.flatMap((t) => t.players);
    const bestOf = Object.fromEntries(
        STAT_ROWS.map((row) => {
            const values = everyone.map((p) => p[row.key]);
            const target = row.better === "high" ? Math.max(...values) : Math.min(...values);
            const allEqual = values.every((v) => v === values[0]);
            return [row.key, allEqual ? null : target];
        }),
    ) as Record<StatKey, number | null>;

    const teams = MATCH_TEAMS.map((team): BoardTeam => {
        const source = detail.teams.find((t) => t.team === team);
        const players = source?.players ?? [];
        const columns = [...players]
            .sort((a, b) => b.souls - a.souls || a.slot - b.slot)
            .map((player): BoardColumn => {
                const best = Object.fromEntries(
                    STAT_ROWS.map((row) => [row.key, bestOf[row.key] !== null && player[row.key] === bestOf[row.key]]),
                ) as Record<StatKey, boolean>;
                return {
                    player,
                    own: ownAccountId !== null && player.accountId === ownAccountId,
                    badge: player.rank && player.rank.displayRank > 0 ? player.rank.displayRank : null,
                    best,
                    mvp: mvpKind(player.mvpRank),
                };
            });
        const scored = !detail.notScored && detail.winningTeam !== undefined;
        const sum = (key: "kills" | "souls" | "playerDamage") => players.reduce((n, p) => n + p[key], 0);
        return {
            team,
            score: source?.score ?? 0,
            won: detail.winningTeam === team,
            result: !scored ? null : detail.winningTeam === team ? "win" : "loss",
            totals: { kills: sum("kills"), souls: sum("souls"), playerDamage: sum("playerDamage") },
            columns,
        };
    });
    return teams.some((t) => t.columns.some((c) => c.own))
        ? teams.sort((a, b) => Number(hasOwn(b)) - Number(hasOwn(a)))
        : teams;
}

export function anyRanked(boards: readonly BoardTeam[]): boolean {
    return boards.some((b) => b.columns.some((c) => c.badge !== null));
}

const hasOwn = (t: BoardTeam) => t.columns.some((c) => c.own);

export interface HeaderSummary {
    outcome: PlayerOutcome | null;
    winner: MatchTeam | null;
    notScored: boolean;
    mode: RowMode;
    durationS: number;
    startTime: number;
    averageBadge: number | null;
    bans: number[];
}

/** The API's own average badge fields are 0, so the badge comes from the players' ranks. */
export function headerSummary(detail: MatchDetail, ownAccountId: number | null): HeaderSummary {
    const own = ownAccountId === null ? undefined : findPlayer(detail, [ownAccountId]);
    const teams = detail.teams.map((t) => {
        const averageBadge = averageDisplayRank(t.players.flatMap((p) => (p.rank ? [p.rank.displayRank] : [])));
        return { ...t, averageBadge };
    }) as MatchDetail["teams"];
    return {
        outcome: own?.outcome ?? null,
        winner: detail.winningTeam ?? null,
        notScored: detail.notScored,
        mode: rowMode(detail),
        durationS: detail.durationS,
        startTime: detail.startTime,
        averageBadge: averageBadgeOf({ ...detail, teams }) ?? null,
        bans: detail.bans,
    };
}

/** Items still held at match end, one per id, in purchase order. Ability upgrades repeat an id. */
export function heldItems(items: MatchItem[]): MatchItem[] {
    const seen = new Set<number>();
    return [...items]
        .sort((a, b) => a.boughtS - b.boughtS)
        .filter((i) => {
            if (i.soldS !== undefined || seen.has(i.itemId)) return false;
            seen.add(i.itemId);
            return true;
        });
}

export interface ItemSlot {
    itemId: number;
    name: string | null;
    src: string | null;
}

/**
 * Ids the game files as abilities are left out. Ids the game data does not know stay as
 * unnamed slots.
 */
export function itemSlots(items: MatchItem[], visuals: ReadonlyMap<number, IdVisual>): ItemSlot[] {
    return heldItems(items).flatMap((i) => {
        const v = visuals.get(i.itemId);
        if (v?.kind === "ability") return [];
        return [{ itemId: i.itemId, name: v?.name ?? null, src: v?.src ?? null }];
    });
}

/** The shop shows three banks of four slots (weapon, vitality, spirit). */
export const ITEM_GRID_COLUMNS = 4;
export const MIN_ITEM_SLOTS = 12;

/** Whole pixels, so the item art is never drawn at a fractional size. Four tiles fit a column of the full board. */
export const ITEM_TILE_PX = 18;
export const ITEM_GAP_PX = 2;

/** One grid size for every player so the item cells line up. Rounds up to whole rows. */
export function itemGridSize(counts: readonly number[]): number {
    const most = Math.max(0, ...counts);
    return Math.max(MIN_ITEM_SLOTS, Math.ceil(most / ITEM_GRID_COLUMNS) * ITEM_GRID_COLUMNS);
}

/** Pads with nulls (empty placeholders) up to `size`. */
export function gridSlots(slots: ItemSlot[], size: number): (ItemSlot | null)[] {
    return [...slots, ...Array.from({ length: Math.max(0, size - slots.length) }, () => null)];
}

/** A name on one line: inner whitespace collapsed, the fallback when nothing is left. */
export function columnName(name: string | null, fallback: string): string {
    const clean = name?.replace(/\s+/g, " ").trim();
    return clean ? clean : fallback;
}

export type BoardRowKey = "items" | StatKey;

export interface BoardRow {
    key: BoardRowKey;
    labelKey: string;
}

const STAT_LABEL_KEYS: Record<StatKey, string> = {
    souls: "live.col.souls",
    kills: "live.col.kills",
    deaths: "live.col.deaths",
    assists: "live.col.assists",
    playerDamage: "match_history.detail.col.damage",
    healing: "live.col.healing",
};

export const BOARD_ROWS: readonly BoardRow[] = [
    { key: "items", labelKey: "match_history.detail.col.items" },
    ...STAT_ROWS.map((r) => ({ key: r.key, labelKey: STAT_LABEL_KEYS[r.key] })),
];

interface RankArtFit {
    scale: number;
    x: number;
    y: number;
}

/**
 * Per-tier correction for the transparent padding baked into the rank PNGs, derived from each file's
 * alpha bounding box so every tier's visible art spans 90% of the badge box and sits centred.
 * `x`/`y` are fractions of the box.
 */
export const RANK_ART_FIT: Readonly<Record<number, RankArtFit>> = {
    0: { scale: 1.45, x: 0.016, y: -0.126 },
    1: { scale: 1.45, x: 0.018, y: -0.124 },
    2: { scale: 1.19, x: 0.01, y: -0.025 },
    3: { scale: 1.17, x: 0.013, y: -0.016 },
    4: { scale: 1.23, x: 0.009, y: -0.036 },
    5: { scale: 1.17, x: 0.09, y: -0.015 },
    6: { scale: 1.15, x: 0.009, y: -0.019 },
    7: { scale: 1.18, x: 0.006, y: -0.018 },
    8: { scale: 0.9, x: 0, y: -0.021 },
    9: { scale: 1.28, x: -0.004, y: -0.1 },
    10: { scale: 1.24, x: -0.006, y: -0.035 },
    11: { scale: 0.91, x: 0.002, y: 0 },
};

/** Narrowest width of one player column and of the stat label column between the teams. */
export const BOARD_COLUMN_MIN_REM = 5;
export const BOARD_LABEL_REM = 5;

/** Width in px the board needs before its columns would have to overlap or scroll. */
export function boardMinWidth(columns: number, rootPx: number): number {
    return (columns * BOARD_COLUMN_MIN_REM + BOARD_LABEL_REM) * rootPx;
}

/** Inline custom properties that normalise the visible size of a tier's rank art; empty when unknown. */
export function rankArtVars(tier: number | null | undefined): string {
    const fit = tier === null || tier === undefined ? undefined : RANK_ART_FIT[tier];
    if (!fit) return "";
    return `--rank-art-scale:${fit.scale};--rank-art-x:${fit.x * 100}%;--rank-art-y:${fit.y * 100}%`;
}
