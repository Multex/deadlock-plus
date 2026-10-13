import { allPlayers, type MatchDetail } from "../detail";

export interface DamageRow {
    slot: number;
    /** Total to each other player's slot. The row's own slot and slot 0 are not in here. */
    cells: Map<number, number>;
    /** Total recorded against the dealer's own slot. */
    other: number;
}

export interface DamageTable {
    rows: DamageRow[];
    max: number;
}

export function reduceDamageMatrix(detail: MatchDetail): DamageTable {
    const slots = new Set(allPlayers(detail).map((p) => p.slot));
    const rows = new Map<number, DamageRow>();
    for (const slot of [...slots].sort((a, b) => a - b)) rows.set(slot, { slot, cells: new Map(), other: 0 });

    for (const e of detail.damageMatrix.entries) {
        const row = rows.get(e.dealerSlot);
        if (!row) continue;
        const total = e.cumulative.at(-1) ?? 0;
        if (e.targetSlot === e.dealerSlot) row.other += total;
        else if (slots.has(e.targetSlot)) row.cells.set(e.targetSlot, (row.cells.get(e.targetSlot) ?? 0) + total);
    }

    let max = 0;
    for (const row of rows.values()) for (const v of row.cells.values()) if (v > max) max = v;
    return { rows: [...rows.values()], max };
}
