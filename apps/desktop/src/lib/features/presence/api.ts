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

export const presenceConfig = () => command<PresenceConfig>("presence_config");

export const setPresenceConfig = (config: PresenceConfig) => command("set_presence_config", { config });

export const presenceDefaults = () => command<PresenceConfig>("presence_defaults");

export const presenceLayout = () => command<PresenceStateInfo[]>("presence_layout");

export const presencePlaceholders = () => command<PresencePlaceholder[]>("presence_placeholders");

export const exportPresenceConfig = () => command<string>("export_presence_config");

export const importPresenceConfig = (text: string) => command<PresenceConfig>("import_presence_config", { text });

export const presencePreview = (
    config: PresenceConfig,
    state: PresenceStateId,
    variant: PresenceVariantId | null,
    heroId: number | null,
    sample: PresenceSample | null,
) => command<PresenceCard | null>("presence_preview", { config, state, variant, heroId, sample });
