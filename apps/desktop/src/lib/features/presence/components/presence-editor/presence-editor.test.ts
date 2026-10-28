import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { presenceConfigStore } from "$lib/features/presence/config.svelte";
import PresenceEditor from "./presence-editor.svelte";

const LOAD_COMMANDS = ["presence_config", "presence_defaults", "presence_layout", "presence_placeholders"] as const;

function healthy() {
    answers.clear();
    answers.set("presence_config", () => ({ states: {}, variants: {}, heroes: {} }));
    answers.set("presence_defaults", () => ({ states: { playing: { details: "x" } }, variants: {}, heroes: {} }));
    answers.set("presence_layout", () => [{ id: "playing", variants: [], heroScope: true }]);
    answers.set("presence_placeholders", () => [{ name: "hero", sensitive: false }]);
}

async function renderAfterLoad() {
    await presenceConfigStore.load();
    return render(PresenceEditor).body;
}

describe("presence editor load state", () => {
    beforeEach(healthy);

    it("shows the editor once every load answers", async () => {
        const body = await renderAfterLoad();
        expect(body).not.toContain('data-region-state="error"');
        expect(body).not.toContain("Loading...");
        expect(body).toContain('id="pe-hero"');
    });

    for (const name of LOAD_COMMANDS) {
        it(`shows a region error and no loading text when ${name} throws`, async () => {
            answers.set(name, () => {
                throw { code: "common.internal" };
            });
            const body = await renderAfterLoad();
            expect(body).toContain('data-region="presence-editor"');
            expect(body).toContain('data-region-state="error"');
            expect(body).toContain("Retry");
            expect(body).not.toContain("Loading...");
            expect(body).not.toContain("Check the log");
        });

        it(`shows a region error and no loading text when ${name} answers null`, async () => {
            answers.set(name, () => null);
            const body = await renderAfterLoad();
            expect(body).toContain('data-region="presence-editor"');
            expect(body).toContain('data-region-state="error"');
            expect(body).not.toContain("Loading...");
        });
    }

    it("retry reloads and shows the editor after a failure", async () => {
        answers.set("presence_layout", () => null);
        await presenceConfigStore.load();
        expect(presenceConfigStore.status).toBe("error");
        healthy();
        await presenceConfigStore.load();
        expect(presenceConfigStore.status).toBe("ready");
        expect(render(PresenceEditor).body).toContain('id="pe-hero"');
    });
});
