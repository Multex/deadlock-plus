import { INVITES } from "@deadlock-plus/links";
import { afterEach, describe, expect, it, vi } from "vitest";
import wranglerToml from "../wrangler.toml?raw";
import { POLL_CRON, createBot } from "../src/bot";
import { discordEnv, type Env } from "../src/env";
import { staffOnly } from "../src/guard";

const GUILD = "1400000000000000000";

const ENV: Env = {
    DISCORD_APPLICATION_ID: "app",
    DISCORD_PUBLIC_KEY: "key",
    DISCORD_BOT_TOKEN: "token",
    DISCORD_GUILD_ID: GUILD,
    TRANSPARENCY: { get: async () => null, put: async () => undefined },
};

function post(body: object): Request {
    return new Request("https://bot.example/", {
        method: "POST",
        headers: { "x-signature-ed25519": "sig", "x-signature-timestamp": "1" },
        body: JSON.stringify(body),
    });
}

function command(name: string, guild_id?: string): object {
    return {
        type: 2,
        id: "1",
        token: "t",
        version: 1,
        application_id: "app",
        guild_id,
        data: { id: "c", name, type: 1 },
    };
}

function probeBot(verify = async () => true) {
    const handler = vi.fn(() => Response.json({ type: 4, data: { content: "ran" } }));
    const bot = createBot({ verify }).command("probe", staffOnly(handler));
    return { bot, handler };
}

describe("interactions endpoint", () => {
    it("answers Discord's ping", async () => {
        const { bot } = probeBot();
        const res = await bot.fetch(post({ type: 1 }), ENV);
        expect(await res.json()).toEqual({ type: 1 });
    });

    it("rejects a request whose signature does not check out", async () => {
        const { bot, handler } = probeBot(async () => false);
        const res = await bot.fetch(post(command("probe", GUILD)), ENV);
        expect(res.status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
    });

    it("runs a command sent from the Deadlock+ server", async () => {
        const { bot, handler } = probeBot();
        const res = await bot.fetch(post(command("probe", GUILD)), ENV);
        expect(handler).toHaveBeenCalledOnce();
        expect(await res.json()).toEqual({ type: 4, data: { content: "ran" } });
    });

    it("refuses a command from another server, privately", async () => {
        const { bot, handler } = probeBot();
        const res = await bot.fetch(post(command("probe", "999")), ENV);
        const body = (await res.json()) as { type: number; data: { flags: number } };
        expect(handler).not.toHaveBeenCalled();
        expect(body.type).toBe(4);
        expect(body.data.flags & 64).toBe(64);
    });

    it("refuses a command sent in a direct message", async () => {
        const { bot, handler } = probeBot();
        await bot.fetch(post(command("probe")), ENV);
        expect(handler).not.toHaveBeenCalled();
    });

    it("refuses every command when no server is configured", async () => {
        const { bot, handler } = probeBot();
        await bot.fetch(post(command("probe", "")), { ...ENV, DISCORD_GUILD_ID: "" });
        expect(handler).not.toHaveBeenCalled();
    });
});

describe("discordEnv", () => {
    it("uses the bot token the website already stores", () => {
        expect(discordEnv(ENV).TOKEN).toBe("token");
    });
});

const COSTS = JSON.stringify({
    currency: "USD",
    items: [{ name: "Domain", purpose: "deadlockplus.app", amount: 15, period: "year", since: "2026-10-14" }],
});

function costEnv(): Env {
    return {
        ...ENV,
        TRANSPARENCY: { get: async (key) => (key === "costs" ? COSTS : null), put: async () => undefined },
    };
}

function costInteraction(type: 2 | 4, sub: string, options: object[], guild_id = GUILD): object {
    return {
        type,
        id: "1",
        token: "t",
        version: 1,
        application_id: "app",
        guild_id,
        data: { id: "c", name: "cost", type: 1, options: [{ type: 1, name: sub, options }] },
    };
}

describe("/cost", () => {
    it("answers privately with the list", async () => {
        const res = await createBot({ verify: async () => true }).fetch(
            post(costInteraction(2, "list", [])),
            costEnv(),
        );
        const body = (await res.json()) as { type: number; data: { content: string; flags: number } };
        expect(body.type).toBe(4);
        expect(body.data.flags & 64).toBe(64);
        expect(body.data.content).toContain("Domain: $15.00 every year");
    });

    it("suggests costs while the name is typed", async () => {
        const typed = [{ type: 3, name: "cost", value: "dom", focused: true }];
        const res = await createBot({ verify: async () => true }).fetch(
            post(costInteraction(4, "edit", typed)),
            costEnv(),
        );
        const body = (await res.json()) as { type: number; data: { choices: { value: string }[] } };
        expect(body.type).toBe(8);
        expect(body.data.choices.map((choice) => choice.value)).toEqual(["2026-10-14 Domain"]);
    });

    it("suggests nothing in another server", async () => {
        const typed = [{ type: 3, name: "cost", value: "", focused: true }];
        const interaction = costInteraction(4, "edit", typed, "999");
        const res = await createBot({ verify: async () => true }).fetch(post(interaction), costEnv());
        expect(((await res.json()) as { data: { choices: unknown[] } }).data.choices).toEqual([]);
    });
});

function interaction(type: 2 | 4, command: string, sub: string, options: object[]): object {
    return {
        type,
        id: "1",
        token: "itoken",
        version: 1,
        application_id: "app",
        guild_id: GUILD,
        data: { id: "c", name: command, type: 1, options: [{ type: 1, name: sub, options }] },
    };
}

function kv() {
    const data = new Map<string, string>();
    return {
        data,
        get: async (key: string) => data.get(key) ?? null,
        put: async (key: string, value: string) => void data.set(key, value),
    };
}

function stubFetch(routes: Record<string, () => Response>) {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({ url, init });
            const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
            return route ? routes[route]!() : new Response(null, { status: 200 });
        }),
    );
    return calls;
}

