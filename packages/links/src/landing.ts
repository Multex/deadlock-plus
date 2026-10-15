export interface Landing {
    /** Typed after the site's address, as `/<path>`. */
    path: string;
    /** The web invite a visitor who arrived on this path is counted under. */
    ref: string;
}

/**
 * Short paths for places that show the site's address as plain text, where a viewer types it and a query is lost.
 * `/<path>` lands on the home page counted under that path.
 *
 * The first part is the platform: `tt` is TikTok, `yt` is YouTube. The suffix is where the address is shown:
 * none for the video itself, `-b` for the bio or channel description, `-p` for a pinned comment.
 */
export const LANDINGS: readonly Landing[] = [
    { path: "tt", ref: "tiktok" },
    { path: "tt-b", ref: "tiktok" },
    { path: "tt-p", ref: "tiktok" },
    { path: "yt", ref: "youtube" },
    { path: "yt-b", ref: "youtube" },
    { path: "yt-p", ref: "youtube" },
];
