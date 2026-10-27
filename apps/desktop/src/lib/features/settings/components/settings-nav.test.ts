import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

vi.mock("$app/state", () => ({ page: { params: { category: "appearance" } } }));

const { default: SettingsNav } = await import("./settings-nav.svelte");

const backButton = (collapsed: boolean) => {
    const body = render(SettingsNav, { props: { collapsed, onback: () => {} } }).body;
    const start = body.lastIndexOf("<button");
    return body.slice(start, body.indexOf("</button>", start));
};

describe("settings nav back button", () => {
    it("is named by its visible text when the nav is open", () => {
        const button = backButton(false);
        expect(button).not.toMatch(/aria-label=/);
        expect(button).toMatch(/>Back</);
        expect(button).toMatch(/<kbd[^>]*aria-hidden="true"/);
        expect(button).toMatch(/aria-keyshortcuts="Escape"/);
    });

    it("keeps a label when collapsed to its icon", () => {
        expect(backButton(true)).toMatch(/aria-label="Back"/);
    });
});
