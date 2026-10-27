import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { emptyStateVariants } from "@deadlock-plus/ui/empty-state.svelte";
import RegionError from "@deadlock-plus/ui/region-error.svelte";
import BoundaryFixture from "./boundary-fixture.svelte";

const text = (html: string) =>
    html
        .replace(/<!--.*?-->/gs, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const classesOf = (html: string, selector: RegExp) => {
    const tag = html.match(selector)?.[0] ?? "";
    return new Set((tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean));
};

const regionTag = /<[a-z]+[^>]*data-region-state="error"[^>]*>/;

describe("RegionError", () => {
    const base = { name: "matches", title: "Couldn't load your matches.", body: "The rest of the page still works." };

    it("renders the title and body, marked with the region name and the error state", () => {
        const { body } = render(RegionError, { props: base });
        expect(text(body)).toContain("Couldn't load your matches.");
        expect(text(body)).toContain("The rest of the page still works.");
        expect(body).toMatch(/data-region="matches"/);
        expect(body).toMatch(/data-region-state="error"/);
    });

    it("stays calm: no alert role", () => {
        const { body } = render(RegionError, { props: base });
        expect(body).not.toMatch(/role="alert"/);
    });

    it("shows no button without onretry, even with a label", () => {
        const { body } = render(RegionError, { props: { ...base, retryLabel: "Retry" } });
        expect(body).not.toMatch(/<button/);
    });

    it("shows a Retry button with the given label when onretry is set", () => {
        const { body } = render(RegionError, { props: { ...base, retryLabel: "Retry", onretry: () => {} } });
        const button = body.match(/<button[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
        expect(text(button)).toBe("Retry");
    });

    it.each([
        ["sm", emptyStateVariants({ size: "sm", spacing: "md" })],
        ["md", emptyStateVariants({ size: "base", spacing: "xl" })],
    ] as const)("takes the EmptyState footprint at size %s", (size, expected) => {
        const { body } = render(RegionError, { props: { ...base, size } });
        const classes = classesOf(body, regionTag);
        for (const c of expected.split(/\s+/)) expect(classes).toContain(c);
    });

    it("defaults to the md footprint", () => {
        const { body } = render(RegionError, { props: base });
        expect(classesOf(body, regionTag)).toContain("py-16");
    });
});

describe("RegionBoundary", () => {
    it("renders its children when nothing throws", () => {
        const { body } = render(BoundaryFixture, { props: { fail: () => null } });
        expect(text(body)).toContain("child content");
        expect(body).not.toMatch(/data-region-state="error"/);
    });

    it("shows RegionError for a child that throws during render, and the sibling keeps rendering", () => {
        const { body } = render(BoundaryFixture, {
            props: { fail: () => "render" as const },
            transformError: (e) => e,
        });
        expect(text(body)).not.toContain("child content");
        expect(text(body)).toContain("sibling content");
        expect(text(body)).toContain("Couldn't load your matches.");
        expect(body).toMatch(/data-region="matches"/);
        expect(body).toMatch(/data-region-state="error"/);
    });
});
