import { describe, expect, it } from "vitest";
import { overlayPlacement, type OverlayHost } from "./overlay-host";

const host = (el: HTMLElement | null): OverlayHost => ({ el, track: () => () => {} });

describe("overlayPlacement", () => {
    it("falls back to the document body when the app set no host", () => {
        expect(overlayPlacement(undefined)).toEqual({ to: "body", contained: false });
    });

    it("renders nothing while the app's host has no element yet", () => {
        expect(overlayPlacement(host(null))).toBeNull();
    });

    it("portals into the host element and stays inside it", () => {
        const el = {} as HTMLElement;

        expect(overlayPlacement(host(el))).toEqual({ to: el, contained: true });
    });
});
