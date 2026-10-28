import { describe, expect, it } from "vitest";
import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import ArtImage from "@deadlock-plus/ui/art-image.svelte";

const text = (html: string) =>
    html
        .replace(/<!--.*?-->/gs, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const placeholderTag = (html: string) => html.match(/<[a-z]+[^>]*data-art-state="fallback"[^>]*>/)?.[0] ?? "";

describe("ArtImage", () => {
    it("renders the img with every attribute the caller passes", () => {
        const { body } = render(ArtImage, {
            props: {
                src: "https://assets/hero.png",
                alt: "Haze",
                label: "Haze",
                class: "size-12 rounded-md",
                width: 48,
                height: 48,
                loading: "lazy",
                "data-testid": "hero-art",
            },
        });
        const img = body.match(/<img[^>]*>/)?.[0] ?? "";
        expect(img).toMatch(/src="https:\/\/assets\/hero.png"/);
        expect(img).toMatch(/alt="Haze"/);
        expect(img).toMatch(/class="size-12 rounded-md"/);
        expect(img).toMatch(/width="48"/);
        expect(img).toMatch(/height="48"/);
        expect(img).toMatch(/loading="lazy"/);
        expect(img).toMatch(/data-testid="hero-art"/);
        expect(body).not.toMatch(/data-art-state="fallback"/);
    });

    it.each([undefined, null, ""])("shows initials in the same box when src is %j", (src) => {
        const { body } = render(ArtImage, {
            props: { src, alt: "Lady Geist", label: "Lady Geist", class: "size-12 rounded-md", width: 48, height: 48 },
        });
        expect(body).not.toMatch(/<img/);
        const tag = placeholderTag(body);
        expect(tag).toMatch(/size-12/);
        expect(tag).toMatch(/rounded-md/);
        expect(tag).toMatch(/width:\s*48px/);
        expect(tag).toMatch(/height:\s*48px/);
        expect(tag).toMatch(/role="img"/);
        expect(tag).toMatch(/aria-label="Lady Geist"/);
        expect(text(body)).toBe("LG");
    });

    it("caps initials at two letters and skips punctuation", () => {
        const { body } = render(ArtImage, { props: { src: undefined, alt: "", label: "“Mo” & Krill Extra" } });
        expect(text(body)).toBe("MK");
    });

    it("hides a decorative placeholder from screen readers", () => {
        const { body } = render(ArtImage, { props: { src: undefined, alt: "", label: "Haze" } });
        const tag = placeholderTag(body);
        expect(tag).toMatch(/aria-hidden="true"/);
        expect(tag).not.toMatch(/role="img"/);
        expect(tag).not.toMatch(/aria-label/);
    });

    it("shows a plain tinted block without a label", () => {
        const { body } = render(ArtImage, { props: { src: undefined, alt: "Item", class: "size-8" } });
        expect(placeholderTag(body)).toMatch(/size-8/);
        expect(text(body)).toBe("");
    });

    it("prefers the fallback snippet over initials", () => {
        const fallback = createRawSnippet(() => ({ render: () => "<span>icon</span>" }));
        const { body } = render(ArtImage, { props: { src: undefined, alt: "", label: "Haze", fallback } });
        expect(text(body)).toBe("icon");
    });
});
