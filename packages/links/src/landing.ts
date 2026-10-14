import { INVITES, slug } from "./invites";

/**
 * Short paths for places that show the site's address as plain text, where a viewer types it and a query is lost.
 * `/<ref>` lands on the home page counted under that ref. An entry must not be the name of a page.
 *
 * The first part is the platform: `tt` is TikTok, `yt` is YouTube. The suffix is where the address is shown:
 * none for the video itself, `-b` for the bio or channel description, `-p` for a pinned comment.
 */
export const LANDING_REFS = ["tt", "tt-b", "tt-p", "yt", "yt-b", "yt-p"] as const;

export type LandingRef = (typeof LANDING_REFS)[number];

export function landingRef(raw: string | null | undefined): LandingRef | null {
    const ref = slug(raw);
    return LANDING_REFS.find((listed) => listed === ref) ?? null;
}
/** The invite ref of each platform a landing ref can start with. A new platform is one line here. */
const PLATFORM_INVITES: Record<string, string> = { tt: "tiktok", yt: "youtube" };

const DEFAULT_INVITE_REF = "website";

/** Which invite a visitor who arrived under `ref` should get: their platform's, the ref's own, or the website's. */
export function inviteRefFor(ref: string | null | undefined): string {
    const landing = landingRef(ref);
    if (landing) return PLATFORM_INVITES[landing.split("-")[0]!] ?? DEFAULT_INVITE_REF;
    const own = slug(ref);
    return INVITES.some((i) => i.channel === "web" && i.ref === own && i.code !== null) ? own! : DEFAULT_INVITE_REF;
}
