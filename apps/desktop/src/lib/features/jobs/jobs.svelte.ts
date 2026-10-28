import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import { forceRunJob, jobsSnapshot, onJobsChanged, setAllJobsEnabled, setJobEnabled, setJobPolicy } from "./api";
import { activeJobs, isJobEnabled, type Policy } from "./jobs";
import { toast } from "svelte-sonner";
import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import { settingSaveFailed } from "$lib/features/settings/save-failed";

type Listener = (snapshot: JobsSnapshot) => void;

class JobsStore {
    snapshot = $state<JobsSnapshot | null>(null);
    private listeners = new Set<Listener>();

    active = $derived(activeJobs(this.snapshot?.jobs ?? []));
    gameRunning = $derived(this.snapshot?.gameRunning ?? null);
    catalog = $derived(this.snapshot?.catalog ?? []);
    allEnabled = $derived(this.snapshot?.allEnabled ?? true);

    isActive(id: string): boolean {
        return this.active.some((j) => j.id === id);
    }

    isEnabled(id: string): boolean {
        return isJobEnabled(this.snapshot, id);
    }

    /** Runs on every snapshot, including the ones a refresh fetches. Returns an unsubscribe. */
    onChange(listener: Listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private apply(snapshot: JobsSnapshot) {
        this.snapshot = snapshot;
        this.listeners.forEach((l) => l(snapshot));
    }

    async refresh() {
        try {
            this.apply(await jobsSnapshot());
        } catch {
            // Not running inside Tauri.
        }
    }

    /** A failed change re-reads the snapshot, so every control lands back on what the backend holds. */
    async #change(write: () => Promise<unknown>, failed: (error: unknown) => void) {
        try {
            await write();
        } catch (e) {
            failed(e);
        }
        await this.refresh();
    }

    setPolicy(id: string, policy: Policy) {
        return this.#change(() => setJobPolicy(id, policy), settingSaveFailed);
    }

    setEnabled(id: string, enabled: boolean) {
        return this.#change(() => setJobEnabled(id, enabled), settingSaveFailed);
    }

    setAllEnabled(enabled: boolean) {
        return this.#change(() => setAllJobsEnabled(enabled), settingSaveFailed);
    }

    forceRun(id: string) {
        return this.#change(
            () => forceRunJob(id),
            (e) => toast.error(failureText(e, t("jobs.run_failed"))),
        );
    }

    start() {
        void this.refresh();
        let stopped = false;
        let unlisten: (() => void) | undefined;
        onJobsChanged((snapshot) => this.apply(snapshot)).then(
            (fn) => (stopped ? fn() : (unlisten = fn)),
            () => {},
        );
        return () => {
            stopped = true;
            unlisten?.();
        };
    }
}

export const jobs = new JobsStore();
