import { SITE_URL } from "@deadlock-plus/links/urls";

export const SITE_NAME = "Deadlock+";

/** Shown in a link preview for a page that has no description of its own. */
export const SITE_DESCRIPTION = "A free companion app for Deadlock. No account needed.";

export const OG_IMAGE = {
    path: "/og.png",
    width: 1200,
    height: 630,
    alt: "Deadlock+, a free companion app for Deadlock, next to a match page from the app.",
};

export function socialMeta(path: string): { url: string; image: string } {
    return { url: `${SITE_URL}${path}`, image: `${SITE_URL}${OG_IMAGE.path}` };
}
