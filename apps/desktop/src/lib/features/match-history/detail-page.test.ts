import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const MATCH_ID = 31_415_926;

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async () => null),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));
vi.mock("$app/state", () => ({ page: { params: { id: "31415926" } } }));
vi.mock("$lib/features/steam-account/account.svelte", () => ({
    steamAccount: { loaded: true, account: { steamId32: 90210 } },
}));

import { matchHistory } from "./history.svelte";
import DetailPage from "../../../routes/(app)/match-history/[id]/+page.svelte";

const FAULTS = {
    "503": async () => new Response("", { status: 503 }),
    "429": async () => new Response("", { status: 429, headers: { "retry-after": "12" } }),
    drop: async () => {
        throw new TypeError("Failed to fetch");
    },
} as const;
type Fault = keyof typeof FAULTS;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});

afterEach(() => {
    matchHistory.closeDetail();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe.each(Object.keys(FAULTS) as Fault[])("opening a match during an outage (%s)", (fault) => {
    const state = fault === "drop" ? "error" : "busy";

    it("keeps the page frame and shows the match region's own state", async () => {
        vi.stubGlobal("fetch", vi.fn(FAULTS[fault]));
        await matchHistory.openDetail(MATCH_ID);
        const body = render(DetailPage).body;

        expect(body).toContain('href="/match-history"');
        expect(body).toContain(String(MATCH_ID));
        expect(body).toContain(`data-region="match-detail" data-region-state="${state}"`);
        expect(body).not.toContain("Could not load this match.");
        expect(body).toContain(fault === "drop" ? "Retry" : "Deadlock API is busy");
    });
});
