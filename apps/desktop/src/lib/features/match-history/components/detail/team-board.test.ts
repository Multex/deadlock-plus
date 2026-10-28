import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { MatchPlayer, MatchTeam } from "@deadlock-plus/match/detail";
import type { BoardColumn, BoardTeam } from "@deadlock-plus/match/scoreboard";
import { EXPORT_IGNORE_ATTR } from "@deadlock-plus/match/export";
import TeamBoard from "./team-board.svelte";

function column(slot: number, team: MatchTeam, name: string, accountId: number): BoardColumn {
    const player: MatchPlayer = {
        slot,
        accountId,
        name,
        team,
        heroId: 1,
        level: 1,
        kills: 0,
        deaths: 0,
        assists: 0,
        souls: 0,
        lastHits: 0,
        denies: 0,
        playerDamage: 0,
        healing: 0,
        outcome: "unscored",
        items: [],
        deathLog: [],
        series: [],
        abilities: [],
        accolades: [],
    };
    const best = { souls: false, kills: false, deaths: false, assists: false, playerDamage: false, healing: false };
    return { player, own: false, badge: null, best: best as BoardColumn["best"], mvp: null };
}

function team(t: MatchTeam, columns: BoardColumn[]): BoardTeam {
    return { team: t, score: 0, won: false, result: null, totals: { kills: 0, souls: 0, playerDamage: 0 }, columns };
}

function board(): string {
    const boards = [
        team("hidden-king", [column(1, "hidden-king", "Ash", 1234), column(2, "hidden-king", "Botty", 0)]),
        team("archmother", [column(7, "archmother", "Wren", 5678)]),
    ];
    return render(TeamBoard, {
        props: { boards, heroes: {}, tiers: [], visuals: new Map(), bans: [], averageBadge: null },
    }).body;
}

function trigger(body: string, name: string): string | null {
    const label = `aria-label="Profile links for ${name}"`;
    return new RegExp(`<button[^>]*${label}[^>]*>[\\s\\S]*?</button>`).exec(body)?.[0] ?? null;
}

describe("TeamBoard player names", () => {
    it("opens the profile menu from each player's name", () => {
        const body = board();
        expect(trigger(body, "Ash")).not.toBeNull();
        expect(trigger(body, "Wren")).not.toBeNull();
    });

    it("shows a bot's or anonymous player's name as plain text", () => {
        const body = board();
        expect(trigger(body, "Botty")).toBeNull();
        expect(body).toMatch(/<span[^>]*title="Botty"[^>]*>Botty<\/span>/);
    });

    it("leaves only the name in the image export", () => {
        const button = trigger(board(), "Ash") ?? "";
        expect(button).toMatch(new RegExp(`<svg[^>]*${EXPORT_IGNORE_ATTR}`));
        const exported = button
            .replace(new RegExp(`<svg[^>]*${EXPORT_IGNORE_ATTR}[^>]*>[\\s\\S]*?</svg>`, "g"), "")
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<[^>]+>/g, "")
            .trim();
        expect(exported).toBe("Ash");
    });
});

describe("TeamBoard surface", () => {
    // An undefined custom property inside `background` drops the whole declaration, leaving the board see-through.
    it("colours the team bars from tokens every theme defines", () => {
        const tokens = readFileSync(
            fileURLToPath(new URL("../../../../../../../../packages/ui/src/theme-tokens.css", import.meta.url)),
            "utf8",
        );
        const rootBlock = /^:root \{([\s\S]*?)^\}/m.exec(tokens)?.[1] ?? "";
        const body = board();
        for (const side of ["left", "right"]) {
            const token = new RegExp(`--bar-${side}: var\\((--[\\w-]+)\\)`).exec(body)?.[1];
            expect(token, side).toBeDefined();
            expect(rootBlock, `${side} bar uses ${token}`).toContain(`${token}:`);
        }
    });
});
