import { SITE_URL } from "@deadlock-plus/links";
import { kvGet, kvSet } from "$lib/core/kv";

/** The game shows the description as plain text, so the site goes in without the protocol. */
export const SUPPORT_HOST = new URL(SITE_URL).host;

const STORE = "app-settings";
const KEY = "buildSupportFooter";
const SEPARATOR = "\n\n";
const LAST_LINE = /(?:\r?\n){0,2}([^\r\n]*)\s*$/;

/** Any translation of the footer keeps the app name and the site, so this spots it in every language. */
function isFooterLine(line: string): boolean {
    const lower = line.toLowerCase();
    return line.includes("Deadlock+") && lower.includes(SUPPORT_HOST);
}

function stripOnce(text: string): string | null {
    const match = LAST_LINE.exec(text);
    if (!match || !isFooterLine(match[1]!)) return null;
    return text.slice(0, match.index);
}

export function stripFooter(text: string): string {
    let rest = text;
    for (let next = stripOnce(rest); next !== null; next = stripOnce(rest)) rest = next;
    return rest;
}

export function hasFooter(text: string): boolean {
    return stripOnce(text) !== null;
}

/** The description as written out: the player's text, then `footer` when `on`. Never adds a second footer. */
export function withFooter(text: string, on: boolean, footer: string): string {
    const own = stripFooter(text);
    if (!on) return own;
    return own === "" ? footer : own + SEPARATOR + footer;
}

/** Characters the footer takes from the description limit. */
export function footerCost(footer: string): number {
    return SEPARATOR.length + footer.length;
}

export async function readSupportPreference(): Promise<boolean> {
    try {
        return (await kvGet<boolean>(STORE, KEY)) === true;
    } catch {
        return false;
    }
}

export async function writeSupportPreference(on: boolean): Promise<void> {
    try {
        await kvSet(STORE, KEY, on);
    } catch {
        // The choice just won't carry over to the next new build.
    }
}
