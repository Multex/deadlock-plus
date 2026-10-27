import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { OverlayToast } from "@deadlock-plus/ipc-types/OverlayToast";
import OverlayLayer from "./components/overlay-layer.svelte";
import { NO_TOASTS, show } from "./toasts";

function toast(id: string, overrides: Partial<OverlayToast> = {}): OverlayToast {
    return {
        id,
        kind: "alert",
        title: `Title ${id}`,
        body: `Body ${id}`,
        placement: "corner",
        position: "topRight",
        durationMs: 6000,
        ...overrides,
    };
}

const unprintable = () => Object.create(null) as string;

describe("OverlayLayer", () => {
    it("keeps the other toasts and shows no error card when one card fails to render", () => {
        let initial = show(NO_TOASTS, toast("good-a"), 0);
        initial = show(initial, toast("bad", { title: unprintable() }), 0);
        initial = show(initial, toast("good-b"), 0);

        const { body } = render(OverlayLayer, { props: { initial }, transformError: (e) => e });

        expect(body).toContain("Title good-a");
        expect(body).toContain("Title good-b");
        expect(body).not.toContain("data-region");
        expect(body).not.toMatch(/Couldn|error/i);
    });
});
