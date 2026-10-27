import { command } from "$lib/core/tauri";

import type { PresenceCard } from "@deadlock-plus/ipc-types/PresenceCard";
import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
import type { PresenceHeroArt } from "@deadlock-plus/ipc-types/PresenceHeroArt";
import type { PresencePlaceholder } from "@deadlock-plus/ipc-types/PresencePlaceholder";
import type { PresenceSample } from "@deadlock-plus/ipc-types/PresenceSample";
import type { PresenceSettings } from "@deadlock-plus/ipc-types/PresenceSettings";
import type { PresenceStatus } from "@deadlock-plus/ipc-types/PresenceStatus";
import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
import type { PresenceStateInfo } from "@deadlock-plus/ipc-types/PresenceStateInfo";
import type { PresenceVariantId } from "@deadlock-plus/ipc-types/PresenceVariantId";

export const setPresenceSettings = (settings: PresenceSettings) => command("set_presence_settings", { settings });

export const presenceStatus = () => command<PresenceStatus>("presence_status");

export const setPresenceArt = (heroes: Record<number, PresenceHeroArt>, ranks: Record<number, string>) =>
    command("set_presence_art", { heroes, ranks });

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isConfig = (value: unknown): value is PresenceConfig =>
    isRecord(value) && isRecord(value.states) && isRecord(value.variants) && isRecord(value.heroes);

const isStateInfo = (value: unknown): value is PresenceStateInfo =>
    isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.variants) &&
    typeof value.heroScope === "boolean";

const isPlaceholder = (value: unknown): value is PresencePlaceholder =>
    isRecord(value) && typeof value.name === "string" && typeof value.sensitive === "boolean";

// An empty layout leaves the editor with nothing to edit, so it counts as a bad answer too.
const isLayout = (value: unknown): value is PresenceStateInfo[] =>
    Array.isArray(value) && value.length > 0 && value.every(isStateInfo);

const isPlaceholders = (value: unknown): value is PresencePlaceholder[] =>
    Array.isArray(value) && value.every(isPlaceholder);

async function checked<T>(name: string, guard: (value: unknown) => value is T): Promise<T> {
    const value = await command<unknown>(name);
    if (!guard(value)) throw new Error(`${name} answered an unexpected shape`);
    return value;
}

export const presenceConfig = () => checked("presence_config", isConfig);

export const setPresenceConfig = (config: PresenceConfig) => command("set_presence_config", { config });

export const presenceDefaults = () => checked("presence_defaults", isConfig);

export const presenceLayout = () => checked("presence_layout", isLayout);

export const presencePlaceholders = () => checked("presence_placeholders", isPlaceholders);

export const exportPresenceConfig = () => command<string>("export_presence_config");

export const importPresenceConfig = (text: string) => command<PresenceConfig>("import_presence_config", { text });

export const presencePreview = (
    config: PresenceConfig,
    state: PresenceStateId,
    variant: PresenceVariantId | null,
    heroId: number | null,
    sample: PresenceSample | null,
) => command<PresenceCard | null>("presence_preview", { config, state, variant, heroId, sample });
