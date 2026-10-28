import { describe, expect, it } from "vitest";
import { DEFAULT_UPDATE_CHANNEL, UPDATE_CHANNELS, resolveUpdateChannel } from "./channel";

describe("resolveUpdateChannel", () => {
    it("defaults to release", () => {
        expect(DEFAULT_UPDATE_CHANNEL).toBe("release");
        expect(resolveUpdateChannel(undefined)).toBe("release");
    });

    it("keeps a stored channel", () => {
        for (const channel of UPDATE_CHANNELS) expect(resolveUpdateChannel(channel)).toBe(channel);
    });

    it("falls back to release for anything it does not know", () => {
        expect(resolveUpdateChannel("stable")).toBe("release");
        expect(resolveUpdateChannel(1)).toBe("release");
        expect(resolveUpdateChannel(null)).toBe("release");
    });

    it("lists the channels from most to least stable", () => {
        expect(UPDATE_CHANNELS).toEqual(["release", "beta", "nightly"]);
    });
});
