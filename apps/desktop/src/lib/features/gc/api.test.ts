import { beforeEach, describe, expect, it, vi } from "vitest";

let answer: unknown;
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(async () => answer) }));

const { matchDetailCoverage } = await import("./api");

describe("matchDetailCoverage", () => {
    beforeEach(() => (answer = undefined));

    it("passes a well formed answer through", async () => {
        answer = { withDetails: [1], withReplay: [] };
        await expect(matchDetailCoverage([1])).resolves.toEqual({ withDetails: [1], withReplay: [] });
    });

    it.each([
        ["null", null],
        ["a string", "garbage"],
        ["missing lists", {}],
        ["a list of strings", { withDetails: ["1"], withReplay: [] }],
        ["a missing replay list", { withDetails: [1] }],
    ])("rejects %s as a normal failure", async (_, bad) => {
        answer = bad;
        await expect(matchDetailCoverage([1])).rejects.toThrow("match_detail_coverage answered an unexpected shape");
    });
});
