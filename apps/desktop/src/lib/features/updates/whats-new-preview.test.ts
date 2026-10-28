import { describe, expect, it } from "vitest";
import { previewVersion } from "./whats-new-preview";

const query = (s: string) => new URLSearchParams(s);

describe("previewVersion", () => {
    it("reads the version to give Unreleased from the query in a demo build", () => {
        expect(previewVersion(query("preview=0.15.0"), true)).toBe("0.15.0");
        expect(previewVersion(query("from=update&preview=1.0.0-beta.2"), true)).toBe("1.0.0-beta.2");
    });

    it("ignores the query outside a demo build", () => {
        expect(previewVersion(query("preview=0.15.0"), false)).toBeNull();
    });

    it("ignores a missing value or one that is not a version", () => {
        expect(previewVersion(query(""), true)).toBeNull();
        expect(previewVersion(query("preview=soon"), true)).toBeNull();
        expect(previewVersion(query("preview=1.2"), true)).toBeNull();
    });
});
