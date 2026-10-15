import { describe, expect, it, vi } from "vitest";
import { createBot } from "../src/bot";
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
