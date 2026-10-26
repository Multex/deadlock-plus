import { classifyApiFailure } from "./busy";

export type HealthLevel = "ok" | "degraded" | "busy" | "down";

export interface HealthResult {
    level: HealthLevel;
    down: string[];
}

export function classifyHealth(body: unknown): HealthResult {
    const services = (body as { services?: unknown } | null)?.services;
    if (!services || typeof services !== "object") return { level: "down", down: [] };
    const down = Object.entries(services)
        .filter(([, up]) => up !== true)
        .map(([name]) => name);
    return { level: down.length ? "degraded" : "ok", down };
}

/** A check turned away for load is "busy": the API is there, it is only asking clients to slow down. */
export function healthFromFailure(e: unknown): HealthResult {
    return { level: classifyApiFailure(e).kind === "busy" ? "busy" : "down", down: [] };
}
