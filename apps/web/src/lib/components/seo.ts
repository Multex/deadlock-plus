import { SITE_URL } from "@deadlock-plus/links/urls";

export const SITE_NAME = "Deadlock+";

export const OG_IMAGE = {
    path: "/og.png",
    width: 1200,
    height: 630,
};

export function socialMeta(path: string): { url: string; image: string } {
    return { url: `${SITE_URL}${path}`, image: `${SITE_URL}${OG_IMAGE.path}` };
}
