import { describe, expect, it } from "vitest";
import catalog from "../../../../../locales/en.json";
import { errorCode, errorText } from "./errors";

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

describe("errorCode", () => {
    it("gives the code of a command error, and nothing for any other failure", () => {
        expect(errorCode({ code: "voice_bans.no_account", params: {} })).toBe("voice_bans.no_account");
        expect(errorCode(new Error("boom"))).toBeNull();
        expect(errorCode("Invalid match id.")).toBeNull();
        expect(errorCode(undefined)).toBeNull();
    });
});
