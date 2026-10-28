import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
import AnnouncementStack from "./announcement-stack.svelte";

const item = (id: string, severity: Announcement["severity"], extra: Partial<Announcement> = {}): Announcement => ({
    id,
    title: `Title ${id}`,
    body: `Body ${id}`,
    severity,
    link: null,
    ...extra,
});

const html = (items: Announcement[]) =>
    render(AnnouncementStack, { props: { items, ondismiss: () => {}, onopen: () => {} } }).body;

const blocks = (body: string) => [...body.matchAll(/<div\b[^>]*\bdata-announcement="([^"]+)"[^>]*>/g)];

describe("announcement stack", () => {
    it("renders nothing without items", () => {
        expect(blocks(html([]))).toEqual([]);
    });

    it("announces critical items as an alert and the rest as a status", () => {
        const body = html([item("c", "critical"), item("w", "warning"), item("i", "info")]);
        const roles = blocks(body).map(([tag, id]) => [id, tag.match(/\brole="([^"]+)"/)?.[1]]);
        expect(roles).toEqual([
            ["c", "alert"],
            ["w", "status"],
            ["i", "status"],
        ]);
    });

    it("offers a dismiss button on info and warning items only", () => {
        const dismiss = (body: string) => (body.match(/aria-label="Hide this notice"/g) ?? []).length;
        expect(dismiss(html([item("c", "critical")]))).toBe(0);
        expect(dismiss(html([item("w", "warning")]))).toBe(1);
        expect(dismiss(html([item("i", "info")]))).toBe(1);
    });

    it("shows the text as plain text and keeps the body's line breaks", () => {
        const body = html([item("x", "info", { title: "<b>bold</b>", body: "line one\nline two <script>x</script>" })]);
        expect(body).not.toContain("<b>bold</b>");
        expect(body).not.toContain("<script>x</script>");
        expect(body).toContain("&lt;b>bold&lt;/b>");
        expect(body).toContain("line one\nline two");
        expect(body).toMatch(/class="[^"]*whitespace-pre-line[^"]*"[^>]*>line one/);
    });

    it("shows the link as a button labelled from the feed", () => {
        const body = html([item("l", "info", { link: { url: "https://deadlockplus.app/x", label: "Read more" } })]);
        expect(body).toMatch(/<button\b[^>]*>[\s\S]*Read more[\s\S]*<\/button>/);
        expect(body).not.toContain("href=");
    });
});
