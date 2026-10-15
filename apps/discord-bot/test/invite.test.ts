import { DEFAULT_LINKS, INVITES, LINKS_KEY, parseLinks, type Links } from "@deadlock-plus/links";
import { describe, expect, it, vi } from "vitest";
import { DiscordError, type LiveInvite } from "../src/discord";
import { inviteChoices, landingChoices, runInvite, runLanding, type InviteDeps } from "../src/invite";

function memory(raw: string | null = null) {
    const data = new Map<string, string>();
    if (raw !== null) data.set(LINKS_KEY, raw);
    return {
        data,
        get: async (key: string) => data.get(key) ?? null,
        put: async (key: string, value: string) => void data.set(key, value),
    };
}

type Memory = ReturnType<typeof memory>;

function stored(store: Memory): Links | null {
    return parseLinks(store.data.get(LINKS_KEY) ?? null);
}

const LIVE: LiveInvite[] = [
    { code: "VR375cZwRJ", uses: 2 },
    { code: "VM9utA3enT", uses: 67 },
    { code: "stray123", uses: 4 },
];

function deps(store = memory(), live = LIVE) {
    const discord = {
        listInvites: vi.fn(async () => live),
        createInvite: vi.fn(async () => "newCODE1"),
        revokeInvite: vi.fn(async () => {}),
    };
    const joins = vi.fn(
        async (codes: ReadonlyMap<string, number>) =>
            new Map([...codes].map(([code, uses]) => [code, { day: 1, week: uses, month: uses }])),
    );
    return { store, discord, joins } satisfies InviteDeps;
}

describe("/invite list", () => {
    it("shows each invite with its live uses and landing paths", async () => {
        const text = await runInvite("list", {}, deps());
        expect(text).toContain("**tiktok** (web): `VR375cZwRJ`, 2 uses · landing paths tt, tt-b, tt-p");
        expect(text).toContain("**app** (app, locked): `VM9utA3enT`, 67 uses");
        expect(text).toContain("**bluesky** (web): no code of its own");
    });

    it("lists codes the server has that the table does not", async () => {
        expect(await runInvite("list", {}, deps())).toContain("Not in the table: `stray123` (4 uses)");
    });

    it("still lists the table when Discord cannot be reached", async () => {
        const d = deps();
        d.discord.listInvites.mockRejectedValue(new DiscordError(503));
        const text = await runInvite("list", {}, d);
        expect(text).toContain("**tiktok** (web): `VR375cZwRJ`");
        expect(text).toMatch(/use counts are unavailable/i);
    });

    it("says when the table is broken", async () => {
        expect(await runInvite("list", {}, deps(memory("{ broken")))).toMatch(/broken/i);
    });
});

describe("/invite stats", () => {
    it("shows joins per ref, busiest first", async () => {
        const text = await runInvite("stats", {}, deps());
        const app = text.indexOf("**app**");
        const tiktok = text.indexOf("**tiktok**");
        expect(text).toContain("**app**: 1 in the last day, 67 in 7 days, 67 in 30 days");
        expect(app).toBeLessThan(tiktok);
        expect(text).toContain("`stray123` (not in the table)");
    });

    it("says when PostHog cannot be asked", async () => {
        const d = deps();
        d.joins.mockResolvedValue(null as never);
        expect(await runInvite("stats", {}, d)).toMatch(/PostHog/);
    });
});

describe("/invite create", () => {
    it("creates a permanent invite and stores it, starting from the built-in list", async () => {
        const d = deps();
        const text = await runInvite("create", { ref: "Instagram", channel: "123" }, d);
        expect(d.discord.createInvite).toHaveBeenCalledWith("123");
        expect(stored(d.store)?.invites.at(-1)).toEqual({ ref: "instagram", channel: "web", code: "newCODE1" });
        expect(stored(d.store)?.invites.slice(0, INVITES.length)).toEqual(INVITES);
        expect(text).toContain("https://discord.gg/newCODE1");
    });

    it("creates a direct invite when asked", async () => {
        const d = deps();
        await runInvite("create", { ref: "poster", channel: "123", kind: "direct" }, d);
        expect(stored(d.store)?.invites.at(-1)?.channel).toBe("direct");
    });

    it("checks the ref before creating anything on Discord", async () => {
        const d = deps();
        expect(await runInvite("create", { ref: "tiktok", channel: "123" }, d)).toMatch(/already listed/i);
        expect(await runInvite("create", { ref: "not a ref", channel: "123" }, d)).toMatch(/lowercase/i);
        expect(d.discord.createInvite).not.toHaveBeenCalled();
    });

    it("explains when Discord refuses", async () => {
        const d = deps();
        d.discord.createInvite.mockRejectedValue(new DiscordError(403));
        const text = await runInvite("create", { ref: "instagram", channel: "123" }, d);
        expect(text).toMatch(/403/);
        expect(d.store.data.has(LINKS_KEY)).toBe(false);
    });

    it("refuses to write over a broken table", async () => {
        const d = deps(memory("{ broken"));
        expect(await runInvite("create", { ref: "instagram", channel: "123" }, d)).toMatch(/broken/i);
        expect(d.discord.createInvite).not.toHaveBeenCalled();
    });
});

