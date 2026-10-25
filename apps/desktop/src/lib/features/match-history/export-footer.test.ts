import { describe, expect, it } from "vitest";
import { siteAddress } from "./export-footer";

describe("siteAddress", () => {
    it("drops the scheme and splits the name from the domain ending", () => {
        expect(siteAddress("https://deadlockplus.app")).toEqual({ name: "deadlockplus", ending: ".app" });
    });

    it("ignores a trailing slash and a path", () => {
        expect(siteAddress("https://deadlockplus.app/")).toEqual({ name: "deadlockplus", ending: ".app" });
        expect(siteAddress("http://www.example.co/download")).toEqual({ name: "www.example", ending: ".co" });
    });

    it("keeps a host without a dot whole", () => {
        expect(siteAddress("http://localhost:4330")).toEqual({ name: "localhost:4330", ending: "" });
    });
});
