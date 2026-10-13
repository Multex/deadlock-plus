import { describe, expect, it, vi } from "vitest";
import { createFetch, type ApiRoute } from "./fetch";

const ROUTES: ApiRoute[] = [
    [/^\/v1\/players\/\d+\/rank$/, (url) => ({ account: Number(url.pathname.split("/")[3]) })],
    [/^\/v1\/players\/steam$/, (url) => url.searchParams.get("account_ids")],
    [/^\/v1\/players\/steam$/, () => "second"],
];

const real = () => vi.fn(async () => new Response("real"));

describe("demo fetch", () => {
    it("answers a matching Deadlock API path as JSON, without touching the network", async () => {
        const network = real();
        const fetch = createFetch(ROUTES, network);
        const response = await fetch("https://api.deadlock-api.com/v1/players/90000001/rank");
        expect(await response.json()).toEqual({ account: 90000001 });
        expect(network).not.toHaveBeenCalled();
    });

    it("hands the route the whole URL, and lets the first matching route answer", async () => {
        const fetch = createFetch(ROUTES, real());
        const response = await fetch(new Request("https://api.deadlock-api.com/v1/players/steam?account_ids=1,2"));
        expect(await response.json()).toBe("1,2");
    });

    it("passes an API path with no route on to the network", async () => {
        const network = real();
        const response = await createFetch(ROUTES, network)("https://api.deadlock-api.com/v1/assets/heroes");
        expect(await response.text()).toBe("real");
        expect(network).toHaveBeenCalledWith("https://api.deadlock-api.com/v1/assets/heroes", undefined);
    });

    it("passes another host on to the network, even on a path that has a route", async () => {
        const network = real();
        await createFetch(ROUTES, network)("https://example.invalid/v1/players/1/rank");
        expect(network).toHaveBeenCalledTimes(1);
    });

    it("lets a route answer with a response of its own, such as a server error", async () => {
        const fetch = createFetch([[/^\/v1\//, () => new Response("down", { status: 503 })]], real());
        const response = await fetch("https://api.deadlock-api.com/v1/info/health");
        expect(response.status).toBe(503);
        expect(response.ok).toBe(false);
    });

    it("rejects, as a dropped connection does, when a route throws", async () => {
        const network = real();
        const fail = () => {
            throw new TypeError("Failed to fetch");
        };
        const pending = createFetch([[/^\/v1\//, fail]], network)("https://api.deadlock-api.com/v1/info/health");
        await expect(pending).rejects.toThrow("Failed to fetch");
        expect(network).not.toHaveBeenCalled();
    });
});
