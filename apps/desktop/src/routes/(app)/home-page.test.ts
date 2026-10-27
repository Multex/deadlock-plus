import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async () => {
        throw { code: "common.internal" };
    }),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { alerts } from "$lib/features/alerts/alerts.svelte";
import type { Alert } from "$lib/features/alerts/alerts";
import { stats } from "$lib/features/stats/stats.svelte";
import { steamAccount, type SteamAccount } from "$lib/features/steam-account/account.svelte";
import HomePage from "./+page.svelte";

const text = (html: string) =>
    html
        .replace(/<!--.*?-->/gs, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const errorRegions = (html: string) =>
    [...html.matchAll(/data-region="([^"]+)"[^>]*data-region-state="error"/g)].map((m) => m[1]);

const throwing = <T>(field: string): T =>
    ({
        get [field]() {
            throw new Error(`${field} broke`);
        },
    }) as T;

function renderHome() {
    return render(HomePage, { transformError: (e) => e }).body;
}

describe("Home regions", () => {
    beforeEach(() => {
        steamAccount.account = null;
        steamAccount.loaded = true;
        alerts.items = [{ title: "Patch notes", published: "2026-10-20T00:00:00Z" } as Alert];
        alerts.status = "ready";
        stats.status = "ready";
    });

    it("renders every region with no error when the data is healthy", () => {
        const body = renderHome();
        expect(errorRegions(body)).toEqual([]);
        expect(text(body)).toContain("Patch notes");
        expect(text(body)).toContain("Last session");
    });

    it("says the latest update couldn't load when the alerts store failed, not that there is nothing", () => {
        alerts.items = [];
        alerts.status = "error";
        const body = text(renderHome());
        expect(body).toContain("Couldn't load. Try again later.");
        expect(body).not.toContain("Nothing yet. Open News to check.");
        expect(body).not.toContain("Loading...");
    });

    it("shows no Loading... on any card once the stats and alerts loads failed", () => {
        alerts.items = [];
        alerts.status = "error";
        stats.status = "error";
        expect(text(renderHome())).not.toContain("Loading...");
    });

    it("keeps the other cards when the latest update card crashes", () => {
        alerts.items = [throwing<Alert>("title")];
        const body = renderHome();
        expect(errorRegions(body)).toEqual(["home-update"]);
        expect(text(body)).toContain("Rank");
        expect(text(body)).toContain("Recent form");
        expect(text(body)).toContain("Last session");
        expect(text(body)).toContain("Blocked regions");
    });

    it("keeps the cards and tiles when the greeting crashes", () => {
        steamAccount.account = throwing<SteamAccount>("personaName");
        const body = renderHome();
        expect(errorRegions(body)).toContain("home-header");
        expect(errorRegions(body)).not.toContain("home-update");
        expect(text(body)).toContain("Patch notes");
        expect(text(body)).toContain("Blocked regions");
    });
});
