import { describe, expect, it, vi } from "vitest";
import { DeadlockApiError } from "@deadlock-plus/deadlock-api";
import { fetchMetadata, resolveDetail, type DetailSource } from "./api";
import fixture from "@deadlock-plus/match/fixtures/api-ranked.json";

const body = JSON.stringify(fixture);
const matchId = fixture.match_info.match_id;

function source(over: Partial<DetailSource> = {}): DetailSource {
    return {
        read: vi.fn(async () => null),
        write: vi.fn(async () => {}),
        fetchText: vi.fn(async () => body),
        ...over,
    };
}

describe("resolveDetail", () => {
    it("serves a cache hit without fetching", async () => {
        const s = source({ read: vi.fn(async () => body) });
        const d = await resolveDetail(matchId, s);
        expect(d?.matchId).toBe(matchId);
        expect(s.fetchText).not.toHaveBeenCalled();
        expect(s.write).not.toHaveBeenCalled();
    });

    it("fetches on a miss and writes the raw body to the cache", async () => {
        const s = source();
        const d = await resolveDetail(matchId, s);
        expect(d?.matchId).toBe(matchId);
        expect(s.fetchText).toHaveBeenCalledWith(matchId);
        expect(s.write).toHaveBeenCalledWith(matchId, body);
    });

    it("falls through to a fetch when the cached body does not parse", async () => {
        for (const bad of ["not json", "{}", "[]", JSON.stringify({ match_info: { match_id: 1 } })]) {
            const s = source({ read: vi.fn(async () => bad) });
            const d = await resolveDetail(matchId, s);
            expect(d?.matchId).toBe(matchId);
            expect(s.fetchText).toHaveBeenCalledTimes(1);
        }
    });

    it("falls through when the cached body is for another match", async () => {
        const other = structuredClone(fixture);
        other.match_info.match_id = matchId + 1;
        const s = source({ read: vi.fn(async () => JSON.stringify(other)) });
        await resolveDetail(matchId, s);
        expect(s.fetchText).toHaveBeenCalledTimes(1);
    });

    it("treats a failing cache read as a miss", async () => {
        const s = source({
            read: vi.fn(async () => {
                throw new Error("io");
            }),
        });
        expect((await resolveDetail(matchId, s))?.matchId).toBe(matchId);
    });

    it("still returns the detail when the cache write fails", async () => {
        const s = source({
            write: vi.fn(async () => {
                throw new Error("disk full");
            }),
        });
        expect((await resolveDetail(matchId, s))?.matchId).toBe(matchId);
    });

    it("rejects a fetched body that does not parse and does not cache it", async () => {
        const s = source({ fetchText: vi.fn(async () => "{}") });
        await expect(resolveDetail(matchId, s)).rejects.toThrow();
        expect(s.write).not.toHaveBeenCalled();
    });

    it("propagates a fetch failure", async () => {
        const s = source({
            fetchText: vi.fn(async () => {
                throw new Error("offline");
            }),
        });
        await expect(resolveDetail(matchId, s)).rejects.toThrow("offline");
    });
});

describe("fetchMetadata", () => {
    it("requests the metadata endpoint and returns the body text", async () => {
        const f = vi.fn(async () => new Response("{}", { status: 200 }));
        expect(await fetchMetadata(42, f as unknown as typeof fetch)).toBe("{}");
        expect(f).toHaveBeenCalledWith("https://api.deadlock-api.com/v1/matches/42/metadata");
    });

    it("throws on a non-ok status", async () => {
        const f = vi.fn(async () => new Response("", { status: 429 }));
        await expect(fetchMetadata(42, f as unknown as typeof fetch)).rejects.toThrow();
    });

    it("keeps a busy answer typed, with the wait the API named", async () => {
        const f = vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "12" } }));
        const error = await fetchMetadata(42, f as unknown as typeof fetch).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(DeadlockApiError);
        expect((error as DeadlockApiError).retryAfterS).toBe(12);
    });

    it("keeps a 404 recognisable so the caller can tell a missing match from a failure", async () => {
        const f = vi.fn(async () => new Response("", { status: 404 }));
        await expect(fetchMetadata(42, f as unknown as typeof fetch)).rejects.toBeInstanceOf(DeadlockApiError);
    });

    it("reports a dropped connection in the app's words, not the browser's", async () => {
        const f = vi.fn(async () => {
            throw new TypeError("Failed to fetch");
        });
        await expect(fetchMetadata(42, f as unknown as typeof fetch)).rejects.toThrow(
            "A network request failed. Check your connection and try again.",
        );
    });
});

