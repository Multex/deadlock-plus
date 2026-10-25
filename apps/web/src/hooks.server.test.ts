import type { RequestEvent, ResolveOptions } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";

import { handle } from "./hooks.server";
import { PREPAINT_PLACEHOLDER, themePrepaint } from "$lib/content/themes";

describe("handle", () => {
    it("fills the theme pre-paint into every page", async () => {
        let options: ResolveOptions | undefined;
        const event = { url: new URL("https://deadlockplus.app/"), platform: undefined } as unknown as RequestEvent;

        await handle({
            event,
            resolve: async (_event, opts) => {
                options = opts;
                return new Response("");
            },
        });
        const html = await options?.transformPageChunk?.({ html: `<head>${PREPAINT_PLACEHOLDER}</head>`, done: true });

        expect(html).toBe(`<head>${themePrepaint()}</head>`);
    });
});
