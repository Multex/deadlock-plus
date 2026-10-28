import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/log", () => ({
    debug: vi.fn(() => Promise.resolve()),
    error: vi.fn(() => Promise.resolve()),
    info: vi.fn(() => Promise.resolve()),
    warn: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/features/crash/api", () => ({ reportWebviewCrash: vi.fn(() => Promise.resolve()) }));

import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { error } from "$lib/core/log";
import { reportWebviewCrash } from "$lib/features/crash/api";
import AppRegion, { logRegionError } from "$lib/shell/app-region.svelte";

const text = (html: string) =>
    html
        .replace(/<!--.*?-->/gs, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const fine = createRawSnippet(() => ({ render: () => "<p>page content</p>" }));
const broken = createRawSnippet(() => ({
    render: () => {
        throw new Error("render broke");
    },
}));

const renderRegion = (props: Record<string, unknown>) =>
    render(AppRegion, { props: { name: "page", ...props } as never, transformError: (e) => e }).body;

afterEach(() => vi.clearAllMocks());

describe("AppRegion", () => {
    it("renders its children when nothing throws", () => {
        const body = renderRegion({ children: fine });
        expect(text(body)).toBe("page content");
        expect(body).not.toMatch(/data-region-state/);
    });

    it("falls back to the shared region copy", () => {
        const body = renderRegion({ children: broken });
        expect(text(body)).toContain("Couldn't load this part.");
        expect(text(body)).toContain("The rest of Deadlock+ still works.");
        expect(body).toMatch(/data-region="page"/);
        expect(body).toMatch(/data-region-state="error"/);
    });

    it("shows the copy it is given", () => {
        const body = renderRegion({ children: broken, title: "Couldn't show this page.", body: "Other pages work." });
        expect(text(body)).toContain("Couldn't show this page.");
        expect(text(body)).toContain("Other pages work.");
        expect(text(body)).not.toContain("Couldn't load this part.");
    });

    it("renders nothing at all in quiet mode", () => {
        const body = renderRegion({ children: broken, quiet: true });
        expect(text(body)).toBe("");
        expect(body).not.toMatch(/data-region/);
    });
});

describe("logRegionError", () => {
    it("logs one line with the region name, message and stack", () => {
        const failure = new Error("render broke");
        logRegionError(failure, "sidebar");
        expect(error).toHaveBeenCalledTimes(1);
        const line = vi.mocked(error).mock.calls[0][0];
        expect(line).toContain("sidebar");
        expect(line).toContain("render broke");
        expect(line).toContain(failure.stack!.split("\n")[1].trim());
    });

    it("logs a thrown non-Error value", () => {
        logRegionError({ code: "common.internal" }, "decor");
        expect(vi.mocked(error).mock.calls[0][0]).toMatch(/decor.*common\.internal/);
    });

    it("never leaves a crash marker", () => {
        logRegionError(new Error("x"), "page");
        expect(reportWebviewCrash).not.toHaveBeenCalled();
    });
});
