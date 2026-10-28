import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import StorageEntry from "./components/storage-entry.svelte";
import StorageSummary from "./components/storage-summary.svelte";

const noop = () => {};

describe("StorageEntry", () => {
    it("shows that the size couldn't be measured, with a retry, in place of the spinner", () => {
        const body = render(StorageEntry, {
            props: {
                entry: { id: "replays", path: "C:/x/replays", clearable: true },
                stats: undefined,
                failed: true,
                total: 0,
                now: 0,
                showPath: false,
                clearing: false,
                onretry: noop,
                onopen: noop,
                onreveal: noop,
                onclear: noop,
            },
        }).body;
        expect(body).toContain("Couldn't measure");
        expect(body).toContain("Retry");
        expect(body).not.toContain("animate-spin");
    });
});

describe("StorageSummary", () => {
    const summary = (incomplete: boolean) =>
        render(StorageSummary, { props: { total: 2048, incomplete, canClear: 0, disabled: true, onclear: noop } }).body;

    it("marks the total as a lower bound when some sizes couldn't be measured", () => {
        expect(summary(true)).toContain("At least 2.0 KB");
    });

    it("shows the plain total when every size was measured", () => {
        expect(summary(false)).not.toContain("At least");
        expect(summary(false)).toContain("2.0 KB");
    });
});
