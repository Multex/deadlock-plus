import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import { onBeforeExit } from "$lib/core/exit";
import * as api from "./api";

import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
import type { PresencePlaceholder } from "@deadlock-plus/ipc-types/PresencePlaceholder";
import type { PresenceStateInfo } from "@deadlock-plus/ipc-types/PresenceStateInfo";

const SAVE_DEBOUNCE_MS = 400;

export type PresenceConfigApi = Pick<
    typeof api,
    | "presenceConfig"
    | "setPresenceConfig"
    | "presenceDefaults"
    | "presenceLayout"
    | "presencePlaceholders"
    | "exportPresenceConfig"
    | "importPresenceConfig"
>;

export type PresenceLoadStatus = "loading" | "ready" | "error";

const emptyConfig = (): PresenceConfig => ({ states: {}, variants: {}, heroes: {} });

export class PresenceConfigStore {
    config = $state<PresenceConfig>(emptyConfig());
    defaults = $state<PresenceConfig>(emptyConfig());
    layout = $state<PresenceStateInfo[]>([]);
    placeholders = $state<PresencePlaceholder[]>([]);
    status = $state<PresenceLoadStatus>("loading");
    error = $state<string | null>(null);
    importError = $state("");

    private timer: ReturnType<typeof setTimeout> | undefined;
    private dirty = false;
    private saving: Promise<void> = Promise.resolve();

    constructor(private backend: PresenceConfigApi = api) {}

    async load() {
        if (this.status === "error") this.status = "loading";
        try {
            // A pending edit is newer than what the backend holds; save it first or it is overwritten.
            await this.flush();
            const [config, defaults, layout, placeholders] = await Promise.all([
                this.backend.presenceConfig(),
                this.backend.presenceDefaults(),
                this.backend.presenceLayout(),
                this.backend.presencePlaceholders(),
            ]);
            this.config = config;
            this.defaults = defaults;
            this.layout = layout;
            this.placeholders = placeholders;
            this.status = "ready";
        } catch {
            this.status = "error";
        }
    }

    edit(next: PresenceConfig) {
        this.config = next;
        this.dirty = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
    }

    async flush() {
        clearTimeout(this.timer);
        if (this.dirty) {
            this.dirty = false;
            const snapshot = $state.snapshot(this.config) as PresenceConfig;
            this.saving = this.saving.then(() => this.save(snapshot));
        }
        await this.saving;
    }

    /** False when the text was not a preset; the editor keeps what it had. */
    async importText(text: string): Promise<boolean> {
        this.importError = "";
        let imported: PresenceConfig;
        try {
            imported = await this.backend.importPresenceConfig(text);
        } catch (e) {
            this.importError = failureText(e, t("settings.discord_editor.import_failed"));
            return false;
        }
        clearTimeout(this.timer);
        this.dirty = false;
        this.config = imported;
        this.error = null;
        return true;
    }

    async exportText() {
        await this.flush();
        return this.backend.exportPresenceConfig();
    }

    async resetAll() {
        this.edit(emptyConfig());
        await this.flush();
    }

    private async save(config: PresenceConfig) {
        try {
            await this.backend.setPresenceConfig(config);
            this.error = null;
        } catch (e) {
            this.error = failureText(e, t("settings.discord_editor.save_failed"));
        }
    }
}

export const presenceConfigStore = new PresenceConfigStore();

onBeforeExit(() => presenceConfigStore.flush());
