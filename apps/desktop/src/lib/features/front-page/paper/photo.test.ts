import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Photo from "./photo.svelte";

const frame = (body: string) => /<div class="frame([^"]*)"/.exec(body)![1]!;

describe("Photo", () => {
    it("prints a placeholder plate while there is no picture to draw", () => {
        expect(frame(render(Photo, { props: { src: null, alt: "Haze" } }).body)).toContain("blank");
        expect(frame(render(Photo, { props: { src: "hero.webp", alt: "Haze" } }).body)).toContain("blank");
    });
});
