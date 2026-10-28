import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en" }, t: (key: string) => key }));

import BarFrame from "./components/editor/ability-bar/bar-frame.svelte";
import type { HeroKit } from "./build-detail.svelte";

const track = createRawSnippet(() => ({ render: () => "<p>track</p>" }));
const icons = createRawSnippet(() => ({ render: () => "<p>icons</p>" }));

const frame = (kit: HeroKit | null) => render(BarFrame, { props: { kit, title: "Abilities", track, icons } }).body;

describe("BarFrame", () => {
    it("shows the loading skeleton while the kit is on its way", () => {
        expect(frame(null)).toContain('aria-busy="true"');
    });

    it("shows a calm error with Retry, not the skeleton, once the kit failed", () => {
        const body = frame({ abilities: new Map(), ultimateId: null, levels: [], failed: { retry: () => {} } });
        expect(body).not.toContain("aria-busy");
        expect(body).toContain('data-region-state="error"');
        expect(body).toContain('data-region="ability-order"');
        expect(body).toContain("region.retry");
    });
});
