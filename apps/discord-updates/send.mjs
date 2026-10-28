const MAX_TRIES = 5;
const MAX_ERROR_BODY = 500;

async function retryAfterMs(res) {
    try {
        const { retry_after } = await res.json();
        if (typeof retry_after === "number") return Math.ceil(retry_after * 1000);
    } catch {
        // Fall back to the header when the body is not JSON.
    }
    return Math.ceil(Number(res.headers.get("retry-after") ?? 1) * 1000);
}

/**
 * Posts `messages` to a Discord webhook one at a time, each only after Discord has stored the one before.
 * Rejects at the first message that fails, naming it, so a gap in the post never goes unnoticed.
 */
export async function post(
    webhook,
    messages,
    { fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
    const target = new URL(webhook);
    target.searchParams.set("wait", "true");
    target.searchParams.set("with_components", "true");

    for (const [i, msg] of messages.entries()) {
        const where = `part ${i + 1} of ${messages.length} (${i} of ${messages.length} posted)`;
        for (let tries = 1; ; tries += 1) {
            let res;
            try {
                res = await fetch(target, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(msg),
                });
            } catch (err) {
                throw new Error(`Discord did not answer for ${where}: ${err.message}`);
            }
            if (res.ok) break;
            if (res.status === 429 && tries < MAX_TRIES) {
                await sleep(await retryAfterMs(res));
                continue;
            }
            const body = (await res.text().catch(() => "")).slice(0, MAX_ERROR_BODY);
            throw new Error(`Discord rejected ${where}: ${res.status} ${body}`.trim());
        }
    }
}
