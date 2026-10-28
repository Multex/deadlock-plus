import { describe, expect, it } from "vitest";
import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
import { canDismiss, MAX_SHOWN, parseDismissed, pruneDismissed, shownAnnouncements } from "./announcements";

const item = (id: string, severity: Announcement["severity"]): Announcement => ({
    id,
    title: id,
    body: "",
    severity,
    link: null,
});

describe("shown announcements", () => {
    it("puts the most severe first and keeps the feed's order within a severity", () => {
        const feed = [item("i1", "info"), item("w1", "warning"), item("c1", "critical"), item("w2", "warning")];
        expect(shownAnnouncements(feed, []).map((a) => a.id)).toEqual(["c1", "w1", "w2"]);
    });

    it(`shows at most ${MAX_SHOWN}`, () => {
        const feed = ["a", "b", "c", "d", "e"].map((id) => item(id, "info"));
        expect(MAX_SHOWN).toBe(3);
        expect(shownAnnouncements(feed, []).map((a) => a.id)).toEqual(["a", "b", "c"]);
    });

    it("leaves out dismissed info and warning items, so the next one moves up", () => {
        const feed = [item("w1", "warning"), item("i1", "info"), item("i2", "info"), item("i3", "info")];
        expect(shownAnnouncements(feed, ["w1", "i2"]).map((a) => a.id)).toEqual(["i1", "i3"]);
    });

    it("keeps a critical item even when its id is in the dismissed list", () => {
        expect(shownAnnouncements([item("c1", "critical")], ["c1"]).map((a) => a.id)).toEqual(["c1"]);
    });
});

describe("dismissal", () => {
    it("is allowed for info and warning but not for critical", () => {
        expect(canDismiss(item("a", "info"))).toBe(true);
        expect(canDismiss(item("a", "warning"))).toBe(true);
        expect(canDismiss(item("a", "critical"))).toBe(false);
    });

    it("prunes ids the feed no longer has", () => {
        expect(pruneDismissed(["gone", "kept"], [item("kept", "info"), item("new", "info")])).toEqual(["kept"]);
    });

    it("reads only a list of strings from storage", () => {
        expect(parseDismissed(["a", "b"])).toEqual(["a", "b"]);
        expect(parseDismissed(["a", 3, null])).toEqual(["a"]);
        expect(parseDismissed(null)).toEqual([]);
        expect(parseDismissed("a")).toEqual([]);
        expect(parseDismissed({ a: 1 })).toEqual([]);
    });
});
