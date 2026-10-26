import { afterEach, describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import { steamAccount } from "$lib/features/steam-account/account.svelte";
import CollectorsMini from "./collectors/collectors-mini.svelte";
import type { MiniCopy, MiniCover, MiniKind, MiniState } from "./minis";
import MonthlyMini from "./monthly/monthly-mini.svelte";
import { MONTH_PALETTES, heroPalette } from "./monthly/palette";
import SoFarMini from "./weekly/so-far-mini.svelte";
import WeeklyMini from "./weekly/weekly-mini.svelte";
import YearEndMini from "./year_end/year-end-mini.svelte";

const at = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 1000;
const WINDOWS: Record<MiniKind, EditionWindow> = {
    so_far: { kind: "weekly", id: "live", startS: at(2025, 10, 24), endS: at(2025, 11, 1), tz: "UTC" },
    weekly: { kind: "weekly", id: "w", startS: at(2025, 10, 24), endS: at(2025, 11, 1), tz: "UTC" },
    monthly: { kind: "monthly", id: "m", startS: at(2025, 9, 1), endS: at(2025, 10, 1), tz: "UTC" },
    collectors: { kind: "collectors", id: "c", startS: at(2025, 6, 30), endS: at(2025, 10, 5), tz: "UTC" },
    year_end: { kind: "year_end", id: "y", startS: at(2024, 11, 1), endS: at(2025, 11, 1), tz: "UTC" },
};

const COVER: MiniCover = {
    heroId: 31,
    colour: "#4174BB",
    portrait: "lash.png",
    hero: "Lash",
    headline: "Winning ways",
    photo: "photo.png",
    player: "Lantern",
    badge: { image: "phantom.png", color: "#4b3a7a", label: "Phantom 4" },
};

const copy = (kind: MiniKind, state: MiniState, isNew = false): MiniCopy => ({
    id: kind,
    kind,
    state,
    window: WINDOWS[kind],
    number: state === "issued" ? 3 : null,
    matches: state === "too_few" ? 1 : 12,
    isNew,
});

function html(kind: MiniKind, state: MiniState, opts: { isNew?: boolean; sealed?: boolean } = {}): string {
    const c = copy(kind, state, opts.isNew);
    const props = { copy: c, cover: state === "issued" ? COVER : undefined, height: 180 };
    switch (kind) {
        case "so_far":
            return render(SoFarMini, { props: { copy: c, height: 180 } }).body;
        case "weekly":
            return render(WeeklyMini, { props }).body;
        case "monthly":
            return render(MonthlyMini, { props }).body;
        case "collectors":
            return render(CollectorsMini, { props: { ...props, sealed: opts.sealed } }).body;
        case "year_end":
            return render(YearEndMini, { props }).body;
    }
}

const KINDS = ["weekly", "monthly", "collectors", "year_end"] as const;

describe("edition minis", () => {
    it.each(KINDS)("%s shows Print only on a proof", (kind) => {
        expect(html(kind, "proof")).toContain("mini-print");
        expect(html(kind, "issued")).not.toContain("mini-print");
    });

    it.each(KINDS)("%s carries a NEW badge only when new", (kind) => {
        expect(html(kind, "issued", { isNew: true })).toContain('class="new');
        expect(html(kind, "issued")).not.toContain('class="new');
    });

    it.each(KINDS)("%s fades a thin window", (kind) => {
        expect(html(kind, "too_few")).toMatch(/class="mini[^"]*faded/);
        expect(html(kind, "issued")).not.toMatch(/class="mini[^"]*faded/);
    });

    it("scales the face to the given height", () => {
        expect(html("weekly", "issued")).toContain("transform: scale(" + 180 / 176 + ")");
    });

    it("tightens the weekly date line only when the week spans two years", () => {
        const render1 = (w: EditionWindow) =>
            render(WeeklyMini, {
                props: { copy: { ...copy("weekly", "issued"), window: w }, cover: COVER, height: 180 },
            }).body;
        const across = render1({ ...WINDOWS.weekly, startS: at(2025, 11, 29), endS: at(2026, 0, 5) });
        expect(across).toMatch(/class="when[^"]*tight/);
        expect(html("weekly", "issued")).not.toMatch(/class="when[^"]*tight/);
    });

    it("bags a sealed Collector's Copy, never a proof", () => {
        expect(html("collectors", "issued", { sealed: true })).toContain('class="bag');
        expect(html("collectors", "issued")).not.toContain('class="bag');
        expect(html("collectors", "proof", { sealed: true })).not.toContain('class="bag');
    });

    it("colours an issued Monthly like its cover and a proof in its month's colour", () => {
        expect(html("monthly", "issued")).toContain(`--bg: ${heroPalette("#4174BB").bg};`);
        expect(html("monthly", "proof")).toContain(`--bg: ${MONTH_PALETTES[9]!.bg};`);
    });

    it("puts the cover star on an issued Monthly and the peak badge on a Collector's Copy", () => {
        expect(html("monthly", "issued")).toContain('src="lash.png"');
        expect(html("collectors", "issued")).toContain('src="phantom.png"');
        expect(html("collectors", "proof")).not.toContain('src="phantom.png"');
    });

    it("prints the so-far sheet with its press stamp", () => {
        const body = html("so_far", "so_far");
        expect(body).toContain('data-status="so_far"');
        expect(body).toContain('class="stamp');
    });
});

describe("year-end mini name", () => {
    const yearEnd = (player: string | null) =>
        render(YearEndMini, { props: { copy: copy("year_end", "issued"), cover: { ...COVER, player }, height: 180 } })
            .body;

    afterEach(() => {
        steamAccount.account = null;
    });

    it("prints the frozen name", () => {
        expect(yearEnd("Lantern")).toMatch(/class="y-name[^"]*"[^>]*>LANTERN</);
    });

    it("falls back to the account's current name when the edition froze without one", () => {
        steamAccount.account = { personaName: "Moth" } as typeof steamAccount.account;
        expect(yearEnd(null)).toMatch(/class="y-name[^"]*"[^>]*>MOTH</);
    });

    it("drops the empty name line when there is no name at all", () => {
        expect(yearEnd(null)).not.toContain("y-name");
        expect(yearEnd(null)).toMatch(/class="y-poty[^"]*alone/);
    });

    it("lets a long name end in an ellipsis inside the frame", () => {
        expect(yearEnd("Lantern")).toMatch(/class="y-name[^"]*"[^>]*title="Lantern"|title="Lantern"[^>]*class="y-name/);
    });
});
