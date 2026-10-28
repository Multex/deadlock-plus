import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";

const items = [
    { value: "", label: "All heroes" },
    { value: "1", label: "Abrams" },
];

const trigger = (props: Record<string, unknown>) =>
    render(SelectMenu, { props: { items, value: "", ...props } }).body.match(
        /<button[^>]*data-select-trigger[^>]*>/,
    )?.[0] ?? "";

describe("SelectMenu trigger", () => {
    // A combobox is named by its field, not by the value it shows, so the label can differ from the visible text.
    it("is a combobox named by its field label", () => {
        const tag = trigger({ "aria-label": "Hero" });
        expect(tag).toMatch(/role="combobox"/);
        expect(tag).toMatch(/aria-label="Hero"/);
    });

    it("stays a combobox when an outside label names it", () => {
        const tag = trigger({ "aria-labelledby": "language-label" });
        expect(tag).toMatch(/role="combobox"/);
        expect(tag).toMatch(/aria-labelledby="language-label"/);
    });
});
