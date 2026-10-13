import { describe, expect, it } from "vitest";
import { apexRedirect } from "./host";

describe("apexRedirect", () => {
    it("sends the www address to the bare domain, keeping the path and the ref", () => {
        expect(apexRedirect(new URL("https://www.deadlockplus.app/features?ref=tiktok"))).toBe(
            "https://deadlockplus.app/features?ref=tiktok",
        );
        expect(apexRedirect(new URL("http://www.deadlockplus.app/"))).toBe("https://deadlockplus.app/");
    });

    it("leaves the bare domain and every other host alone", () => {
        expect(apexRedirect(new URL("https://deadlockplus.app/download"))).toBeNull();
        expect(apexRedirect(new URL("http://localhost:5173/"))).toBeNull();
        expect(apexRedirect(new URL("https://www.example.com/"))).toBeNull();
    });
});