describe("/invite", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("answers privately at once and follows up with the list", async () => {
        const calls = stubFetch({
            [`https://discord.com/api/v10/guilds/${GUILD}/invites`]: () =>
                Response.json([{ code: "VR375cZwRJ", uses: 2 }]),
        });
        const pending: Promise<unknown>[] = [];
        const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} };
        const res = await createBot({ verify: async () => true }).fetch(
            post(interaction(2, "invite", "list", [])),
            { ...ENV, TRANSPARENCY: kv() },
            ctx,
        );
        const body = (await res.json()) as { type: number; data: { flags: number } };
        expect(body.type).toBe(5);
        expect(body.data.flags & 64).toBe(64);
        await Promise.all(pending);
        const followup = calls.find((call) => call.url.includes("/webhooks/app/itoken/messages/@original"));
        expect(followup?.init?.method).toBe("PATCH");
        expect(String(followup?.init?.body)).toContain("**tiktok** (web): `VR375cZwRJ`, 2 uses");
    });

    it("suggests invites while the ref is typed", async () => {
        const typed = [{ type: 3, name: "ref", value: "redd", focused: true }];
        const res = await createBot({ verify: async () => true }).fetch(post(interaction(4, "invite", "edit", typed)), {
            ...ENV,
            TRANSPARENCY: kv(),
        });
        const body = (await res.json()) as { data: { choices: { value: string }[] } };
        expect(body.data.choices.map((choice) => choice.value)).toEqual(["reddit"]);
    });
});

describe("/invite delete suggestions", () => {
    it("leave out the website invite, which cannot be deleted", async () => {
        const typed = [{ type: 3, name: "ref", value: "web", focused: true }];
        const res = await createBot({ verify: async () => true }).fetch(
            post(interaction(4, "invite", "delete", typed)),
            {
                ...ENV,
                TRANSPARENCY: kv(),
            },
        );
        expect(((await res.json()) as { data: { choices: unknown[] } }).data.choices).toEqual([]);
    });
});

describe("/landing", () => {
    it("adds a path and answers privately", async () => {
        const store = kv();
        const options = [
            { type: 3, name: "path", value: "ig" },
            { type: 3, name: "ref", value: "tiktok" },
        ];
        const res = await createBot({ verify: async () => true }).fetch(
            post(interaction(2, "landing", "add", options)),
            {
                ...ENV,
                TRANSPARENCY: store,
            },
        );
        const body = (await res.json()) as { type: number; data: { content: string; flags: number } };
        expect(body.type).toBe(4);
        expect(body.data.flags & 64).toBe(64);
        expect(body.data.content).toContain("https://deadlockplus.app/ig");
        expect(store.data.get("links")).toContain('"path": "ig"');
    });

    it("suggests paths for delete and invites for add", async () => {
        const bot = createBot({ verify: async () => true });
        const env = { ...ENV, TRANSPARENCY: kv() };
        const paths = await bot.fetch(
            post(interaction(4, "landing", "delete", [{ type: 3, name: "path", value: "tt-", focused: true }])),
            env,
        );
        expect(
            ((await paths.json()) as { data: { choices: { value: string }[] } }).data.choices.map((c) => c.value),
        ).toEqual(["tt-b", "tt-p"]);
        const refs = await bot.fetch(
            post(
                interaction(4, "landing", "add", [
                    { type: 3, name: "path", value: "ig" },
                    { type: 3, name: "ref", value: "you", focused: true },
                ]),
            ),
            env,
        );
        expect(
            ((await refs.json()) as { data: { choices: { value: string }[] } }).data.choices.map((c) => c.value),
        ).toEqual(["youtube"]);
    });
});

