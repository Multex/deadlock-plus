import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
}));

import { detectExternalBlocks, fetchServerGroups, getGameDefinitions, pingServerGroups } from "./api";

describe("server picker api shape checks", () => {
    beforeEach(() => answers.clear());

    it("getGameDefinitions rejects a non-list", async () => {
        answers.set("get_game_definitions", () => null);
        await expect(getGameDefinitions()).rejects.toBeDefined();
    });

    it("fetchServerGroups rejects null and a body without the lists", async () => {
        answers.set("fetch_server_groups", () => null);
        await expect(fetchServerGroups("g")).rejects.toBeDefined();
        answers.set("fetch_server_groups", () => ({ clustered: [] }));
        await expect(fetchServerGroups("g")).rejects.toBeDefined();
    });

    it("fetchServerGroups passes a good body through", async () => {
        const data = { clustered: [], unclustered: [] };
        answers.set("fetch_server_groups", () => data);
        await expect(fetchServerGroups("g")).resolves.toEqual(data);
    });

    it("pingServerGroups rejects null", async () => {
        answers.set("ping_server_groups", () => null);
        await expect(pingServerGroups([])).rejects.toBeDefined();
    });

    it.each([
        ["null", null],
        ["garbage", { garbage: true }],
        ["a scan without the covered ids", { ruleNames: [], sources: [] }],
    ])("detectExternalBlocks rejects %s", async (_, answer) => {
        answers.set("detect_external_blocks", () => answer);
        await expect(detectExternalBlocks("g")).rejects.toBeDefined();
    });

    it("detectExternalBlocks passes a good scan through", async () => {
        const scan = { ruleNames: ["r"], sources: ["s"], coveredGroupIds: ["ams"] };
        answers.set("detect_external_blocks", () => scan);
        await expect(detectExternalBlocks("g")).resolves.toEqual(scan);
    });
});
