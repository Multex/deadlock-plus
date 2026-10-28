import type { Hero } from "$lib/features/heroes/heroes";
import { t } from "$lib/core/i18n.svelte";
import type { DiscordClientKind } from "@deadlock-plus/ipc-types/DiscordClientKind";
import type { PresenceHeroArt } from "@deadlock-plus/ipc-types/PresenceHeroArt";
import type { PresenceClient } from "@deadlock-plus/ipc-types/PresenceClient";
import type { PresenceLevelSetting } from "@deadlock-plus/ipc-types/PresenceLevelSetting";
import type { PresenceSettings } from "@deadlock-plus/ipc-types/PresenceSettings";
import type { PresenceStatus } from "@deadlock-plus/ipc-types/PresenceStatus";

export const ALL_CLIENT_KINDS: DiscordClientKind[] = ["stable", "ptb", "canary", "other"];
export const PRESENCE_LEVELS: PresenceLevelSetting[] = ["off", "basic", "detailed"];

export const DEFAULT_PRESENCE: PresenceSettings = { level: "off", clients: ALL_CLIENT_KINDS, supportButton: true };
export const DEFAULT_DEADLOCK_PLUS_LOGO = false;
export const DEFAULT_DELAY_SECS = 0;
export const MAX_DELAY_SECS = 120;
export const DELAY_RANGE = { min: 0, max: MAX_DELAY_SECS, step: 5 };

export function delaySecsOf(settings: PresenceSettings): number {
    return settings.delaySecs ?? DEFAULT_DELAY_SECS;
}

export function delayLabel(secs: number): string {
    return secs === 0 ? t("settings.discord.delay_off") : t("settings.discord.delay_seconds", { seconds: secs });
}

function clampDelay(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
    return Math.min(MAX_DELAY_SECS, Math.round(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function canonical(kinds: Iterable<unknown>): DiscordClientKind[] {
    const set = new Set(kinds);
    return ALL_CLIENT_KINDS.filter((kind) => set.has(kind));
}

export function resolvePresence(raw: unknown): PresenceSettings {
    const stored = isRecord(raw) ? raw : {};
    const level = PRESENCE_LEVELS.find((l) => l === stored.level) ?? DEFAULT_PRESENCE.level;
    const clients = Array.isArray(stored.clients) ? canonical(stored.clients) : [...DEFAULT_PRESENCE.clients];
    const supportButton = typeof stored.supportButton === "boolean" ? stored.supportButton : true;
    const resolved: PresenceSettings = { level, clients, supportButton };
    if (typeof stored.deadlockPlusLogo === "boolean") resolved.deadlockPlusLogo = stored.deadlockPlusLogo;
    const delaySecs = clampDelay(stored.delaySecs);
    if (delaySecs !== undefined && delaySecs !== DEFAULT_DELAY_SECS) resolved.delaySecs = delaySecs;
    return resolved;
}

export function showsDeadlockPlusLogo(settings: PresenceSettings): boolean {
    return settings.deadlockPlusLogo ?? DEFAULT_DEADLOCK_PLUS_LOGO;
}

/** The logo and delay choices are kept only while they differ from the default, so a new default reaches everyone who
 * never chose. */
export function patchPresence(current: PresenceSettings, patch: Partial<PresenceSettings>): PresenceSettings {
    const next = { ...current, ...patch };
    if (next.deadlockPlusLogo === undefined || next.deadlockPlusLogo === DEFAULT_DEADLOCK_PLUS_LOGO) {
        delete next.deadlockPlusLogo;
    }
    const delaySecs = clampDelay(next.delaySecs);
    if (delaySecs === undefined || delaySecs === DEFAULT_DELAY_SECS) delete next.delaySecs;
    else next.delaySecs = delaySecs;
    return next;
}

export function toggleClient(clients: DiscordClientKind[], kind: DiscordClientKind, on: boolean): DiscordClientKind[] {
    return canonical(on ? [...clients, kind] : clients.filter((c) => c !== kind));
}

export function clientLabel(client: PresenceClient): string {
    switch (client.kind) {
        case "stable":
            return t("settings.discord.client_stable_name");
        case "ptb":
            return t("settings.discord.client_ptb_name");
        case "canary":
            return t("settings.discord.client_canary_name");
        case "other":
            return t("settings.discord.client_other_name", { pipe: client.pipeIndex });
    }
}

export function runningLine(enabled: boolean, status: PresenceStatus | null): string {
    if (!enabled) return t("settings.discord.status_off");
    if (!status) return "";
    switch (status.link) {
        case "notFound":
            return t("settings.discord.status_none");
        case "waiting":
            return t("settings.discord.status_waiting");
        case "connecting":
            return t("settings.discord.status_connecting");
        case "connected": {
            const connected = status.clients.filter((c) => c.connected).map(clientLabel);
            return t("settings.discord.status_showing", { clients: connected.join(", ") });
        }
    }
}

export type DiscordBarState = "off" | "checking" | "missing" | "waiting" | "connecting" | "connected";

export function discordBarState(enabled: boolean, status: PresenceStatus | null): DiscordBarState {
    if (!enabled) return "off";
    if (!status) return "checking";
    return status.link === "notFound" ? "missing" : status.link;
}

/** `label` is null when the icon alone says it. */
export function discordBarCopy(state: DiscordBarState): { label: string | null; title: string } {
    switch (state) {
        case "off":
            return { label: t("shell.statusbar.discord.off"), title: t("shell.statusbar.discord.off_title") };
        case "checking":
            return { label: t("shell.statusbar.discord.checking"), title: t("shell.statusbar.discord.checking") };
        case "missing":
            return {
                label: t("shell.statusbar.discord.searching"),
                title: t("shell.statusbar.discord.searching_title"),
            };
        case "waiting":
            return { label: t("shell.statusbar.discord.waiting"), title: t("shell.statusbar.discord.waiting_title") };
        case "connecting":
            return {
                label: t("shell.statusbar.discord.connecting"),
                title: t("shell.statusbar.discord.connecting_title"),
            };
        case "connected":
            return { label: null, title: t("shell.statusbar.discord.connected_title") };
    }
}

export function runningKinds(status: PresenceStatus | null): Set<DiscordClientKind> {
    return new Set(status?.clients.map((c) => c.kind));
}

/** Discord cannot reach local files, so it gets the remote URLs. */
export function heroArtMap(heroes: Record<number, Hero>): Record<number, PresenceHeroArt> {
    const out: Record<number, PresenceHeroArt> = {};
    for (const hero of Object.values(heroes)) {
        out[hero.id] = {
            name: hero.name,
            portrait: hero.apiPortrait !== undefined ? hero.apiPortrait : hero.portrait,
            icon: hero.apiArtIcon !== undefined ? hero.apiArtIcon : hero.artIcon,
            hideoutLine: hero.hideoutLine,
        };
    }
    return out;
}
