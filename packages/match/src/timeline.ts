import { allPlayers, type MatchDetail, type MatchTeam, type Position } from "./detail";

/** Minimum change in the team souls lead between two samples to count as a swing. */
export const SWING_THRESHOLD_SOULS = 3000;

/** The API reports some never-fought objectives as destroyed at one second. */
const PLACEHOLDER_DESTROY_MAX_S = 1;

export type TimelineEvent =
    | {
          kind: "death";
          timeS: number;
          victimSlot: number;
          victimTeam: MatchTeam;
          killerSlot: number;
          position?: Position;
          killerPosition?: Position;
          respawnS?: number;
      }
    | { kind: "objective"; timeS: number; objectiveId: number; team: MatchTeam }
    | { kind: "mid-boss"; timeS: number; killedBy?: MatchTeam; claimedBy?: MatchTeam }
    | { kind: "item-buy"; timeS: number; slot: number; team: MatchTeam; itemId: number }
    | { kind: "item-sell"; timeS: number; slot: number; team: MatchTeam; itemId: number }
    | {
          kind: "swing";
          timeS: number;
          fromS: number;
          /** Side whose lead grew. */
          team: MatchTeam;
          /** Hidden King souls minus Archmother souls. */
          leadBefore: number;
          leadAfter: number;
      };

export type TimelineKind = TimelineEvent["kind"];

const KIND_ORDER: TimelineKind[] = ["swing", "item-buy", "item-sell", "objective", "mid-boss", "death"];

function swings(detail: MatchDetail): TimelineEvent[] {
    const players = allPlayers(detail).filter((p) => p.series.length > 0);
    const times = [...new Set(players.flatMap((p) => p.series.map((s) => s.timeS)))].sort((a, b) => a - b);
    if (times.length < 2) return [];

    const lastSouls = new Map<number, number>();
    const leads = times.map((t) => {
        let lead = 0;
        for (const p of players) {
            const souls = p.series.find((s) => s.timeS === t)?.souls ?? lastSouls.get(p.slot) ?? 0;
            lastSouls.set(p.slot, souls);
            lead += p.team === "hidden-king" ? souls : -souls;
        }
        return lead;
    });

    const out: TimelineEvent[] = [];
    for (let i = 1; i < times.length; i++) {
        const delta = leads[i] - leads[i - 1];
        if (Math.abs(delta) < SWING_THRESHOLD_SOULS) continue;
        out.push({
            kind: "swing",
            timeS: times[i],
            fromS: times[i - 1],
            team: delta > 0 ? "hidden-king" : "archmother",
            leadBefore: leads[i - 1],
            leadAfter: leads[i],
        });
    }
    return out;
}

/** One list for the shared timeline, ordered by time, then by kind, then by slot. */
export function buildTimeline(detail: MatchDetail): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const p of allPlayers(detail)) {
        for (const d of p.deathLog) {
            events.push({
                kind: "death",
                timeS: d.timeS,
                victimSlot: p.slot,
                victimTeam: p.team,
                killerSlot: d.killerSlot,
                position: d.position,
                killerPosition: d.killerPosition,
                respawnS: d.respawnS,
            });
        }
        for (const i of p.items) {
            events.push({ kind: "item-buy", timeS: i.boughtS, slot: p.slot, team: p.team, itemId: i.itemId });
            if (i.soldS !== undefined) {
                events.push({ kind: "item-sell", timeS: i.soldS, slot: p.slot, team: p.team, itemId: i.itemId });
            }
        }
    }

    for (const o of detail.objectives) {
        if (o.destroyedS === undefined || o.destroyedS <= PLACEHOLDER_DESTROY_MAX_S) continue;
        events.push({ kind: "objective", timeS: o.destroyedS, objectiveId: o.objectiveId, team: o.team });
    }
    for (const m of detail.midBoss) {
        events.push({ kind: "mid-boss", timeS: m.destroyedS, killedBy: m.killedBy, claimedBy: m.claimedBy });
    }
    events.push(...swings(detail));

    const slotOf = (e: TimelineEvent) => ("slot" in e ? e.slot : "victimSlot" in e ? e.victimSlot : 0);
    return events.sort(
        (a, b) => a.timeS - b.timeS || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || slotOf(a) - slotOf(b),
    );
}

export interface TimelineFilter {
    kinds?: TimelineKind[];
    /** Player slot. Team-level events (objectives, mid boss, swings) never match a slot filter. */
    slot?: number;
    /** Which side of a death `slot` refers to. Defaults to the victim. */
    role?: "victim" | "killer";
    /** Inclusive bounds. */
    fromS?: number;
    toS?: number;
}

export function filterTimeline(events: readonly TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
    const { kinds, slot, role = "victim", fromS, toS } = filter;
    return events.filter((e) => {
        if (kinds && !kinds.includes(e.kind)) return false;
        if (fromS !== undefined && e.timeS < fromS) return false;
        if (toS !== undefined && e.timeS > toS) return false;
        if (slot === undefined) return true;
        if (e.kind === "death") return (role === "victim" ? e.victimSlot : e.killerSlot) === slot;
        if (e.kind === "item-buy" || e.kind === "item-sell") return e.slot === slot;
        return false;
    });
}