describe("hourly invite poll", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("runs on the schedule wrangler.toml sets", () => {
        expect(wranglerToml).toContain(`crons = ["${POLL_CRON}"]`);
    });

    it("sends each invite's uses to PostHog, labelled from the stored table", async () => {
        const calls = stubFetch({
            [`https://discord.com/api/v10/guilds/${GUILD}/invites`]: () => Response.json([{ code: "ig1234", uses: 5 }]),
        });
        const store = kv();
        store.data.set(
            "links",
            JSON.stringify({
                invites: [...INVITES, { ref: "instagram", channel: "web", code: "ig1234" }],
                landings: [],
            }),
        );
        const env = { ...ENV, TRANSPARENCY: store, POSTHOG_KEY: "phc", POSTHOG_HOST: "https://eu.i.posthog.com" };
        await createBot().scheduled({ cron: POLL_CRON, type: "scheduled", scheduledTime: 0 }, env);
        const batch = calls.find((call) => call.url === "https://eu.i.posthog.com/batch/");
        expect(String(batch?.init?.body)).toContain('"ref":"instagram"');
    });
});

describe("/announce", () => {
    afterEach(() => vi.unstubAllGlobals());

    const CHANNEL = "1400000000000000001";
    const ROLE = "1400000000000000002";

    it("opens the modal for the picked channel and role", async () => {
        const res = await createBot({ verify: async () => true }).fetch(
            post({
                ...command("announce", GUILD),
                data: {
                    id: "c",
                    name: "announce",
                    type: 1,
                    options: [
                        { type: 7, name: "channel", value: CHANNEL },
                        { type: 8, name: "role", value: ROLE },
                    ],
                },
            }),
            ENV,
        );
        const body = (await res.json()) as { type: number; data: { custom_id: string } };
        expect(body.type).toBe(9);
        expect(body.data.custom_id).toBe(`announce;${CHANNEL} ${ROLE}`);
    });

    it("posts the submitted modal and follows up privately with the link", async () => {
        const calls = stubFetch({
            [`https://discord.com/api/v10/channels/${CHANNEL}/messages`]: () => Response.json({ id: "999" }),
        });
        const pending: Promise<unknown>[] = [];
        const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} };
        const field = (custom_id: string, value: string) => ({ type: 18, component: { type: 4, custom_id, value } });
        const res = await createBot({ verify: async () => true }).fetch(
            post({
                type: 5,
                id: "1",
                token: "itoken",
                version: 1,
                application_id: "app",
                guild_id: GUILD,
                data: {
                    custom_id: `announce;${CHANNEL} `,
                    components: [field("title", "Hello"), field("body", "World"), field("link", "")],
                },
            }),
            ENV,
            ctx,
        );
        const body = (await res.json()) as { type: number; data: { flags: number } };
        expect(body.type).toBe(5);
        expect(body.data.flags & 64).toBe(64);
        await Promise.all(pending);
        const posted = calls.find((call) => call.url.endsWith(`/channels/${CHANNEL}/messages`));
        expect(posted?.init?.method).toBe("POST");
        expect(String(posted?.init?.body)).toContain('"content":"## Hello"');
        const followup = calls.find((call) => call.url.includes("/webhooks/app/itoken/messages/@original"));
        expect(String(followup?.init?.body)).toContain(`/channels/${GUILD}/${CHANNEL}/999`);
    });

    it("refuses a modal submitted from another server", async () => {
        const calls = stubFetch({});
        const res = await createBot({ verify: async () => true }).fetch(
            post({
                type: 5,
                id: "1",
                token: "itoken",
                version: 1,
                application_id: "app",
                guild_id: "999",
                data: { custom_id: `announce;${CHANNEL} `, components: [] },
            }),
            ENV,
        );
        const body = (await res.json()) as { type: number; data: { flags: number } };
        expect(body.type).toBe(4);
        expect(body.data.flags & 64).toBe(64);
        expect(calls).toEqual([]);
    });
});
