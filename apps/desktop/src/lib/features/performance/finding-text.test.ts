import { describe, expect, it, vi } from "vitest";
import type { Finding } from "./api";
import { findingText } from "./performance";

vi.mock("$lib/core/i18n.svelte", async (original) => ({
    ...(await original<typeof import("$lib/core/i18n.svelte")>()),
    t: (key: string, params?: Record<string, unknown>) => `${key} ${JSON.stringify(params ?? {})}`,
}));

const finding = (over: Partial<Finding> = {}): Finding => ({
    rule: "nulledNotCancelled",
    severity: "medium",
    function: "Update",
    line: 10,
    snippet: "handle = null;",
    ...over,
});

describe("findingText", () => {
    it("explains a cleared timer with the function name", () => {
        expect(findingText(finding({ function: "HideFeed" }))).toBe(
            'performance.findings.nulled_not_cancelled {"fn":"HideFeed"}',
        );
    });

    it("explains a timer that re-arms on an event with the function name", () => {
        expect(findingText(finding({ rule: "unguardedRearm", function: "RefreshFeed" }))).toBe(
            'performance.findings.unguarded_rearm {"fn":"RefreshFeed"}',
        );
    });
});
