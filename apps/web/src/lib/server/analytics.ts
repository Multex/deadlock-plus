import { send as sendBatch, type AnalyticsEvent, type Fetcher } from "@deadlock-plus/analytics";

export interface AnalyticsEnv {
    POSTHOG_KEY?: string;
    POSTHOG_HOST?: string;
}

export function send(env: AnalyticsEnv, events: AnalyticsEvent[], fetcher: Fetcher = fetch): Promise<void> {
    return sendBatch({ apiKey: env.POSTHOG_KEY, host: env.POSTHOG_HOST, fetch: fetcher }, events);
}
