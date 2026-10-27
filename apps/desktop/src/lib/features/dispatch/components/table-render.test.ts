import { describe, expect, it } from "vitest";
import { i18n } from "$lib/core/i18n.svelte";
import { render } from "svelte/server";
import type { EditionKind, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import { labelInName, labelledElements } from "$lib/core/label-in-name";
import type { MiniCopy } from "../kinds/minis";
import type { TableCopies } from "./table";
import Table from "./table.svelte";

await i18n.namespace("dispatch");

const DAY = 86400;
const at = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 1000;
const win = (kind: EditionKind, startS: number, days: number): EditionWindow => ({
    kind,
    id: `${kind}-${startS}`,
    startS,
    endS: startS + days * DAY,
    tz: "UTC",
});
const copy = (kind: MiniCopy["kind"], w: EditionWindow, state: MiniCopy["state"] = "issued"): MiniCopy => ({
    id: w.id,
    kind,
    state,
    window: w,
    number: state === "issued" ? 1 : null,
    matches: 2,
    isNew: false,
});

const weekly = Array.from({ length: 12 }, (_, i) => copy("weekly", win("weekly", at(2026, 1, 9) - i * 7 * DAY, 7)));
const monthly = [0, 1, 2, 3].map((i) => copy("monthly", win("monthly", at(2026, 1 - i, 1), 28)));
const specials = Array.from({ length: 6 }, (_, i) =>
    copy(
        i === 0 ? "year_end" : "collectors",
        win(i === 0 ? "year_end" : "collectors", at(2026, 0, 1) - i * 60 * DAY, 50),
    ),
);
const copies: TableCopies = {
    soFar: copy("so_far", win("weekly", at(2026, 1, 16), 7), "so_far"),
    weekly,
    monthly: [...monthly.slice(0, 3), { ...monthly[3], state: "too_few" }],
    specials,
};

const html = (open: string | null = null) =>
    render(Table, {
        props: { copies, covers: {}, width: 1250, height: 620, open, onpick: () => {}, onprint: () => {} },
    }).body;

describe("dispatch table", () => {
    it("puts every loose copy, special and spine on the table as a button", () => {
        const body = html();
        for (const c of [copies.soFar!, ...specials, ...monthly, weekly[0]]) {
            expect(body).toMatch(new RegExp(`<button[^>]*data-copy="${c.id}"`));
        }
    });

    it("dims a thin window instead of letting it open", () => {
        expect(html()).toMatch(new RegExp(`aria-disabled="true"[^>]*data-copy="${monthly[3].id}"`));
    });

    it("gives every weekly bundle a closed slip button", () => {
        const body = html();
        for (const key of ["weekly-2026-1", "weekly-2026-0", "weekly-2025"]) {
            expect(body).toMatch(new RegExp(`<button[^>]*aria-expanded="false"[^>]*data-bundle="${key}"`));
        }
        expect(body).not.toContain("data-spread");
    });

    it.each([null, "weekly-2025"])("names every button with the words it shows (open %s)", (open) => {
        const withProof: TableCopies = { ...copies, monthly: [copies.monthly[0], { ...monthly[1], state: "proof", number: null }, ...copies.monthly.slice(2)] };
        const body = render(Table, {
            props: { copies: withProof, covers: {}, width: 1250, height: 620, open, onpick: () => {}, onprint: () => {} },
        }).body;
        const buttons = labelledElements(body, "button");
        expect(buttons.length).toBeGreaterThan(10);
        const mismatched = buttons.filter((b) => !labelInName(b.name, b.inner)).map((b) => b.name);
        expect(mismatched).toEqual([]);
    });

    it("deals an open bundle out with each of its copies, and leaves the table behind inert", () => {
        const body = html("weekly-2025");
        expect(body).toContain("data-spread");
        expect(body).toMatch(/aria-expanded="true"[^>]*data-bundle="weekly-2025"/);
        const spread = body.slice(body.indexOf("data-spread"));
        for (const c of weekly.slice(6)) expect(spread).toContain(`data-copy="${c.id}"`);
        expect(spread).toContain("Dec 2025");
        expect(body).toMatch(/class="scene[^"]*"[^>]*inert/);
    });
});
