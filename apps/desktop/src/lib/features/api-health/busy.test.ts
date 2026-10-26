import { describe, expect, it } from "vitest";
import { DeadlockApiError } from "@deadlock-plus/deadlock-api";
import { classifyApiFailure, nextRequestIn, retryDelayS } from "./busy";

describe("classifyApiFailure", () => {
    it("reads a 429 as busy with the wait the API named", () => {
        expect(classifyApiFailure(new DeadlockApiError(429, 12))).toEqual({ kind: "busy", retryAfterS: 12 });
    });

    it("reads a 503 as busy, with no wait when the API named none", () => {
        expect(classifyApiFailure(new DeadlockApiError(503))).toEqual({ kind: "busy", retryAfterS: null });
    });

    it("keeps any other status as an error with its code", () => {
        expect(classifyApiFailure(new DeadlockApiError(500))).toEqual({ kind: "error", status: 500 });
        expect(classifyApiFailure(new DeadlockApiError(404))).toEqual({ kind: "error", status: 404 });
    });

    it("reads a dropped connection as network", () => {
        expect(classifyApiFailure(new TypeError("Failed to fetch"))).toEqual({ kind: "network" });
    });

    it("reads anything else as an error without a status", () => {
        expect(classifyApiFailure(new Error("bad body"))).toEqual({ kind: "error", status: null });
        expect(classifyApiFailure("boom")).toEqual({ kind: "error", status: null });
    });
});

describe("retryDelayS", () => {
    it("waits what the API asked on the first try", () => {
        expect(retryDelayS(0, 12)).toBe(12);
    });

    it("waits the base when the API named no wait", () => {
        expect(retryDelayS(0, null)).toBe(10);
    });

    it("doubles with each try that is still busy", () => {
        expect(retryDelayS(1, 12)).toBe(20);
        expect(retryDelayS(2, 12)).toBe(40);
        expect(retryDelayS(3, null)).toBe(80);
    });

    it("never waits less than the API asked", () => {
        expect(retryDelayS(1, 45)).toBe(45);
    });

    it("stops growing at five minutes", () => {
        expect(retryDelayS(10, null)).toBe(300);
        expect(retryDelayS(0, 900)).toBe(300);
    });
});

describe("nextRequestIn", () => {
    it("reads the wait from a rate-limited body", () => {
        expect(nextRequestIn({ type: "ip", remaining: 0, next_request_in: 12 })).toBe(12);
    });

    it("rounds a fractional wait up", () => {
        expect(nextRequestIn({ next_request_in: 3.2 })).toBe(4);
    });

    it("is null for any other body", () => {
        expect(nextRequestIn(null)).toBeNull();
        expect(nextRequestIn([])).toBeNull();
        expect(nextRequestIn({ next_request_in: "soon" })).toBeNull();
        expect(nextRequestIn({ next_request_in: -1 })).toBeNull();
    });
});
