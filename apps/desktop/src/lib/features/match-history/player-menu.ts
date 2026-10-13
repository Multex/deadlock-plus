import type { SelectMenuItem } from "@deadlock-plus/ui/select-menu";
import type { DeathRole, DeathScope } from "@deadlock-plus/match/death-steps";
import { allPlayers, type MatchDetail, type MatchTeam } from "@deadlock-plus/match/detail";
import { SPEEDS, type ReplaySpeed } from "@deadlock-plus/match/replay";

export interface PlayerMenuText {
    teamName: (team: MatchTeam) => string;
    fallbackName: (slot: number) => string;
    heroName: (heroId: number) => string | undefined;
    /** Marks the viewer's own row. */
    you: string;
}

export type PlayerMenuItem = SelectMenuItem & {
    kind: "player";
    slot: number;
    heroId: number;
    team: MatchTeam;
    own: boolean;
};

export type ScopeMenuItem = PlayerMenuItem | (SelectMenuItem & { kind: "mine" | "all" });

/** One row per player in match order, grouped by team; the value is the slot. */
export function playerMenuItems(detail: MatchDetail, ownSlot: number | null, text: PlayerMenuText): PlayerMenuItem[] {
    return allPlayers(detail).map((p) => {
        const own = p.slot === ownSlot;
        const meta = [text.heroName(p.heroId), own ? text.you : undefined].filter((part) => part).join(" · ");
        return {
            kind: "player",
            value: String(p.slot),
            label: p.name ?? text.fallbackName(p.slot),
            group: text.teamName(p.team),
            meta: meta || undefined,
            slot: p.slot,
            heroId: p.heroId,
            team: p.team,
            own,
        };
    });
}

export function deathScopeItems(
    detail: MatchDetail,
    ownSlot: number | null,
    text: PlayerMenuText & { mine: string; all: string },
): ScopeMenuItem[] {
    return [
        ...(ownSlot === null ? [] : [{ kind: "mine" as const, value: "mine", label: text.mine }]),
        { kind: "all" as const, value: "all", label: text.all },
        ...playerMenuItems(detail, ownSlot, text),
    ];
}

/** The team whose players sit under a group heading. */
export function groupTeam(items: readonly ScopeMenuItem[], group: string): MatchTeam | undefined {
    for (const item of items) {
        if (item.kind === "player" && item.group === group) return item.team;
    }
    return undefined;
}

export function parseDeathScope(value: string): DeathScope {
    return value === "mine" || value === "all" ? value : Number(value);
}

export function roleItems(text: Record<DeathRole, string>): (SelectMenuItem & { value: DeathRole })[] {
    return [
        { value: "victim", label: text.victim },
        { value: "killer", label: text.killer },
    ];
}

export function speedOptions(label: (speed: ReplaySpeed) => string): {
    options: { value: string; label: string }[];
    parse: (value: string) => ReplaySpeed;
} {
    return {
        options: SPEEDS.map((s) => ({ value: String(s), label: label(s) })),
        parse: (value) => SPEEDS.find((s) => String(s) === value) ?? 1,
    };
}
