export type Channel = "web" | "app" | "direct";

export interface Invite {
    ref: string;
    channel: Channel;
    /** `null` on a web ref that has no invite of its own yet: it shares the website's, so its joins cannot be told apart. */
    code: string | null;
}

/** Shipped app builds open this invite, so it must never change or be revoked. */
export const APP_INVITE_CODE = "VM9utA3enT";

export const FALLBACK_CODE = "w8x6HGUefT";

/**
 * Discord counts joins per invite code and nothing else, so each ref needs its own code to be countable.
 * `app` and `direct` codes are linked from outside the website: revoking one breaks every shipped link to it.
 */
export const INVITES: readonly Invite[] = [
    { ref: "app", channel: "app", code: APP_INVITE_CODE },
    { ref: "general", channel: "direct", code: FALLBACK_CODE },
    // The GitHub README and CONTRIBUTING.md link this code directly as plain discord.gg links.
    { ref: "github", channel: "web", code: "652zsGZZgD" },
    { ref: "deadlock-api", channel: "web", code: "YCbXPdbekW" },
    { ref: "website", channel: "web", code: "KzWBUrQW3D" },
    { ref: "tiktok", channel: "web", code: "VR375cZwRJ" },
    { ref: "youtube", channel: "web", code: "Sa8PdZrVEa" },
    { ref: "reddit", channel: "web", code: "aTmYARWhdV" },
    { ref: "twitter", channel: "web", code: "tH5ZYTRGF5" },
    { ref: "bluesky", channel: "web", code: null },
    { ref: "steam", channel: "web", code: null },
];

export function inviteUrl(code: string): string {
    return `https://discord.gg/${code}`;
}

/** Opens the invite in the Discord app without a browser. It fails when Discord is not installed. */
export function inviteAppUrl(code: string): string {
    return `discord://-/invite/${code}`;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function slug(value: string | null | undefined): string | null {
    const lowered = value?.toLowerCase();
    return lowered && SLUG.test(lowered) ? lowered : null;
}

export function inviteByCode(code: string, invites: readonly Invite[] = INVITES): Invite | undefined {
    return invites.find((i) => i.code === code);
}
