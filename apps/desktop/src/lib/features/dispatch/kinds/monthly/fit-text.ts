export interface FitNode {
    style: { setProperty(name: string, value: string): void };
    readonly scrollHeight: number;
    readonly clientHeight: number;
    readonly scrollWidth: number;
    readonly clientWidth: number;
}

interface FitJob {
    node: FitNode;
    max: number;
    min: number;
}

const overflows = (n: FitNode) => n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1;

/**
 * Sets `--fs` on each node to the largest whole pixel size in [min, max] at which its content fits its box on both
 * axes, or `min` when none does. Binary search, with every node probed in the same round: all writes, then all
 * reads, so a round costs one layout however many nodes there are.
 */
export function fitAll(jobs: readonly FitJob[]) {
    const state = jobs.map((j) => ({ node: j.node, lo: j.min, hi: j.max, set: Number.NaN }));
    const write = (s: (typeof state)[number], size: number) => {
        s.set = size;
        s.node.style.setProperty("--fs", `${size}px`);
    };
    let open = state.filter((s) => s.lo < s.hi);
    // The largest size goes first: most text fits it, and then one read settles the node.
    for (let round = 0; open.length; round++) {
        for (const s of open) write(s, round === 0 ? s.hi : Math.ceil((s.lo + s.hi) / 2));
        for (const s of open) {
            if (overflows(s.node)) s.hi = s.set - 1;
            else s.lo = s.set;
        }
        open = open.filter((s) => s.lo < s.hi);
    }
    for (const s of state) if (s.set !== s.lo) write(s, s.lo);
}

type ElementJob = FitJob & { node: HTMLElement };

const queue = new Map<HTMLElement, ElementJob>();
const current = new WeakMap<HTMLElement, ElementJob>();

function flush() {
    const jobs = [...queue.values()];
    queue.clear();
    fitAll(jobs);
    // The fallback face measures differently; fit again once the real fonts land, unless they already had.
    if (document.fonts.status !== "loaded") {
        void document.fonts.ready.then(() => {
            for (const job of jobs) if (current.get(job.node) === job) enqueue(job);
        });
    }
}

function enqueue(job: ElementJob) {
    if (queue.size === 0) queueMicrotask(flush);
    queue.set(job.node, job);
}

/**
 * Attachment that fits the node's `--fs` between `max` and `min` px. Fits are batched per microtask, so the
 * nodes mounted together share their layouts.
 */
export function fitText(max: number, min: number) {
    return (node: HTMLElement) => {
        const job = { node, max, min };
        current.set(node, job);
        enqueue(job);
        return () => {
            if (current.get(node) === job) current.delete(node);
            if (queue.get(node) === job) queue.delete(node);
        };
    };
}
