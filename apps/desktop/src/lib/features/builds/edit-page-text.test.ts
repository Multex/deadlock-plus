import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ untracked: 0, list: [] as { what: string; untracked: boolean }[] }));

// Vitest compiles Svelte for the server, where effects never run, so tracking is checked at `untrack` itself.
vi.mock("svelte", async (actual) => ({
    ...(await actual<typeof import("svelte")>()),
    untrack: <T>(fn: () => T): T => {
        reads.untracked++;
        try {
            return fn();
        } finally {
            reads.untracked--;
        }
    },
}));

vi.mock("$lib/core/i18n.svelte", () => ({
    i18n: {
        get locale() {
            reads.list.push({ what: "locale", untracked: reads.untracked > 0 });
            return "de";
        },
        onLocaleChange: () => () => {},
    },
    t: (key: string, params?: { name?: string }) => {
        reads.list.push({ what: key, untracked: reads.untracked > 0 });
        return params?.name ? `${key}:${params.name}` : key;
    },
}));

const { sessionText } = await import("./edit-page");

describe("sessionText", () => {
    beforeEach(() => {
        reads.list = [];
    });

    it("reads the locale untracked, so a language change does not reopen the editor and lose its undo", () => {
        const text = sessionText();
        expect(reads.list.map((r) => r.what)).toEqual(["locale", "builds.editor.first_category"]);
        expect(reads.list.every((r) => r.untracked)).toBe(true);
        expect(text.language).toBe(1);
        expect(text.categoryName).toBe("builds.editor.first_category");
    });

    it("names a copy in the language of the moment it is made", () => {
        expect(sessionText().copyName("Haze")).toBe("builds.mine.copy_name:Haze");
    });
});
