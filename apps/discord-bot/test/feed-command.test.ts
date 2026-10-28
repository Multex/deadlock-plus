import { describe, expect, it } from "vitest";
import { ANNOUNCEMENTS_KEY, readPayload, signPayload, type Announcement, type Payload } from "../src/feed";
import {
    DRAFT_PREFIX,
    cancelPost,
    confirmPost,
    endAnnouncement,
    feedChoices,
    listFeed,
    previewPost,
    removeAnnouncement,
    type FeedDeps,
} from "../src/feed-command";

const NOW = new Date("2026-10-28T12:00:00Z");

let signingKey: string;
{
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    signingKey = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
}

function kv() {
    const data = new Map<string, string>();
    const puts: { key: string; ttl?: number }[] = [];
    return {
        data,
        puts,
        get: async (key: string) => data.get(key) ?? null,
        put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
            puts.push({ key, ttl: options?.expirationTtl });
            data.set(key, value);
        },
    };
}

/** `null` stands for the secret not being set. */
function deps(store = kv(), key: string | null = signingKey): FeedDeps & { store: ReturnType<typeof kv> } {
    return { store, signingKey: key ?? undefined, now: NOW };
}

function feed(store: ReturnType<typeof kv>): Payload {
    return readPayload(store.data.get(ANNOUNCEMENTS_KEY)!)!;
}

async function seed(store: ReturnType<typeof kv>, announcements: Announcement[], issuedAt = "2026-10-28T10:00:00Z") {
    store.data.set(
        ANNOUNCEMENTS_KEY,
        JSON.stringify(await signPayload({ version: 1, issuedAt, announcements }, signingKey)),
    );
}

const INPUT = { title: "Update now", body: "0.13.1 cannot update itself.", severity: "critical", versions: "=0.13.1" };

function texts(reply: unknown): string {
    return JSON.stringify(reply);
}

describe("previewPost", () => {
    it("refuses while the stored feed is broken", async () => {
        const d = deps();
        d.store.data.set(ANNOUNCEMENTS_KEY, "garbage");
        expect(await previewPost(INPUT, "111", d)).toContain("broken");
        expect(d.store.puts).toEqual([]);
    });

    it("shows how the post will read, with Confirm and Cancel, and leaves the feed alone", async () => {
        const d = deps();
        const reply = await previewPost(INPUT, "111", d);
        const json = texts(reply);
        expect(json).toContain("Update now");
        expect(json).toContain("0.13.1 cannot update itself.");
        expect(json).toContain("Critical");
        expect(json).toContain("=0.13.1");
        expect(json).toContain("announce-confirm;111");
        expect(json).toContain("announce-cancel;111");
        expect(d.store.data.has(ANNOUNCEMENTS_KEY)).toBe(false);
        expect(d.store.puts).toEqual([{ key: `${DRAFT_PREFIX}111`, ttl: 3600 }]);
    });

    it("refuses invalid input before storing anything", async () => {
        const d = deps();
        const reply = await previewPost({ ...INPUT, link: "https://evil.com/", label: "Go" }, "111", d);
        expect(typeof reply).toBe("string");
        expect(reply).toContain("link");
        expect(d.store.puts).toEqual([]);
    });

    it("refuses when the signing key is not set", async () => {
        const d = deps(kv(), null);
        const reply = await previewPost(INPUT, "111", d);
        expect(reply).toContain("ANNOUNCE_SIGNING_KEY");
        expect(d.store.puts).toEqual([]);
    });

    it("escapes Discord markdown, since the app shows plain text", async () => {
        const reply = await previewPost({ ...INPUT, body: "**not bold** <@&1>" }, "111", deps());
        expect(texts(reply)).toContain("\\\\*\\\\*not bold\\\\*\\\\*");
        expect((reply as { allowed_mentions: unknown }).allowed_mentions).toEqual({ parse: [] });
    });
});