describe("resolveDetail provisional fallback", () => {
    const failFetch = () =>
        vi.fn(async () => {
            throw new Error("404");
        });

    it("uses the provisional detail when the API has no match", async () => {
        const provisional = vi.fn(async () => structuredClone(fixture));
        const s = source({ fetchText: failFetch(), provisional });
        const d = await resolveDetail(matchId, s);
        expect(d?.source).toBe("provisional");
        expect(provisional).toHaveBeenCalledWith(matchId);
        expect(s.write).not.toHaveBeenCalled();
    });

    it("prefers the API and never reads provisional data when the API answers", async () => {
        const provisional = vi.fn(async () => structuredClone(fixture));
        const d = await resolveDetail(matchId, source({ provisional }));
        expect(d?.source).toBe("api");
        expect(provisional).not.toHaveBeenCalled();
    });

    it("rethrows the API error when there is no provisional detail", async () => {
        const s = source({ fetchText: failFetch(), provisional: vi.fn(async () => null) });
        await expect(resolveDetail(matchId, s)).rejects.toThrow("404");
    });

    it("rejects provisional detail for another match", async () => {
        const other = structuredClone(fixture);
        other.match_info.match_id = matchId + 1;
        const s = source({ fetchText: failFetch(), provisional: vi.fn(async () => other) });
        await expect(resolveDetail(matchId, s)).rejects.toThrow("404");
    });
});

describe("resolveDetail when the API does not have the match", () => {
    const failWith = (error: Error) =>
        vi.fn(async () => {
            throw error;
        });

    it("resolves null on a 404 with no provisional detail", async () => {
        const s = source({ fetchText: failWith(new DeadlockApiError(404)) });
        expect(await resolveDetail(matchId, s)).toBeNull();
        expect(s.write).not.toHaveBeenCalled();
    });

    it("resolves null on a 404 when provisional detail is for another match", async () => {
        const other = structuredClone(fixture);
        other.match_info.match_id = matchId + 1;
        const s = source({ fetchText: failWith(new DeadlockApiError(404)), provisional: vi.fn(async () => other) });
        expect(await resolveDetail(matchId, s)).toBeNull();
    });

    it("still prefers provisional detail on a 404", async () => {
        const s = source({
            fetchText: failWith(new DeadlockApiError(404)),
            provisional: vi.fn(async () => structuredClone(fixture)),
        });
        expect((await resolveDetail(matchId, s))?.source).toBe("provisional");
    });

    it("still throws on a 500", async () => {
        const s = source({ fetchText: failWith(new DeadlockApiError(500)) });
        await expect(resolveDetail(matchId, s)).rejects.toThrow();
    });

    it("still throws on a network failure", async () => {
        const s = source({ fetchText: failWith(new TypeError("Failed to fetch")) });
        await expect(resolveDetail(matchId, s)).rejects.toThrow("Failed to fetch");
    });
});

describe("resolveDetail with details Deadlock+ decoded itself", () => {
    const local = JSON.stringify({ ...fixture, deadlock_plus_source: "replay_cdn" });
    const failWith = (error: Error) =>
        vi.fn(async () => {
            throw error;
        });

    it("still asks the API and caches the API copy over the local one", async () => {
        const s = source({ read: vi.fn(async () => local) });
        const d = await resolveDetail(matchId, s);
        expect(d?.source).toBe("api");
        expect(s.fetchText).toHaveBeenCalledWith(matchId);
        expect(s.write).toHaveBeenCalledWith(matchId, body);
    });

    it("shows the local copy when the API does not have the match yet", async () => {
        const provisional = vi.fn(async () => null);
        const s = source({
            read: vi.fn(async () => local),
            fetchText: failWith(new DeadlockApiError(404)),
            provisional,
        });
        const d = await resolveDetail(matchId, s);
        expect(d?.matchId).toBe(matchId);
        expect(d?.source).toBe("provisional");
        expect(provisional).not.toHaveBeenCalled();
        expect(s.write).not.toHaveBeenCalled();
    });

    it("shows the local copy when the API cannot be reached", async () => {
        const s = source({ read: vi.fn(async () => local), fetchText: failWith(new TypeError("Failed to fetch")) });
        expect((await resolveDetail(matchId, s))?.matchId).toBe(matchId);
    });
});

describe("resolveDetail fetching from Valve as the last resort", () => {
    const failWith = (error: Error) =>
        vi.fn(async () => {
            throw error;
        });

    it("shows details fetched from Valve when nothing else has the match", async () => {
        const valve = vi.fn(async () => structuredClone(fixture));
        const s = source({
            fetchText: failWith(new DeadlockApiError(404)),
            provisional: vi.fn(async () => null),
            valve,
        });
        const d = await resolveDetail(matchId, s);
        expect(d?.matchId).toBe(matchId);
        expect(d?.source).toBe("provisional");
        expect(valve).toHaveBeenCalledWith(matchId);
    });

    it("never asks Valve when the API answers or a capture fits", async () => {
        const valve = vi.fn(async () => structuredClone(fixture));
        await resolveDetail(matchId, source({ valve }));
        await resolveDetail(
            matchId,
            source({
                fetchText: failWith(new DeadlockApiError(404)),
                provisional: vi.fn(async () => structuredClone(fixture)),
                valve,
            }),
        );
        expect(valve).not.toHaveBeenCalled();
    });

    it("resolves null on a 404 when Valve has nothing or another match", async () => {
        const other = structuredClone(fixture);
        other.match_info.match_id = matchId + 1;
        for (const valve of [vi.fn(async () => null), vi.fn(async () => other), failWith(new Error("io"))]) {
            const s = source({ fetchText: failWith(new DeadlockApiError(404)), valve });
            expect(await resolveDetail(matchId, s)).toBeNull();
        }
    });
});
