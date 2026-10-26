import { describe, expect, it } from "vitest";
import {
    SHAPES,
    afterVideoExport,
    chosenSection,
    destinationKey,
    mediaBox,
    nextRadio,
    shareFileName,
    stageFor,
} from "./share-sheet";

const page = { id: "front_page", size: { width: 1000, height: 1300 } };
const card = { id: "stories", size: { width: 720, height: 720 }, card: true };

describe("share sheet shapes", () => {
    it("names each shape by where it goes", () => {
        expect(SHAPES.map((s) => [s.aspect, destinationKey(s.aspect)])).toEqual([
            ["9:16", "dispatch.share.where.tall"],
            ["1:1", "dispatch.share.where.square"],
            ["16:9", "dispatch.share.where.wide"],
        ]);
    });

    it("shows a video where it plays: phone, feed post, player", () => {
        expect(stageFor("video", page, "1:1", "9:16")).toEqual({ frame: "phone", aspect: "9:16", ratio: 9 / 16 });
        expect(stageFor("video", page, "9:16", "1:1")).toEqual({ frame: "post", aspect: "1:1", ratio: 1 });
        expect(stageFor("video", page, "9:16", "16:9")).toEqual({ frame: "player", aspect: "16:9", ratio: 16 / 9 });
    });

    it("shows a card picture at its card shape and a wide one as a post, not a player", () => {
        expect(stageFor("picture", card, "9:16", "16:9").frame).toBe("phone");
        expect(stageFor("picture", card, "1:1", "9:16")).toEqual({ frame: "post", aspect: "1:1", ratio: 1 });
        expect(stageFor("picture", card, "16:9", "9:16")).toEqual({ frame: "post", aspect: "16:9", ratio: 16 / 9 });
    });

    it("shows a fixed page as a chat attachment at its own size", () => {
        expect(stageFor("picture", page, "16:9", "16:9")).toEqual({ frame: "chat", aspect: null, ratio: 1000 / 1300 });
    });
});

describe("share sheet picks", () => {
    const sections = [page, card];

    it("falls back to the first page when the picked one is gone", () => {
        expect(chosenSection(sections, "stories")).toBe(card);
        expect(chosenSection(sections, "spread_2")).toBe(page);
    });

    it("moves through a group with the arrow keys, wrapping, and ignores other keys", () => {
        const all = ["a", "b", "c"] as const;
        expect(nextRadio("ArrowRight", all, "c")).toBe("a");
        expect(nextRadio("ArrowDown", all, "a")).toBe("b");
        expect(nextRadio("ArrowLeft", all, "a")).toBe("c");
        expect(nextRadio("End", all, "a")).toBe("c");
        expect(nextRadio("Escape", all, "a")).toBeNull();
        expect(nextRadio("Enter", all, "a")).toBeNull();
    });
});

describe("share sheet file names", () => {
    it("names a picture by its page, and the shape only for a card", () => {
        const base = { viewId: "weekly-2026-11-23", videoKind: null, cardAspect: "1:1", videoAspect: "9:16" } as const;
        expect(shareFileName({ ...base, format: "picture", section: card })).toBe(
            "deadlock-plus-dispatch-weekly-2026-11-23-stories-1x1.png",
        );
        expect(shareFileName({ ...base, format: "picture", section: page })).toBe(
            "deadlock-plus-dispatch-weekly-2026-11-23-front-page.png",
        );
    });

    it("names a video by its kind and the video shape", () => {
        expect(
            shareFileName({
                viewId: "monthly-2026-11",
                format: "video",
                videoKind: "monthly",
                section: card,
                cardAspect: "1:1",
                videoAspect: "16:9",
            }),
        ).toBe("deadlock-plus-monthly-2026-11-16x9.mp4");
    });
});

describe("share sheet stage", () => {
    it("fits the media inside the room left after the frame's own chrome", () => {
        const box = mediaBox({ w: 900, h: 700 }, 9 / 16, "phone");
        expect(box.h).toBeLessThanOrEqual(700);
        expect(box.w / box.h).toBeCloseTo(9 / 16, 1);
        expect(mediaBox({ w: 2000, h: 600 }, 16 / 9, "player").h).toBeLessThan(600);
    });

    it("is empty before the stage is measured", () => {
        expect(mediaBox({ w: 0, h: 0 }, 1, "post")).toEqual({ w: 0, h: 0 });
    });
});

describe("share sheet video result", () => {
    it("lands on done with the file name after a save", () => {
        expect(afterVideoExport({ status: "saved", silent: true }, "a.mp4")).toEqual({
            state: "done",
            silent: true,
            fileName: "a.mp4",
        });
    });

    it("goes back to idle when the save or the encode is called off", () => {
        expect(afterVideoExport({ status: "dismissed" }, "a.mp4")).toEqual({ state: "idle" });
        expect(afterVideoExport({ status: "cancelled" }, "a.mp4")).toEqual({ state: "idle" });
    });

    it("keeps the failure for the error state", () => {
        const error = new Error("boom");
        expect(afterVideoExport({ status: "failed", error }, "a.mp4")).toEqual({ state: "error", error });
    });
});
