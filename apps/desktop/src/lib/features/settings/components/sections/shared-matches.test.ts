import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { sharedMatches } from "$lib/features/ingest/shared.svelte";
import SharedMatches from "./shared-matches.svelte";

const ROW = { matchId: 555, at: 1_700_000_000, source: "steam", details: true, replay: false };

describe("settings sharing list", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("shared_matches", () => [ROW]);
    });

    it("lists shared matches", async () => {
        await sharedMatches.refresh();
        const body = render(SharedMatches).body;
        expect(body).toContain("555");
        expect(body).not.toContain('data-region-state="error"');
    });

    it("shows the real empty state, not an error, for an empty list", async () => {
        answers.set("shared_matches", () => []);
        await sharedMatches.refresh();
        const body = render(SharedMatches).body;
        expect(body).not.toContain('data-region-state="error"');
        expect(body).not.toContain("Retry");
    });

    it("shows a calm error with Retry when shared_matches throws", async () => {
        answers.set("shared_matches", () => {
            throw { code: "common.internal" };
        });
        await sharedMatches.refresh();
        const body = render(SharedMatches).body;
        expect(body).toContain('data-region="shared-matches"');
        expect(body).toContain('data-region-state="error"');
        expect(body).toContain("Retry");
    });

    it("shows the error when shared_matches answers null", async () => {
        answers.set("shared_matches", () => null);
        await sharedMatches.refresh();
        expect(render(SharedMatches).body).toContain('data-region-state="error"');
    });

    it("clears the error after a good refresh", async () => {
        answers.set("shared_matches", () => null);
        await sharedMatches.refresh();
        answers.set("shared_matches", () => [ROW]);
        await sharedMatches.refresh();
        const body = render(SharedMatches).body;
        expect(body).not.toContain('data-region-state="error"');
        expect(body).toContain("555");
    });
});
