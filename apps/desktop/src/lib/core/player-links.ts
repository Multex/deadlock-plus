import { openWithDeeplink } from "./deeplink";
import { openLink } from "./open-link";

export type ProfileSite = "steam" | "statlocker" | "buildlocker";

// SteamID64s exceed 2^53, so they stay strings and the offset math runs in BigInt.
const STEAM64_OFFSET = 76561197960265728n;
const STEAM64_RE = /^7656119\d{10}$/;

export function steam64ToSteam32(steamid64: string): string {
    return (BigInt(steamid64) - STEAM64_OFFSET).toString();
}

export function steam32ToSteam64(steamid32: string): string | null {
    if (!/^\d+$/.test(steamid32)) return null;
    return (BigInt(steamid32) + STEAM64_OFFSET).toString();
}

/** Accepts a SteamID64, a 32-bit account id, `[U:1:n]`, or a `/profiles/<id64>` link. */
export function parseSteamId(input: string): string | null {
    const s = input.trim();
    if (STEAM64_RE.test(s)) return s;
    if (/^\d{1,10}$/.test(s)) {
        const id = steam32ToSteam64(s);
        return id && STEAM64_RE.test(id) ? id : null;
    }
    const u3 = /^\[U:1:(\d{1,10})\]$/.exec(s);
    if (u3) return parseSteamId(u3[1]);
    const link = /steamcommunity\.com\/profiles\/(\d{17})/.exec(s);
    return link && STEAM64_RE.test(link[1]) ? link[1] : null;
}

/** False for bots and anonymous players, which have no account id or 0. */
export function hasProfile(accountId: number | null | undefined): accountId is number {
    return typeof accountId === "number" && accountId > 0;
}

export function profileUrl(site: ProfileSite, accountId: number): string {
    switch (site) {
        case "steam":
            return `https://steamcommunity.com/profiles/${steam32ToSteam64(String(accountId))}`;
        case "statlocker":
            return `https://statlocker.gg/profile/${accountId}/matches`;
        case "buildlocker":
            return `https://buildlocker.gg/builds/profile/${accountId}`;
    }
}

export function buildlockerBuildUrl(heroBuildId: number): string {
    return `https://buildlocker.gg/builds/build/${heroBuildId}`;
}

/** Never rejects. Steam tries the Steam client first, then the browser. */
export async function openProfile(
    site: ProfileSite,
    accountId: number,
    open?: (url: string) => Promise<void>,
): Promise<void> {
    const url = profileUrl(site, accountId);
    if (site !== "steam") return openLink(url, open);
    await openLink(url, (target) => openWithDeeplink(target, open));
}

/** Never rejects. */
export async function openBuildOnBuildlocker(
    heroBuildId: number,
    open?: (url: string) => Promise<void>,
): Promise<void> {
    await openLink(buildlockerBuildUrl(heroBuildId), open);
}
