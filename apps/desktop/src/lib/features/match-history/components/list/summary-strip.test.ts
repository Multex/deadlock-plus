import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import type { RowSummary } from "@deadlock-plus/match/list-summary";
import SummaryStrip from "./summary-strip.svelte";

const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "source"]);

interface Node {
    tag: string;
    children: Node[];
}

function tree(html: string): Node {
    const root: Node = { tag: "#root", children: [] };
    const stack = [root];
    for (const [, close, tag, rest] of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>/gi)) {
        const name = tag.toLowerCase();
        if (close) {
            while (stack.length > 1 && stack.pop()!.tag !== name);
            continue;
        }
        const node = { tag: name, children: [] };
        stack.at(-1)!.children.push(node);
        if (!VOID.has(name) && !rest.trimEnd().endsWith("/")) stack.push(node);
    }
    return root;
}

function find(node: Node, tag: string): Node[] {
    return [...(node.tag === tag ? [node] : []), ...node.children.flatMap((c) => find(c, tag))];
}

const summary = (topHero: RowSummary["topHero"]): RowSummary => ({
    matches: 10,
    wins: 6,
    losses: 4,
    unscored: 0,
    winrate: 0.6,
    kda: 3.2,
    avgKills: 5,
    avgDeaths: 3,
    avgAssists: 8,
    avgSouls: 30000,
    netDelta: 2,
    topHero,
});

describe("summary strip", () => {
    it.each([
        ["a most played hero", { heroId: 1, games: 4 }],
        ["no most played hero", null],
    ])("groups every dt and dd in a div holding only dt and dd, with %s", (_, topHero) => {
        const { body } = render(SummaryStrip, { props: { summary: summary(topHero), form: [], heroes: {} } });
        const [dl] = find(tree(body), "dl");
        expect(dl).toBeDefined();
        for (const group of dl.children) {
            expect(group.tag).toBe("div");
            expect(group.children.length).toBeGreaterThan(0);
            expect(group.children.map((c) => c.tag).every((t) => t === "dt" || t === "dd")).toBe(true);
        }
    });

    it("keeps the list's own roles on every dt and dd", () => {
        const { body } = render(SummaryStrip, { props: { summary: summary(null), form: [], heroes: {} } });
        const items = [...body.matchAll(/<(dt|dd)\b([^>]*)>/g)];
        expect(items.length).toBeGreaterThan(0);
        for (const [tag, , attrs] of items) expect(attrs, tag).not.toMatch(/\brole="/);
    });
});
