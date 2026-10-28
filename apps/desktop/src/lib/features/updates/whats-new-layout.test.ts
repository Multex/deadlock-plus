import { describe, expect, it } from "vitest";
import { previewLayout } from "./whats-new-layout";

const query = (s: string) => new URLSearchParams(s);

describe("previewLayout", () => {
    it("picks a layout from the query in a demo build", () => {
        expect(previewLayout(query("layout=reveal"), true)).toBe("reveal");
        expect(previewLayout(query("from=update&layout=spread"), true)).toBe("spread");
        expect(previewLayout(query("layout=patch"), true)).toBe("patch");
    });

    it("ignores the query outside a demo build", () => {
        expect(previewLayout(query("layout=reveal"), false)).toBeNull();
    });

    it("ignores an unknown or missing layout", () => {
        expect(previewLayout(query("layout=cards"), true)).toBeNull();
        expect(previewLayout(query(""), true)).toBeNull();
    });
});