describe("confirmPost", () => {
    it("adds the announcement and writes a signed feed", async () => {
        const d = deps();
        await previewPost(INPUT, "111", d);
        const reply = await confirmPost("111", d);
        expect(reply).toContain("update-now-2026-10-28");
        const payload = feed(d.store);
        expect(payload.version).toBe(1);
        expect(payload.issuedAt).toBe("2026-10-28T12:00:00Z");
        expect(payload.announcements).toEqual([
            {
                id: "update-now-2026-10-28",
                title: "Update now",
                body: "0.13.1 cannot update itself.",
                severity: "critical",
                versions: "=0.13.1",
            },
        ]);
    });

    it("re-reads the feed, keeps what is there and gives a unique id", async () => {
        const d = deps();
        const existing: Announcement = { id: "update-now-2026-10-28", title: "Old", body: "Old", severity: "info" };
        await previewPost(INPUT, "111", d);
        await seed(d.store, [existing], "2026-10-28T12:00:00Z");
        await confirmPost("111", d);
        const payload = feed(d.store);
        expect(payload.announcements.map((item) => item.id)).toEqual([
            "update-now-2026-10-28",
            "update-now-2026-10-28-2",
        ]);
        expect(payload.issuedAt).toBe("2026-10-28T12:00:01Z");
    });

    it("writes nothing when the signing key is missing", async () => {
        const store = kv();
        await previewPost(INPUT, "111", deps(store));
        const reply = await confirmPost("111", deps(store, null));
        expect(reply).toContain("ANNOUNCE_SIGNING_KEY");
        expect(store.data.has(ANNOUNCEMENTS_KEY)).toBe(false);
    });

    it("writes nothing when the signing key is broken", async () => {
        const store = kv();
        await previewPost(INPUT, "111", deps(store));
        const reply = await confirmPost("111", deps(store, '{"kty":"OKP"}'));
        expect(reply).toContain("ANNOUNCE_SIGNING_KEY");
        expect(store.data.has(ANNOUNCEMENTS_KEY)).toBe(false);
    });

    it("posts once, even when Confirm is pressed twice", async () => {
        const d = deps();
        await previewPost(INPUT, "111", d);
        await confirmPost("111", d);
        expect(await confirmPost("111", d)).toContain("already");
        expect(feed(d.store).announcements).toHaveLength(1);
    });

    it("says so when the preview is gone", async () => {
        const d = deps();
        expect(await confirmPost("404", d)).toContain("/announce post");
        expect(d.store.data.has(ANNOUNCEMENTS_KEY)).toBe(false);
    });

    it("refuses a 21st announcement", async () => {
        const d = deps();
        const items = Array.from({ length: 20 }, (_, i) => ({
            id: `a${i}`,
            title: "t",
            body: "b",
            severity: "info" as const,
        }));
        await seed(d.store, items);
        await previewPost(INPUT, "111", d);
        expect(await confirmPost("111", d)).toContain("20");
        expect(feed(d.store).announcements).toHaveLength(20);
    });

    it("refuses a feed over 64 KiB", async () => {
        const d = deps();
        const items = Array.from({ length: 19 }, (_, i) => ({
            id: `a${i}`,
            title: "t",
            body: "😀".repeat(600),
            severity: "info" as const,
        }));
        await seed(d.store, items);
        await previewPost({ ...INPUT, body: "😀".repeat(600) }, "111", d);
        expect(await confirmPost("111", d)).toContain("64 KiB");
        expect(feed(d.store).announcements).toHaveLength(19);
    });

    it("leaves a broken stored feed alone", async () => {
        const d = deps();
        await previewPost(INPUT, "111", d);
        d.store.data.set(ANNOUNCEMENTS_KEY, "garbage");
        expect(await confirmPost("111", d)).toContain("broken");
        expect(d.store.data.get(ANNOUNCEMENTS_KEY)).toBe("garbage");
    });
});

describe("cancelPost", () => {
    it("writes nothing to the feed", async () => {
        const d = deps();
        await previewPost(INPUT, "111", d);
        expect(cancelPost()).toContain("Nothing was posted");
        expect(d.store.data.has(ANNOUNCEMENTS_KEY)).toBe(false);
    });
});

