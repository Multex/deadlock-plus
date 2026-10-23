import { describe, expect, it, vi } from "vitest";
import { t } from "$lib/core/i18n.svelte";
import { bylineAuthor } from "./byline-author";

describe("bylineAuthor", () => {
    it("is nothing while the author's name is unknown", () => {
        expect(bylineAuthor(42, undefined, () => {})).toBeNull();
    });

    it("is plain text for an author without an account", () => {
        expect(bylineAuthor(0, "Anon", () => {})).toBe(t("builds.browser.by", { name: "Anon" }));
    });

    it("is a filter link that reads as the translated byline", () => {
        const pick = vi.fn();
        const part = bylineAuthor(42, "Ash", pick);
        if (part === null || typeof part === "string") throw new Error("expected an author link");
        expect(part.accountId).toBe(42);
        expect(part.name).toBe("Ash");
        expect(`${part.before}${part.name}${part.after}`).toBe(t("builds.browser.by", { name: "Ash" }));
        part.pick();
        expect(pick).toHaveBeenCalledOnce();
    });
});
