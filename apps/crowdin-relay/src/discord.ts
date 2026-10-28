import type { Message } from "@deadlock-plus/discord-messages";

export type Outcome =
    { ok: true; waitMs: number } | { ok: false; status: number | "network"; rateLimited: boolean; retryMs?: number };

/** Crowdin cannot add `?with_components=true` itself, and Discord rejects Components V2 without it. */
export function webhookTarget(webhookUrl: string): URL {
    const target = new URL(webhookUrl);
    target.searchParams.set("with_components", "true");
    return target;
}

function seconds(value: unknown): number | undefined {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return value !== null && value !== "" && Number.isFinite(n) && n >= 0 ? Math.ceil(n * 1000) : undefined;
}

async function retryAfter(res: Response): Promise<number | undefined> {
    let body: unknown;
    try {
        body = await res.json();
    } catch {
        body = undefined;
    }
    const fromBody =
        typeof body === "object" && body !== null ? (body as { retry_after?: unknown }).retry_after : undefined;
    return (
        seconds(fromBody) ??
        seconds(res.headers.get("x-ratelimit-reset-after")) ??
        seconds(res.headers.get("retry-after"))
    );
}

export async function send(target: URL, message: Message): Promise<Outcome> {
    let res: Response;
    try {
        res = await fetch(target, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(message),
        });
    } catch {
        return { ok: false, status: "network", rateLimited: false };
    }
    if (res.ok) {
        const exhausted = res.headers.get("x-ratelimit-remaining") === "0";
        return { ok: true, waitMs: exhausted ? (seconds(res.headers.get("x-ratelimit-reset-after")) ?? 0) : 0 };
    }
    if (res.status === 429) return { ok: false, status: 429, rateLimited: true, retryMs: await retryAfter(res) };
    return { ok: false, status: res.status, rateLimited: false, retryMs: seconds(res.headers.get("retry-after")) };
}
