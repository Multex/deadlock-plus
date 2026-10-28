import {
    failureStep,
    manualDownloadUrl,
    updateStage,
    type UpdateChannel,
    type UpdateSource,
    type UpdateStage,
} from "./flow";
import type { InstallSource } from "./nudge";
import { previewSource, type UpdatePreview } from "./preview";

export const UPDATES_ROUTE = "/updates";

/** The updater store as the updates page uses it. */
export interface UpdaterStore extends UpdateSource {
    readonly channel: UpdateChannel;
    check(): Promise<unknown>;
    /** Downloads and verifies the update, ending in "ready"; nothing installs yet. */
    download(): Promise<unknown>;
    /** Installs a "ready" update and starts the new version. */
    restart(): Promise<unknown>;
    setChannel(channel: UpdateChannel): unknown;
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
    private previewChannel = $state<UpdateChannel | null>(null);
    private readonly deps: SurfaceDeps;

    constructor(deps: SurfaceDeps) {
        this.deps = deps;
        this.previewChannel = deps.preview?.channel ?? null;
    }

    /** A pinned preview state stands in for the updater: nothing it shows can act on the real one. */
    get pinned(): boolean {
        return this.deps.preview?.state != null;
    }

    get source(): UpdateSource {
        const state = this.deps.preview?.state;
        return state ? previewSource(state, this.deps.currentVersion() ?? "0.0.0") : this.deps.updater;
    }

    get stage(): UpdateStage {
        return updateStage(this.source);
    }

    get channel(): UpdateChannel {
        return (this.deps.preview && this.previewChannel) || this.deps.updater.channel;
    }

    setChannel(channel: UpdateChannel) {
        if (this.deps.preview) {
            this.previewChannel = channel;
            return;
        }
        this.deps.updater.setChannel(channel);
    }

    show() {
        this.deps.navigate(UPDATES_ROUTE);
    }

    async check() {
        if (this.pinned) return;
        await this.deps.updater.check();
    }

    async download(source: InstallSource = "panel") {
        if (this.pinned) return;
        const { updater } = this.deps;
        if (updater.version) this.deps.track(updater.version, source);
        await updater.download();
    }

    /** An install from a toast or the banner runs on the page, so the user sees the download and the restart step. */
    async startFrom(source: InstallSource) {
        this.show();
        await this.download(source);
    }

    async restart() {
        if (this.pinned) return;
        await this.deps.updater.restart();
    }

    /** A failed install leaves no download to retry from, so it downloads again like a failed download. */
    async retry() {
        if (this.pinned) return;
        if (failureStep(this.source) === "check") await this.check();
        else await this.download();
    }

    openManualDownload() {
        this.deps.openUrl(manualDownloadUrl(this.channel));
    }
}
