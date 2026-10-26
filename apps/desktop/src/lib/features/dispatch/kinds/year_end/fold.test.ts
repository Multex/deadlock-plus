import { describe, expect, it } from "vitest";
import { FOLD_MS, foldAnnouncement, foldFrame, foldKey, foldRequest } from "./fold";
import { CLOSED, OPEN } from "./reveal";

const key = (k: string) => ({ key: k });

describe("year-end fold requests", () => {
    it("unfolds only from the folded copy", () => {
        expect(foldRequest("closed", "unfold")).toBe("unfolding");
        expect(foldRequest("open", "unfold")).toBeNull();
        expect(foldRequest("unfolding", "unfold")).toBeNull();
        expect(foldRequest("folding", "unfold")).toBeNull();
    });

    it("folds up from the open poster or mid-unfold", () => {
        expect(foldRequest("open", "fold")).toBe("folding");
        expect(foldRequest("unfolding", "fold")).toBe("folding");
        expect(foldRequest("closed", "fold")).toBeNull();
        expect(foldRequest("folding", "fold")).toBeNull();
    });
});

describe("year-end fold keys", () => {
    it("unfolds on Enter or Space", () => {
        expect(foldKey(key("Enter"), "closed")).toBe("unfold");
        expect(foldKey(key(" "), "closed")).toBe("unfold");
    });

    it("folds up on Escape and leaves Escape on the folded copy to the room", () => {
        expect(foldKey(key("Escape"), "open")).toBe("fold");
        expect(foldKey(key("Escape"), "unfolding")).toBe("fold");
        expect(foldKey(key("Escape"), "closed")).toBeNull();
    });

    it("swallows Escape while it folds so the room does not close under it", () => {
        expect(foldKey(key("Escape"), "folding")).toBe("swallow");
    });

    it("ignores other keys", () => {
        expect(foldKey(key("Enter"), "open")).toBeNull();
        expect(foldKey(key("a"), "closed")).toBeNull();
    });
});

describe("year-end fold animation", () => {
    it("starts where the poster is and ends shut", () => {
        expect(foldFrame(0, OPEN)).toEqual({ ...OPEN });
        expect(foldFrame(FOLD_MS, OPEN)).toEqual(CLOSED);
        const half = { right: 0.6, left: 0.2, flash: 0.4, light: 0.8 };
        expect(foldFrame(0, half)).toMatchObject({ right: 0.6, left: 0.2 });
        expect(foldFrame(FOLD_MS, half)).toEqual(CLOSED);
    });

    it("folds the inside flap in before the cover swings back over it", () => {
        const mid = foldFrame(FOLD_MS * 0.4, OPEN);
        expect(mid.left).toBeLessThan(mid.right);
        const left = [0, 0.2, 0.4, 0.6, 0.8, 1].map((k) => foldFrame(FOLD_MS * k, OPEN).left);
        const right = [0, 0.2, 0.4, 0.6, 0.8, 1].map((k) => foldFrame(FOLD_MS * k, OPEN).right);
        for (let i = 1; i < left.length; i++) {
            expect(left[i]).toBeLessThanOrEqual(left[i - 1]);
            expect(right[i]).toBeLessThanOrEqual(right[i - 1]);
        }
    });

    it("has no flash and full light while folding", () => {
        const f = foldFrame(FOLD_MS / 2, { right: 1, left: 1, flash: 0.5, light: 0.6 });
        expect(f.flash).toBe(0);
        expect(f.light).toBe(1);
    });
});

describe("year-end fold announcement", () => {
    it("announces the poster opening and folding, nothing before the first unfold", () => {
        expect(foldAnnouncement("open", false)).toBe("dispatch.year_end.unfolded");
        expect(foldAnnouncement("closed", true)).toBe("dispatch.year_end.folded");
        expect(foldAnnouncement("closed", false)).toBeNull();
        expect(foldAnnouncement("unfolding", false)).toBeNull();
    });
});
