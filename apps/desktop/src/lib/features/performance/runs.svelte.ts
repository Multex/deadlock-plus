import { toast } from "svelte-sonner";
import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import type { FrameStats } from "./api";
import { addRun, makeRun, readRuns, removeRun, writeRuns, type SavedRun } from "./runs";

class SavedRunsStore {
    runs = $state<SavedRun[]>([]);
    loaded = false;

    async load() {
        if (this.loaded) return;
        this.loaded = true;
        this.runs = await readRuns();
    }

    async save(label: string, addons: string[], stats: FrameStats): Promise<boolean> {
        const next = addRun(this.runs, makeRun(label, addons, stats, Date.now(), crypto.randomUUID()));
        return this.commit(next, t("performance.runs.save_failed"));
    }

    async remove(id: string): Promise<boolean> {
        return this.commit(removeRun(this.runs, id), t("performance.runs.delete_failed"));
    }

    /** The list only changes once the write lands, so a failed write leaves what the player sees untouched. */
    private async commit(next: SavedRun[], fallback: string): Promise<boolean> {
        try {
            await writeRuns(next);
            this.runs = next;
            return true;
        } catch (e) {
            toast.error(failureText(e, fallback));
            return false;
        }
    }
}

export const savedRuns = new SavedRunsStore();
