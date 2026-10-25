export type RackSlot = { kind: "paper"; id: string } | { kind: "pile"; key: string; ids: string[] };

interface RackNode {
    key: string;
    ids: string[];
    children: RackPart[];
}
type RackPart = RackNode | string;

function build(items: readonly { id: string; path: readonly string[] }[], depth: number): RackPart[] {
    const parts: RackPart[] = [];
    let group: { id: string; path: readonly string[] }[] = [];
    const flush = () => {
        if (group.length === 0) return;
        let node: RackPart = {
            key: group[0].path[depth],
            ids: group.map((i) => i.id),
            children: build(group, depth + 1),
        };
        // A pile holding a single pile is that pile; a pile of one paper is that paper.
        while (typeof node !== "string" && node.children.length === 1) node = node.children[0];
        parts.push(node);
        group = [];
    };
    for (const item of items) {
        const key = item.path[depth];
        if (key === undefined) {
            flush();
            parts.push(item.id);
        } else {
            if (group.length > 0 && group[0].path[depth] !== key) flush();
            group.push(item);
        }
    }
    flush();
    return parts;
}

const holds = (node: RackNode, key: string): boolean =>
    node.key === key || node.children.some((c) => typeof c !== "string" && holds(c, key));

/**
 * The papers and piles on one rack row, newest first. Everything stands loose when it fits; otherwise older
 * papers pile up by year, and piles open newest first while the row has room. The `open` pile is always
 * fanned out, even past the room: the row then packs its papers tighter.
 */
export function rackSlots(
    items: readonly { id: string; path: readonly string[] }[],
    capacity: number,
    open: string | null,
): RackSlot[] {
    if (items.length <= capacity) return items.map((i) => ({ kind: "paper", id: i.id }));
    let row = build(items, 0);
    const expand = (at: number) => {
        const node = row[at] as RackNode;
        row = [...row.slice(0, at), ...node.children, ...row.slice(at + 1)];
    };
    if (open !== null) {
        for (let at = row.findIndex((p) => typeof p !== "string" && holds(p, open)); at >= 0;) {
            expand(at);
            at = row.findIndex((p) => typeof p !== "string" && holds(p, open));
        }
    }
    for (let at = 0; at < row.length; at++) {
        const part = row[at];
        if (typeof part !== "string" && row.length - 1 + part.children.length <= capacity) {
            expand(at);
            at = -1;
        }
    }
    return row.map((p) =>
        typeof p === "string" ? { kind: "paper", id: p } : { kind: "pile", key: p.key, ids: p.ids },
    );
}

/** How many papers fit on a row when each one behind shows at least `minStep` px of itself. */
export function rackCapacity(rowW: number, paperW: number, minStep: number): number {
    return Math.max(1, Math.floor((rowW - paperW) / minStep) + 1);
}

/** The offset from one paper to the next, so the last ends on the row's end; never wider than a paper and a gap. */
export function rackStep(count: number, rowW: number, paperW: number, gap: number): number {
    if (count <= 1) return 0;
    return Math.min(paperW + gap, (rowW - paperW) / (count - 1));
}

export interface RackPos {
    row: number;
    col: number;
}

/** Arrow-key moves on the rack: where focus goes from `pos`, or `null` to stay put. */
export function rackStop(pos: RackPos, key: string, rows: readonly number[]): RackPos | null {
    const len = rows[pos.row] ?? 0;
    const across = (row: number, step: 1 | -1): RackPos | null => {
        for (let r = row + step; r >= 0 && r < rows.length; r += step) {
            if (rows[r] > 0) return { row: r, col: Math.min(pos.col, rows[r] - 1) };
        }
        return null;
    };
    switch (key) {
        case "ArrowRight":
            return pos.col + 1 < len ? { row: pos.row, col: pos.col + 1 } : null;
        case "ArrowLeft":
            return pos.col > 0 ? { row: pos.row, col: pos.col - 1 } : null;
        case "Home":
            return { row: pos.row, col: 0 };
        case "End":
            return { row: pos.row, col: len - 1 };
        case "ArrowDown":
            return across(pos.row, 1);
        case "ArrowUp":
            return across(pos.row, -1);
        default:
            return null;
    }
}

/** Where a window piles on the rack: weeks by year then month, everything else by year, in the window's zone. */
export function pileKeys(kind: string, startS: number, tz: string): string[] {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(
        startS * 1000,
    );
    const year = parts.find((p) => p.type === "year")?.value ?? "";
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    return kind === "weekly" ? [year, `${year}-${month}`] : [year];
}
