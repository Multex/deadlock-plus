import { describe, expect, it } from "vitest";
import {
    isPaletteKey,
    isTypingTarget,
    jumpTargets,
    MAX_PAGE_JUMPS,
    modifierLabel,
    pageJumpIndex,
    type KeyInput,
} from "./shortcuts";

function key(k: string, mods: Partial<KeyInput> = {}): KeyInput {
    return { key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods };
}

describe("isPaletteKey", () => {
    it("matches Ctrl+K on Windows and Linux", () => {
        expect(isPaletteKey(key("k", { ctrlKey: true }), "windows")).toBe(true);
        expect(isPaletteKey(key("K", { ctrlKey: true }), "linux")).toBe(true);
    });

    it("matches Cmd+K on macOS only", () => {
        expect(isPaletteKey(key("k", { metaKey: true }), "macos")).toBe(true);
        expect(isPaletteKey(key("k", { ctrlKey: true }), "macos")).toBe(false);
        expect(isPaletteKey(key("k", { metaKey: true }), "windows")).toBe(false);
    });

    it("ignores a bare K and chords with extra modifiers", () => {
        expect(isPaletteKey(key("k"), "windows")).toBe(false);
        expect(isPaletteKey(key("k", { ctrlKey: true, shiftKey: true }), "windows")).toBe(false);
        expect(isPaletteKey(key("k", { ctrlKey: true, altKey: true }), "windows")).toBe(false);
    });
});

describe("pageJumpIndex", () => {
    it("maps Ctrl+1..9 to zero-based indices", () => {
        expect(pageJumpIndex(key("1", { ctrlKey: true }), "windows")).toBe(0);
        expect(pageJumpIndex(key("9", { ctrlKey: true }), "windows")).toBe(8);
    });

    it("uses Cmd on macOS", () => {
        expect(pageJumpIndex(key("2", { metaKey: true }), "macos")).toBe(1);
        expect(pageJumpIndex(key("2", { ctrlKey: true }), "macos")).toBeNull();
    });

    it("ignores 0, bare digits and extra modifiers", () => {
        expect(pageJumpIndex(key("0", { ctrlKey: true }), "windows")).toBeNull();
        expect(pageJumpIndex(key("1"), "windows")).toBeNull();
        expect(pageJumpIndex(key("1", { ctrlKey: true, shiftKey: true }), "windows")).toBeNull();
        expect(pageJumpIndex(key("1", { ctrlKey: true, altKey: true }), "windows")).toBeNull();
    });

    it("caps at the number of jump keys", () => {
        expect(MAX_PAGE_JUMPS).toBe(9);
    });
});

describe("jumpTargets", () => {
    it("skips grouped entries so tools never take a digit", () => {
        const entries = [
            { id: "home" },
            { id: "mutes", group: "tools" as const },
            { id: "stats" },
            { id: "replays", group: "tools" as const },
        ];

        expect(jumpTargets(entries).map((e) => e.id)).toEqual(["home", "stats"]);
    });

    it("stops at nine", () => {
        const entries = Array.from({ length: 12 }, (_, i): { id: string; group?: "tools" } => ({ id: `p${i}` }));

        expect(jumpTargets(entries)).toHaveLength(MAX_PAGE_JUMPS);
        expect(jumpTargets(entries)[8]?.id).toBe("p8");
    });
});

describe("isTypingTarget", () => {
    it("is true for text fields and editable content", () => {
        expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
        expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
        expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
        expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    });

    it("is false for buttons, links and nothing", () => {
        expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
        expect(isTypingTarget({ tagName: "A" })).toBe(false);
        expect(isTypingTarget(null)).toBe(false);
    });
});

describe("modifierLabel", () => {
    it("names the platform modifier", () => {
        expect(modifierLabel("windows")).toBe("Ctrl");
        expect(modifierLabel("linux")).toBe("Ctrl");
        expect(modifierLabel("macos")).toBe("Cmd");
    });
});
