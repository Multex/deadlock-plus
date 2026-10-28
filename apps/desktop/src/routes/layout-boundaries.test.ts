import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/log", () => ({
    debug: vi.fn(() => Promise.resolve()),
    error: vi.fn(() => Promise.resolve()),
    info: vi.fn(() => Promise.resolve()),
    warn: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/features/crash/api", () => ({ reportWebviewCrash: vi.fn(() => Promise.resolve()) }));
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/onboarding") } }));

import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import StandaloneLayout from "./(standalone)/+layout.svelte";

const text = (html: string) =>
    html
        .replace(/<!--.*?-->/gs, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const broken = createRawSnippet(() => ({
    render: () => {
        throw new Error("onboarding broke");
    },
}));

describe("standalone layout", () => {
    it("keeps the frame and shows a calm error when the page throws", () => {
        const { body } = render(StandaloneLayout, { props: { children: broken }, transformError: (e) => e });
        expect(body).toMatch(/data-region="page"/);
        expect(body).toMatch(/data-region-state="error"/);
        expect(text(body)).toContain("Couldn't show this page.");
    });
});

describe("root layout", () => {
    it("wraps the toaster in a quiet region so a broken toast cannot take the shell down", () => {
        const source = readFileSync(new URL("./+layout.svelte", import.meta.url), "utf8");
        expect(source).toMatch(/<AppRegion name="toaster" quiet>\s*<Toaster[\s\S]*?\/>\s*<\/AppRegion>/);
    });
});
