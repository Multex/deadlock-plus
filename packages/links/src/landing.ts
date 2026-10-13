import { slug } from "./invites";

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
