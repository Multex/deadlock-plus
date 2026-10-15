import type { Component } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { url: new URL("https://deadlockplus.app/"), status: 200, state: {} } }));

import Download from "./download/+page.svelte";
import Features from "./features/+page.svelte";
import Home from "./+page.svelte";
import Privacy from "./privacy/+page.svelte";
import Transparency from "./transparency/+page.svelte";

const PAGES: [string, Component<any>, Record<string, unknown>][] = [
    ["/", Home, {}],
    ["/features", Features, {}],
    ["/download", Download, { data: { releases: [] } }],
    ["/privacy", Privacy, {}],
    ["/transparency", Transparency, { data: { stats: {}, costs: null } }],
];

const text = (html: string) =>
    html
        .replace(/<!--.*?-->/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();

function meta(page: Component<any>, props: Record<string, unknown>) {
    const { head, body } = render(page, { props });
    return {
        title: text(head.match(/<title>(.*?)<\/title>/s)?.[1] ?? ""),
        description: head.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "",
        h1: text(body.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? ""),
    };
}

const all = PAGES.map(([path, page, props]) => ({ path, ...meta(page, props) }));

describe("page titles and headings", () => {
    it.each([
        ["/", "Deadlock+ | Discord Rich Presence and Stats for Deadlock"],
        ["/features", "Rich Presence, Server Picker, Match History | Deadlock+"],
        ["/download", "Download Deadlock+ for Windows and Linux (Free)"],
    ])("titles %s for the searches it should answer", (path, title) => {
        expect(all.find((page) => page.path === path)?.title).toBe(title);
    });

    it.each([
        ["/features", "Deadlock+ features"],
        ["/download", "Download Deadlock+"],
    ])("names Deadlock+ in the %s heading", (path, h1) => {
        expect(all.find((page) => page.path === path)?.h1).toBe(h1);
    });

    it.each(all)("gives $path a title search results show in full", ({ title }) => {
        expect(title).toContain("Deadlock+");
        expect(title.length).toBeLessThanOrEqual(60);
    });

    it.each(all)("gives $path a description search results show in full", ({ description }) => {
        expect(description.length).toBeGreaterThanOrEqual(70);
        expect(description.length).toBeLessThanOrEqual(160);
    });

    it("never repeats a title or a description", () => {
        expect(new Set(all.map((page) => page.title)).size).toBe(all.length);
        expect(new Set(all.map((page) => page.description)).size).toBe(all.length);
    });
});
