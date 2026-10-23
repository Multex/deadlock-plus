import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ kvGet: vi.fn(), kvSet: vi.fn() }));
vi.mock("$lib/core/kv", () => kv);

import {
    SUPPORT_HOST,
    footerCost,
    hasFooter,
    readSupportPreference,
    stripFooter,
    withFooter,
    writeSupportPreference,
} from "./support-footer";

const FOOTER = "Made with Deadlock+ - deadlockplus.app";
const GERMAN = "Erstellt mit Deadlock+ - deadlockplus.app";

describe("SUPPORT_HOST", () => {
    it("is the site without the protocol", () => {
        expect(SUPPORT_HOST).toBe("deadlockplus.app");
    });
});

describe("withFooter", () => {
    it("adds the footer under the text after a blank line", () => {
        expect(withFooter("Rush Toxic Bullets.", true, FOOTER)).toBe(`Rush Toxic Bullets.\n\n${FOOTER}`);
    });

    it("writes the footer alone for an empty description", () => {
        expect(withFooter("", true, FOOTER)).toBe(FOOTER);
    });

    it("returns the text untouched when off and no footer is there", () => {
        expect(withFooter("Rush.\n", false, FOOTER)).toBe("Rush.\n");
    });

    it("never stacks a second footer", () => {
        const once = withFooter("Rush.", true, FOOTER);
        expect(withFooter(once, true, FOOTER)).toBe(once);
    });

    it("replaces a footer in another language instead of adding one", () => {
        expect(withFooter(`Rush.\n\n${GERMAN}`, true, FOOTER)).toBe(`Rush.\n\n${FOOTER}`);
    });

    it("removes an earlier footer when off", () => {
        expect(withFooter(`Rush.\n\n${FOOTER}`, false, FOOTER)).toBe("Rush.");
    });

    it("keeps the player's own trailing whitespace through a round trip", () => {
        for (const text of ["Rush.\n", "Rush. ", "a\n\n", ""]) {
            expect(stripFooter(withFooter(text, true, FOOTER))).toBe(text);
        }
    });
});

describe("stripFooter", () => {
    it("recognises any language variant with our name and the site", () => {
        expect(stripFooter(`Rush.\n\n${GERMAN}`)).toBe("Rush.");
        expect(stripFooter(`Rush.\r\n\r\nDeadlock+ で作成: https://deadlockplus.app/`)).toBe("Rush.");
    });

    it("removes footers an earlier bug stacked", () => {
        expect(stripFooter(`Rush.\n\n${FOOTER}\n\n${GERMAN}\n`)).toBe("Rush.");
    });

    it("leaves a last line without the site alone", () => {
        expect(stripFooter("Rush.\n\nMade with Deadlock+")).toBe("Rush.\n\nMade with Deadlock+");
        expect(stripFooter("Rush.\n\nSee deadlockplus.app")).toBe("Rush.\n\nSee deadlockplus.app");
    });

    it("leaves a mention earlier in the text alone", () => {
        const text = `${FOOTER}\n\nRush.`;
        expect(stripFooter(text)).toBe(text);
    });
});

describe("hasFooter", () => {
    it("tells whether the description ends with a footer", () => {
        expect(hasFooter(`Rush.\n\n${FOOTER}`)).toBe(true);
        expect(hasFooter(FOOTER)).toBe(true);
        expect(hasFooter("Rush.")).toBe(false);
    });
});

describe("footerCost", () => {
    it("counts the blank line before the footer", () => {
        expect(footerCost(FOOTER)).toBe(FOOTER.length + 2);
    });
});

describe("support preference", () => {
    beforeEach(() => {
        kv.kvGet.mockReset();
        kv.kvSet.mockReset();
    });

    it("is off until the player turned it on", async () => {
        kv.kvGet.mockResolvedValue(null);
        expect(await readSupportPreference()).toBe(false);
        kv.kvGet.mockResolvedValue(true);
        expect(await readSupportPreference()).toBe(true);
    });

    it("is off when the store cannot be read", async () => {
        kv.kvGet.mockRejectedValue(new Error("no tauri"));
        expect(await readSupportPreference()).toBe(false);
    });

    it("stores the choice in the app settings", async () => {
        kv.kvSet.mockResolvedValue(undefined);
        await writeSupportPreference(true);
        expect(kv.kvSet).toHaveBeenCalledWith("app-settings", "buildSupportFooter", true);
    });

    it("swallows a failed write", async () => {
        kv.kvSet.mockRejectedValue(new Error("no tauri"));
        await expect(writeSupportPreference(false)).resolves.toBeUndefined();
    });
});
