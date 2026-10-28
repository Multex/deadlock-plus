import type { RequestEvent, ResolveOptions } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LANG_PLACEHOLDER, handle } from "./hooks.server";
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

    it.each([
        ["/", "en"],
        ["/de/features", "de"],
        ["/pt-BR", "pt-BR"],
        ["/privacy", "en"],
    ])("names the language of %s on the html tag", async (path, lang) => {
        let options: ResolveOptions | undefined;
        const event = {
            url: new URL(`https://deadlockplus.app${path}`),
            platform: undefined,
        } as unknown as RequestEvent;

        await handle({
            event,
            resolve: async (_event, opts) => {
                options = opts;
                return new Response("");
            },
        });
        const html = await options?.transformPageChunk?.({ html: `<html lang="${LANG_PLACEHOLDER}">`, done: true });

        expect(html).toBe(`<html lang="${lang}">`);
    });
});

describe("app.html", () => {
    it("leaves the html tag's language for the server to fill", () => {
        const html = readFileSync(fileURLToPath(new URL("./app.html", import.meta.url)), "utf8");
        expect(html).toContain(`<html lang="${LANG_PLACEHOLDER}">`);
    });
});
