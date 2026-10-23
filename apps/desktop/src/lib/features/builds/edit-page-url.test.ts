import { describe, expect, it } from "vitest";
import { shownHref } from "./edit-page";
import type { EditOrigin } from "./editor/session";

const local: EditOrigin = { kind: "local", section: "Unpublished", base: "blob", buildId: 5 };

describe("shownHref", () => {
    it("names the game's build once its draft is gone, so a reload does not look for the deleted draft", () => {
        expect(shownHref(local, undefined)).toBe("/builds/edit?source=local&id=5");
    });

    it("names the draft while there is one, so a reload resumes the unsaved edits", () => {
        expect(shownHref(local, "abc")).toBe("/builds/edit?source=draft&id=abc");
        expect(shownHref({ kind: "new" }, "abc")).toBe("/builds/edit?source=draft&id=abc");
    });

    it("has nothing to name for a build that is neither drafted nor in a game file", () => {
        expect(shownHref({ kind: "new" }, undefined)).toBeNull();
        expect(shownHref({ kind: "copyView" }, undefined)).toBeNull();
    });
});
