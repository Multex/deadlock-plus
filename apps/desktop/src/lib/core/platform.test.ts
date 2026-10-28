import { afterEach, describe, expect, it } from "vitest";
import { en, i18n } from "./i18n.svelte";
import { detectPlatform, platformName, trashName } from "./platform";

describe("detectPlatform", () => {
    it("reads the webview user agents", () => {
        expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120")).toBe("windows");
        expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("macos");
        expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15")).toBe("linux");
    });

    it("assumes Windows when the agent says nothing useful", () => {
        expect(detectPlatform("")).toBe("windows");
    });
});

describe("names", () => {
    it("calls the trash by each system's own name", () => {
        expect(trashName("windows")).toBe("Recycle Bin");
        expect(trashName("macos")).toBe("Trash");
        expect(trashName("linux")).toBe("Trash");
    });

    it("spells the platform for people", () => {
        expect(platformName("macos")).toBe("macOS");
        expect(platformName("linux")).toBe("Linux");
        expect(platformName("windows")).toBe("Windows");
    });
});

describe("names follow the active catalog", () => {
    afterEach(() => i18n.reset({ en }, "en"));

    it("reads the trash and platform names from the catalog", () => {
        i18n.reset(
            { en: { platform: { windows: "Win", macos: "Mac", linux: "Lin", trash: "Bin", recycle_bin: "Rec" } } },
            "en",
        );
        expect(trashName("windows")).toBe("Rec");
        expect(trashName("macos")).toBe("Bin");
        expect(platformName("macos")).toBe("Mac");
        expect(platformName("linux")).toBe("Lin");
        expect(platformName("windows")).toBe("Win");
    });
});