describe("/invite edit", () => {
    it("gives a ref a code that exists in the server", async () => {
        const d = deps();
        await runInvite("edit", { ref: "bluesky", code: "stray123" }, d);
        expect(stored(d.store)?.invites.find((i) => i.ref === "bluesky")?.code).toBe("stray123");
    });

    it("refuses a code the server does not have", async () => {
        const d = deps();
        expect(await runInvite("edit", { ref: "bluesky", code: "typo1234" }, d)).toMatch(/no invite with that code/i);
        expect(d.store.data.has(LINKS_KEY)).toBe(false);
    });

    it("renames a ref", async () => {
        const d = deps();
        await runInvite("edit", { ref: "twitter", new_ref: "x" }, d);
        expect(stored(d.store)?.invites.some((i) => i.ref === "x")).toBe(true);
    });

    it("refuses a locked invite", async () => {
        expect(await runInvite("edit", { ref: "github", new_ref: "gh" }, deps())).toMatch(/locked/i);
    });

    it("says when nothing would change", async () => {
        expect(await runInvite("edit", { ref: "reddit" }, deps())).toMatch(/nothing to change/i);
    });
});

describe("/invite delete", () => {
    it("removes the row and keeps the invite working by default", async () => {
        const d = deps();
        await runInvite("delete", { ref: "reddit" }, d);
        expect(stored(d.store)?.invites.some((i) => i.ref === "reddit")).toBe(false);
        expect(d.discord.revokeInvite).not.toHaveBeenCalled();
    });

    it("revokes the invite when asked", async () => {
        const d = deps();
        const text = await runInvite("delete", { ref: "reddit", revoke: true }, d);
        expect(d.discord.revokeInvite).toHaveBeenCalledWith("aTmYARWhdV");
        expect(text).toMatch(/revoked/i);
    });

    it("refuses an invite landing paths still count under", async () => {
        const d = deps();
        expect(await runInvite("delete", { ref: "tiktok", revoke: true }, d)).toMatch(/landing/i);
        expect(d.discord.revokeInvite).not.toHaveBeenCalled();
    });

    it("reports a revoke Discord refused after the row is gone", async () => {
        const d = deps();
        d.discord.revokeInvite.mockRejectedValue(new DiscordError(404));
        const text = await runInvite("delete", { ref: "reddit", revoke: true }, d);
        expect(stored(d.store)?.invites.some((i) => i.ref === "reddit")).toBe(false);
        expect(text).toMatch(/404/);
    });
});

describe("/landing", () => {
    it("adds a path and shows the address to post", async () => {
        const store = memory();
        const text = await runLanding("add", { path: "TT-S", ref: "tiktok" }, store);
        expect(stored(store)?.landings.at(-1)).toEqual({ path: "tt-s", ref: "tiktok" });
        expect(text).toContain("https://deadlockplus.app/tt-s");
    });

    it("refuses a page name", async () => {
        expect(await runLanding("add", { path: "faq", ref: "tiktok" }, memory())).toMatch(/page of the website/i);
    });

    it("deletes a path", async () => {
        const store = memory();
        await runLanding("delete", { path: "tt-p" }, store);
        expect(stored(store)?.landings.some((l) => l.path === "tt-p")).toBe(false);
    });
});

describe("choices", () => {
    it("offers only invites that can be changed for edit and delete", async () => {
        const refs = (await inviteChoices("edit", "", memory())).map((c) => c.value);
        expect(refs).toContain("tiktok");
        expect(refs).not.toEqual(expect.arrayContaining(["app"]));
        expect(refs).not.toContain("github");
        expect((await inviteChoices("delete", "", memory())).map((c) => c.value)).not.toContain("website");
    });

    it("offers web invites for a landing path to count under", async () => {
        const refs = (await inviteChoices("landing", "you", memory())).map((c) => c.value);
        expect(refs).toEqual(["youtube"]);
    });

    it("offers landing paths for delete", async () => {
        expect((await landingChoices("yt-", memory())).map((c) => c.value)).toEqual(["yt-b", "yt-p"]);
    });

    it("reads the stored table", async () => {
        const table = { ...DEFAULT_LINKS, invites: [...INVITES, { ref: "instagram", channel: "web", code: "ig1234" }] };
        const refs = (await inviteChoices("edit", "insta", memory(JSON.stringify(table)))).map((c) => c.value);
        expect(refs).toEqual(["instagram"]);
    });
});
