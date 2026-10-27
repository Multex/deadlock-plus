import { describe, expect, it, vi } from "vitest";

const { answer } = vi.hoisted(() => ({ answer: { value: undefined as unknown } }));
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(async () => answer.value) }));

import { presenceConfig, presenceDefaults, presenceLayout, presencePlaceholders } from "./api";

const config = { states: {}, variants: {}, heroes: {} };
const layout = [{ id: "playing", variants: [], heroScope: true }];
const placeholders = [{ name: "hero", sensitive: false }];

const cases = [
    { name: "presenceConfig", call: presenceConfig, good: config, drifted: { states: {} } },
    {
        name: "presenceDefaults",
        call: presenceDefaults,
        good: config,
        drifted: { states: [], variants: {}, heroes: {} },
    },
    { name: "presenceLayout", call: presenceLayout, good: layout, drifted: [{ id: "playing" }] },
    { name: "presencePlaceholders", call: presencePlaceholders, good: placeholders, drifted: [{ name: 1 }] },
];

describe("presence load commands", () => {
    for (const c of cases) {
        it(`${c.name} passes a well-formed answer through`, async () => {
            answer.value = c.good;
            await expect(c.call()).resolves.toEqual(c.good);
        });

        it(`${c.name} rejects null`, async () => {
            answer.value = null;
            await expect(c.call()).rejects.toThrow();
        });

        it(`${c.name} rejects a drifted shape`, async () => {
            answer.value = c.drifted;
            await expect(c.call()).rejects.toThrow();
        });
    }

    it("presenceLayout rejects an empty list, since the editor has nothing to show", async () => {
        answer.value = [];
        await expect(presenceLayout()).rejects.toThrow();
    });
});
