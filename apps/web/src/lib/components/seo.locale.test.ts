import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";
import { WEB_LOCALES } from "@deadlock-plus/links";

const state = vi.hoisted(() => ({ page: { url: new URL("https://deadlockplus.app/"), status: 200 } }));
vi.mock("$app/state", () => state);

import Seo from "./seo.svelte";

function head(path: string, props: Record<string, unknown> = {}): string {
    state.page.url = new URL(`https://deadlockplus.app${path}`);
    return render(Seo, { props: { title: "x", ...props } }).head;
}

const alternates = (html: string) =>
    Object.fromEntries(
        [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );

const canonical = (html: string) => html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

describe("hreflang alternates", () => {
    it("list the page in English, every locale, and English as the default", () => {
        const links = alternates(head("/de/faq"));
        expect(Object.keys(links).sort()).toEqual(["en", ...WEB_LOCALES, "x-default"].sort());
        expect(links.en).toBe("https://deadlockplus.app/faq");
        expect(links["x-default"]).toBe("https://deadlockplus.app/faq");
        expect(links.de).toBe("https://deadlockplus.app/de/faq");
        expect(links["pt-BR"]).toBe("https://deadlockplus.app/pt-BR/faq");
    });

    it("are the same set on the English page and on each translation", () => {
        expect(alternates(head("/faq"))).toEqual(alternates(head("/ja/faq")));
        expect(alternates(head("/")).de).toBe("https://deadlockplus.app/de");
        expect(alternates(head("/")).en).toBe("https://deadlockplus.app/");
    });

    it("are left off the English-only pages and pages kept out of search", () => {
        expect(alternates(head("/privacy"))).toEqual({});
        expect(alternates(head("/transparency"))).toEqual({});
        expect(alternates(head("/de/faq", { noindex: true }))).toEqual({});
    });
});

describe("canonical address", () => {
    it("points each language at its own page", () => {
        expect(canonical(head("/de/features"))).toBe("https://deadlockplus.app/de/features");
        expect(canonical(head("/features"))).toBe("https://deadlockplus.app/features");
        expect(canonical(head("/zh-TW"))).toBe("https://deadlockplus.app/zh-TW");
    });
});
