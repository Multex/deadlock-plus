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
    return { level, clients, supportButton: typeof stored.supportButton === "boolean" ? stored.supportButton : true };
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
    const connected = status.clients.filter((c) => c.connected);
    if (connected.length === 0) return t("settings.discord.status_none");
    return t("settings.discord.status_showing", { clients: connected.map(clientLabel).join(", ") });
}

export type DiscordBarState = "off" | "searching" | "connected";

export function discordBarState(enabled: boolean, status: PresenceStatus | null): DiscordBarState {
    if (!enabled) return "off";
    return status?.clients.some((c) => c.connected) ? "connected" : "searching";
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
