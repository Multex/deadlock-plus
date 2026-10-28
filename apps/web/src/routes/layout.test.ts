import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ page: { url: new URL("https://deadlockplus.app/"), status: 200 } }));
vi.mock("$app/state", () => state);

import type { Catalog } from "$lib/i18n";
import Layout from "./+layout.svelte";

const children = createRawSnippet(() => ({ render: () => "<p>page</p>" }));

function layout(path: string, data: { locale: string; catalogs: Record<string, Catalog> }): string {
    state.page.url = new URL(`https://deadlockplus.app${path}`);
    return render(Layout, { props: { children, data } }).body;
}

describe("the site layout", () => {
    it("adds no headings to the page outline from its footer", () => {
        const body = layout("/", { locale: "en", catalogs: {} });
        const footer = body.slice(body.indexOf("<footer"));

        expect(footer).toContain("Community");
        expect(footer).not.toMatch(/<h[1-6][\s>]/);
    });
});

describe("the language picker", () => {
    it("sits in the footer beside the theme picker", () => {
        const body = layout("/features", { locale: "en", catalogs: {} });
        const footer = body.slice(body.indexOf("<footer"));
        expect(footer).toContain("Theme");
        expect(footer).toContain('aria-label="Language: English"');
    });
});

describe("the theme picker", () => {
    it("links every theme's page from the footer", () => {
        const body = layout("/", { locale: "en", catalogs: {} });
        const footer = body.slice(body.indexOf("<footer"));
        expect(footer.replace(/<!--.*?-->/g, "")).toMatch(/href="\/themes"[^>]*>[^<]*All themes\s*</);
    });
});

describe("the layout in another language", () => {
    const body = layout("/de/features", {
        locale: "de",
        catalogs: { de: { nav: { features: "Funktionen", faq: "" } } },
    });

    it("shows the page's language, and English where a string is not translated yet", () => {
        expect(body).toContain("Funktionen");
        expect(body.replace(/<!--.*?-->/g, "")).toMatch(/href="\/de\/faq"[^>]*>\s*FAQ\s*</);
    });

    it("links the localized pages in the same language", () => {
        for (const path of ["/de", "/de/features", "/de/download", "/de/faq", "/de/themes"])
            expect(body).toContain(`href="${path}"`);
        expect(body).not.toContain('href="/features"');
    });

    it("links the English-only pages in English", () => {
        expect(body).toContain('href="/privacy"');
        expect(body).toContain('href="/transparency"');
    });

    it("marks the open page in the main navigation", () => {
        expect(body).toMatch(/href="\/de\/features"[^>]*aria-current="page"/);
    });
});
