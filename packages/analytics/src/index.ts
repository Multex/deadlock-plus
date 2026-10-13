export interface AnalyticsEvent {
    event: string;
    distinct_id: string;
    timestamp: string;
    properties: Record<string, unknown>;
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface Transport {
    apiKey?: string;
    host?: string;
    /** Defaults to the global `fetch`. */
    fetch?: Fetcher;
}

/**
 * Every event gets a fresh id and no person profile, so nothing links two requests to one visitor.
 * GeoIP is off because PostHog would locate the sender, not the visitor.
 */
export function buildEvent(event: string, properties: Record<string, unknown>, now = new Date()): AnalyticsEvent {
    return {
        event,
        distinct_id: crypto.randomUUID(),
        timestamp: now.toISOString(),
        properties: { ...properties, $process_person_profile: false, $geoip_disable: true },
    };
}

export async function send(transport: Transport, events: AnalyticsEvent[]): Promise<void> {
    const { apiKey, host } = transport;
    if (!apiKey || !host || events.length === 0) return;
    // Called as a plain function: a Worker's `fetch` throws when invoked as a method of another object.
    const fetcher = transport.fetch ?? fetch;
    try {
        const response = await fetcher(`${host.replace(/\/+$/, "")}/batch/`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ api_key: apiKey, batch: events }),
        });
        if (!response.ok) console.error(`analytics batch rejected: ${response.status}`);
    } catch {
        console.error("analytics batch not sent");
    }
}
