import { describe, expect, it } from "vitest";

import { MAIN_WINDOW, readWindowLabel } from "./window-label";

describe("window label", () => {
    it("is the current window's label", () => {
        expect(readWindowLabel(() => ({ label: "overlay" }))).toBe("overlay");
    });

    it("is the main label when there is no Tauri window", () => {
        const noTauri = () => {
            throw new TypeError("Cannot read properties of undefined (reading 'metadata')");
        };
        expect(readWindowLabel(noTauri)).toBe(MAIN_WINDOW);
    });
});
