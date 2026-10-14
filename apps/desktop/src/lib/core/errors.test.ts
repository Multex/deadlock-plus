import { describe, expect, it } from "vitest";
import catalog from "../../../../../locales/en.json";
import { errorCode, errorText, failureText } from "./errors";

describe("errorText", () => {
    it("looks a code up in the catalog", () => {
        expect(errorText({ code: "common.network", params: {} })).toBe(catalog.errors.common.network);
    });

    it("fills {name} placeholders from params", () => {
        const text = errorText(
            { code: "common.io", params: { what: "log folder" } },
            { errors: { common: { io: "Can't open the {what}." } } },
        );
        expect(text).toBe("Can't open the log folder.");
    });

    it("leaves an unknown placeholder visible", () => {
        const text = errorText(
            { code: "common.io", params: {} },
            { errors: { common: { io: "Can't open the {what}." } } },
        );
        expect(text).toBe("Can't open the {what}.");
    });

    it("falls back to the generic message for an unknown code", () => {
        expect(errorText({ code: "demos.nope", params: {} })).toBe(catalog.errors.common.internal);
    });

    it("passes a plain string through (commands not yet migrated)", () => {
        expect(errorText("Invalid match id.")).toBe("Invalid match id.");
    });

    it("falls back to the generic message for anything else", () => {
        expect(errorText(undefined)).toBe(catalog.errors.common.internal);
        expect(errorText({ nothing: true })).toBe(catalog.errors.common.internal);
    });

    it("uses an Error's message", () => {
        expect(errorText(new Error("boom"))).toBe("boom");
    });
});

describe("failureText", () => {
    const fallback = "Couldn't block Frankfurt. Check the log for details.";

    it("uses the fallback over a generic coded sentence", () => {
        expect(failureText({ code: "server_picker.block_failed", params: {} }, fallback)).toBe(fallback);
        expect(failureText({ code: "common.io", params: {} }, fallback)).toBe(fallback);
        expect(failureText({ code: "common.internal", params: {} }, fallback)).toBe(fallback);
    });

    it("shows a sentence that tells the player something on its own", () => {
        expect(failureText({ code: "voice_bans.game_running", params: {} }, fallback)).toBe(
            catalog.errors.voice_bans.game_running,
        );
        expect(failureText({ code: "common.network", params: {} }, fallback)).toBe(catalog.errors.common.network);
        expect(failureText({ code: "voice_bans.write_failed", params: {} }, fallback)).toBe(
            catalog.errors.voice_bans.write_failed,
        );
    });

    it("keeps a failure that carries details", () => {
        expect(failureText({ code: "ingest.request_failed", params: { status: "503" } }, fallback)).toBe(
            catalog.errors.ingest.request_failed.replace("{status}", "503"),
        );
    });

    it("uses the fallback for an unknown code", () => {
        expect(failureText({ code: "demos.nope", params: {} }, fallback)).toBe(fallback);
    });

    it("never shows a raw string or JavaScript error", () => {
        expect(failureText("os error 5", fallback)).toBe(fallback);
        expect(failureText(new TypeError("Failed to fetch"), fallback)).toBe(fallback);
        expect(failureText(undefined, fallback)).toBe(fallback);
    });
});

describe("errorCode", () => {
    it("gives the code of a command error, and nothing for any other failure", () => {
        expect(errorCode({ code: "voice_bans.no_account", params: {} })).toBe("voice_bans.no_account");
        expect(errorCode(new Error("boom"))).toBeNull();
        expect(errorCode("Invalid match id.")).toBeNull();
        expect(errorCode(undefined)).toBeNull();
    });
});