const LIVE: Announcement = { id: "live-2026-10-27", title: "Live", body: "b", severity: "warning" };
const LATER: Announcement = {
    id: "later-2026-10-27",
    title: "Later",
    body: "b",
    severity: "info",
    startsAt: "2026-11-01T00:00:00Z",
};

describe("listFeed", () => {
    it("lists every announcement with its id and state", async () => {
        const d = deps();
        await seed(d.store, [LIVE, LATER, { ...LIVE, id: "over", endsAt: "2026-10-28T00:00:00Z" }]);
        const reply = await listFeed(d);
        expect(reply).toContain("`live-2026-10-27`");
        expect(reply).toContain("`later-2026-10-27`");
        expect(reply).toMatch(/Live.*\n.*Scheduled.*\n.*Ended/s);
    });

    it("says when the feed is empty", async () => {
        expect(await listFeed(deps())).toContain("No announcements");
    });
});

describe("endAnnouncement", () => {
    it("sets endsAt to now and bumps issuedAt", async () => {
        const d = deps();
        await seed(d.store, [LIVE, LATER]);
        expect(await endAnnouncement("live-2026-10-27", d)).toContain("Ended");
        const payload = feed(d.store);
        expect(payload.announcements[0]).toEqual({ ...LIVE, endsAt: "2026-10-28T12:00:00Z" });
        expect(payload.announcements[1]).toEqual(LATER);
        expect(payload.issuedAt > "2026-10-28T10:00:00Z").toBe(true);
    });

    it("refuses an unknown id", async () => {
        const d = deps();
        await seed(d.store, [LIVE]);
        const before = d.store.data.get(ANNOUNCEMENTS_KEY);
        expect(await endAnnouncement("nope", d)).toContain("No announcement");
        expect(d.store.data.get(ANNOUNCEMENTS_KEY)).toBe(before);
    });
});

describe("removeAnnouncement", () => {
    it("drops it from the feed and bumps issuedAt", async () => {
        const d = deps();
        await seed(d.store, [LIVE, LATER]);
        expect(await removeAnnouncement("live-2026-10-27", d)).toContain("Removed");
        const payload = feed(d.store);
        expect(payload.announcements).toEqual([LATER]);
        expect(payload.issuedAt).toBe("2026-10-28T12:00:00Z");
    });

    it("writes an empty signed feed when the last one goes, so apps drop it too", async () => {
        const d = deps();
        await seed(d.store, [LIVE]);
        await removeAnnouncement("live-2026-10-27", d);
        expect(feed(d.store).announcements).toEqual([]);
    });

    it("writes nothing without the signing key", async () => {
        const d = deps(kv(), null);
        await seed(d.store, [LIVE]);
        const before = d.store.data.get(ANNOUNCEMENTS_KEY);
        expect(await removeAnnouncement("live-2026-10-27", d)).toContain("ANNOUNCE_SIGNING_KEY");
        expect(d.store.data.get(ANNOUNCEMENTS_KEY)).toBe(before);
    });
});

describe("issuedAt", () => {
    it("increases with every write, even within one second", async () => {
        const d = deps();
        await previewPost(INPUT, "1", d);
        await confirmPost("1", d);
        const first = feed(d.store).issuedAt;
        await previewPost(INPUT, "2", d);
        await confirmPost("2", d);
        const second = feed(d.store).issuedAt;
        await removeAnnouncement("update-now-2026-10-28", d);
        const third = feed(d.store).issuedAt;
        expect(first < second && second < third).toBe(true);
    });
});

describe("feedChoices", () => {
    it("suggests announcements by id or title", async () => {
        const d = deps();
        await seed(d.store, [LIVE, LATER]);
        expect((await feedChoices("late", d.store)).map((choice) => choice.value)).toEqual(["later-2026-10-27"]);
    });
});
