import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async () => undefined),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import SyntaxCard from "./syntax-card.svelte";

const placeholders = [{ name: "hero", sensitive: false }];

describe("syntax card variable list", () => {
    it("shows the variables when ready", () => {
        const body = render(SyntaxCard, { props: { placeholders, status: "ready", onretry: () => {} } }).body;
        expect(body).toContain("{hero}");
        expect(body).not.toContain('data-region-state="error"');
    });

    it("shows a small region error with Retry when the load failed", () => {
        const body = render(SyntaxCard, { props: { placeholders: [], status: "error", onretry: () => {} } }).body;
        expect(body).toContain('data-region="presence-syntax"');
        expect(body).toContain('data-region-state="error"');
        expect(body).toContain("Retry");
    });

    it("shows no error and no empty list while loading", () => {
        const body = render(SyntaxCard, { props: { placeholders: [], status: "loading", onretry: () => {} } }).body;
        expect(body).not.toContain('data-region-state="error"');
        expect(body).not.toContain("<table");
    });
});
