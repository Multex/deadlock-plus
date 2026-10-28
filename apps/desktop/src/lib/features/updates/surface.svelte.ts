import {
    failureStep,
    manualDownloadUrl,
    updateStage,
    type UpdateChannel,
    type UpdateSource,
    type UpdateStage,
} from "./flow";
import type { InstallSource } from "./nudge";
import {
    DEFAULT_CHIP,
    DEFAULT_LAYOUT,
    PREVIEW_RATE,
    previewSource,
    type ChipVariant,
    type UpdateLayout,
    type UpdatePreview,
} from "./preview";

export const UPDATES_ROUTE = "/updates";

/**
 * The updater store as the update surfaces use it. `download`, `restart`, `channel` and `setChannel` are optional:
 * without a separate download step, `install` downloads, installs and restarts in one go.
 */
export interface UpdaterStore extends UpdateSource {
    readonly channel?: UpdateChannel;
    check(): Promise<unknown>;
    install(): Promise<unknown>;
    download?(): Promise<unknown>;
    restart?(): Promise<unknown>;
    setChannel?(channel: UpdateChannel): unknown;
}

export interface SurfaceDeps {
    updater: UpdaterStore;
    preview: UpdatePreview | null;
    currentVersion(): string | null;
    track(version: string, source: InstallSource): void;
    navigate(href: string): void;
    openUrl(url: string): void;
}

export class UpdateSurface {
    open = $state(false);
    private previewChannel = $state<UpdateChannel | null>(null);
    private readonly deps: SurfaceDeps;

    constructor(deps: SurfaceDeps) {
        this.deps = deps;
        this.previewChannel = deps.preview?.channel ?? null;
        this.open = this.pinned && this.layout !== "page";
    }

    get layout(): UpdateLayout {
        return this.deps.preview?.layout ?? DEFAULT_LAYOUT;
    }

    get chip(): ChipVariant {
        return this.deps.preview?.chip ?? DEFAULT_CHIP;
    }

    /** A pinned preview state stands in for the updater: nothing it shows can act on the real one. */
    get pinned(): boolean {
        return this.deps.preview?.state != null;
    }

    /** The download speed a pinned preview shows; undefined means measure the real one. */
    get pinnedRate(): number | undefined {
        return this.pinned ? PREVIEW_RATE : undefined;
    }

    get source(): UpdateSource {
        const state = this.deps.preview?.state;
        return state ? previewSource(state, this.deps.currentVersion() ?? "0.0.0") : this.deps.updater;
    }

    get stage(): UpdateStage {
        return updateStage(this.source);
    }

    get channel(): UpdateChannel {
        if (this.deps.preview) return this.previewChannel ?? this.deps.updater.channel ?? "release";
        return this.deps.updater.channel ?? "release";
    }

    setChannel(channel: UpdateChannel) {
        if (this.deps.preview) {
            this.previewChannel = channel;
            return;
        }
        this.deps.updater.setChannel?.(channel);
    }

    show() {
        if (this.layout === "page") this.deps.navigate(UPDATES_ROUTE);
        else this.open = true;
    }

    async check() {
        if (this.pinned) return;
        await this.deps.updater.check();
    }

    async download() {
        if (this.pinned) return;
        const { updater } = this.deps;
        if (updater.version) this.deps.track(updater.version, "panel");
        await (updater.download ? updater.download() : updater.install());
    }

    async restart() {
        if (this.pinned) return;
        const { updater } = this.deps;
        await (updater.restart ? updater.restart() : updater.install());
    }

    async retry() {
        if (this.pinned) return;
        if (failureStep(this.source) === "download") await this.download();
        else await this.check();
    }

    openManualDownload() {
        this.deps.openUrl(manualDownloadUrl(this.channel));
    }
}
