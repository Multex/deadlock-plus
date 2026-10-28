import { describe, expect, it } from "vitest";
import { DeadlockApiError } from "@deadlock-plus/deadlock-api";
import { classifyHealth, healthFromFailure } from "./health";

describe("classifyHealth", () => {
    it("is ok when every service is up", () => {
        expect(classifyHealth({ services: { clickhouse: true, postgres: true, redis: true } })).toEqual({
            level: "ok",
            down: [],
        });
    });

    it("is degraded and names the services that are down", () => {
        expect(classifyHealth({ services: { clickhouse: true, postgres: false, redis: false } })).toEqual({
            level: "degraded",
            down: ["postgres", "redis"],
        });
    });

    it("is down for a malformed body", () => {
        expect(classifyHealth({})).toEqual({ level: "down", down: [] });
        expect(classifyHealth(null)).toEqual({ level: "down", down: [] });
    });
});

describe("healthFromFailure", () => {
    it("is busy when the API turns the check away with a 429 or 503", () => {
        expect(healthFromFailure(new DeadlockApiError(429, 12))).toEqual({ level: "busy", down: [] });
        expect(healthFromFailure(new DeadlockApiError(503))).toEqual({ level: "busy", down: [] });
    });

    it("is down when the API cannot be reached or answers another error", () => {
        expect(healthFromFailure(new TypeError("Failed to fetch"))).toEqual({ level: "down", down: [] });
        expect(healthFromFailure(new DeadlockApiError(500))).toEqual({ level: "down", down: [] });
    });
});
