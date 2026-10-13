import { buildEvent, type AnalyticsEvent } from "@deadlock-plus/analytics";
import { inviteUrl, resolveWebRef, slug } from "@deadlock-plus/links";

const DIRECT = "$direct";

export interface Source {
    ref: string | null;
    referrer: string;
    referringDomain: string;
}

/** Only the referring origin is kept: the path and query of someone else's page are not ours to store. */
export function source(url: URL, referer: string | null): Source {
    const ref = slug(url.searchParams.get("ref")) ?? slug(url.searchParams.get("utm_source"));
    let from: URL | null = null;
    try {
        from = referer ? new URL(referer) : null;
    } catch {
        from = null;
    }
    if (!from || (from.protocol !== "https:" && from.protocol !== "http:")) {
        return { ref, referrer: DIRECT, referringDomain: DIRECT };
    }
    return { ref, referrer: from.origin, referringDomain: from.hostname.replace(/^www\./, "") };
}

const BOT =
    /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|monitor|uptime|curl|wget|python|go-http/i;

/** Link previewers fetch every posted link, so an unfiltered invite link counts one click per chat it is pasted in. */
export function isBot(userAgent: string | null): boolean {
    return !userAgent || BOT.test(userAgent);
}

export interface PageResult {
    routeId: string | null;
    status: number;
    contentType: string | null;
    country: string | undefined;
}

export function pageview(request: Request, page: PageResult, now = new Date()): AnalyticsEvent | null {
    if (request.method !== "GET" || page.status !== 200) return null;
    if (!page.routeId || page.routeId.startsWith("/discord")) return null;
    if (!page.contentType?.startsWith("text/html")) return null;
    if (isBot(request.headers.get("user-agent"))) return null;

    const url = new URL(request.url);
    const from = source(url, request.headers.get("referer"));
    return buildEvent(
        "$pageview",
        {
            $current_url: url.origin + url.pathname,
            $host: url.host,
            $pathname: url.pathname,
            $referrer: from.referrer,
            $referring_domain: from.referringDomain,
            ref: from.ref,
            country: page.country,
        },
        now,
    );
}

export interface DiscordClick {
    location: string;
    event: AnalyticsEvent | null;
}

export function discordClick(
    request: Request,
    rawRef: string | undefined,
    country: string | undefined,
    now = new Date(),
): DiscordClick {
    const { ref, code, known } = resolveWebRef(rawRef);
    const location = inviteUrl(code);
    if (isBot(request.headers.get("user-agent"))) return { location, event: null };

    const from = source(new URL(request.url), request.headers.get("referer"));
    const event = buildEvent(
        "discord_invite_click",
        {
            ref,
            channel: "web",
            known,
            code,
            $referrer: from.referrer,
            $referring_domain: from.referringDomain,
            country,
        },
        now,
    );
    return { location, event };
}
