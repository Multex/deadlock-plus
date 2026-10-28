import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { state: {}, url: new URL("https://deadlockplus.app/") } }));
vi.mock("$app/navigation", () => ({ pushState: () => {} }));

import Shot from "./components/shot.svelte";
import { preloadAsset } from "./server/preload";

const SRC = join(import.meta.dirname, "..");
const SHOTS = join(SRC, "lib/assets/screenshots");

function img(body: string): string {
    return body.match(/<img[^>]*>/)?.[0] ?? "";
}

function files(dir: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: "utf8" })
        .map((name) => join(dir, name))
        .filter((path) => statSync(path).isFile());
}

describe("first load", () => {
    it("fetches the first screenshot on a page at high priority, and no other", () => {
        const hero = img(render(Shot, { props: { name: "match", label: "x", eager: true } }).body);
        expect(hero).toContain('fetchpriority="high"');
        expect(hero).toContain('loading="eager"');

        const rest = img(render(Shot, { props: { name: "stats", label: "x" } }).body);
        expect(rest).not.toContain("fetchpriority");
        expect(rest).toContain('loading="lazy"');
    });

    it("serves screenshots under hashed names, and a phone a small copy of the close-up", () => {
        const { body } = render(Shot, { props: { name: "match", detail: "match-mobile", label: "x" } });
        expect(body).not.toMatch(/"\/screenshots\//);
        expect(body).toMatch(/<source[^>]*srcset="[^"]*\/small\/match-mobile[^"]*\.webp"/);
    });

    it("keeps every screenshot within its byte budget", () => {
        for (const path of files(join(SHOTS, "small"))) expect(statSync(path).size, path).toBeLessThan(100_000);
        for (const path of files(SHOTS)) expect(statSync(path).size, path).toBeLessThan(250_000);
    });

    it("gives every phone close-up a small copy", () => {
        const full = readdirSync(SHOTS).filter((name) => name.endsWith("-mobile.webp"));
        expect(full.length).toBeGreaterThan(0);
        expect(readdirSync(join(SHOTS, "small")).sort()).toEqual(full.sort());
    });

    it("loads only WOFF2 fonts, never the desktop's full TTF and OTF files", () => {
        const css = files(SRC).filter((path) => path.endsWith(".css"));
        for (const path of css) {
            const text = readFileSync(path, "utf8");
            expect(text, path).not.toContain("@deadlock-plus/ui/fonts.css");
            for (const [, url] of text.matchAll(/url\(["']?([^"')]+)/g)) expect(url, path).toMatch(/\.woff2$/);
        }
    });

    it("preloads the faces above the fold and nothing else", () => {
        expect(preloadAsset({ type: "font", path: "/_app/immutable/assets/valveoracle-semibold.Ab1.woff2" })).toBe(
            true,
        );
        expect(preloadAsset({ type: "font", path: "/_app/immutable/assets/retaildemo-regular.Ab1.woff2" })).toBe(true);
        expect(preloadAsset({ type: "font", path: "/_app/immutable/assets/valvepulp-bold.Ab1.woff2" })).toBe(true);
        expect(preloadAsset({ type: "font", path: "/_app/immutable/assets/retaildemo-bold.Ab1.woff2" })).toBe(false);
        expect(preloadAsset({ type: "js", path: "/_app/immutable/chunks/a.js" })).toBe(true);
        expect(preloadAsset({ type: "css", path: "/_app/immutable/assets/0.css" })).toBe(true);
    });
});
