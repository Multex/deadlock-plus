import { inviteRefFor, slug } from "@deadlock-plus/links";

export type DownloadPlatform = "windows" | "deb" | "appimage";

export function currentRef(url: URL): string | null {
    return slug(url.searchParams.get("ref"));
}

export function withRef(href: string, ref: string | null): string {
    if (!ref || !href.startsWith("/") || href.startsWith("//")) return href;
    const hash = href.indexOf("#");
    const path = hash === -1 ? href : href.slice(0, hash);
    const fragment = hash === -1 ? "" : href.slice(hash);
    const query = path.indexOf("?");
    if (query !== -1 && new URLSearchParams(path.slice(query + 1)).has("ref")) return href;
    return `${path}${query === -1 ? "?" : "&"}ref=${ref}${fragment}`;
}

export function discordHref(ref: string | null): string {
    return `/discord/${inviteRefFor(ref)}`;
}

export function downloadHref(platform: DownloadPlatform, version: string | null, ref: string | null): string {
    const params = new URLSearchParams();
    if (version) params.set("v", version);
    if (ref) params.set("ref", ref);
    const query = params.toString();
    return `/get/${platform}${query ? `?${query}` : ""}`;
}
