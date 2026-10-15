import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import { forceRunJob, jobsSnapshot, onJobsChanged, setAllJobsEnabled, setJobEnabled, setJobPolicy } from "./api";
import { activeJobs, isJobEnabled, type Policy } from "./jobs";

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

    async setPolicy(id: string, policy: Policy) {
        await setJobPolicy(id, policy);
        await this.refresh();
    }

    async setEnabled(id: string, enabled: boolean) {
        await setJobEnabled(id, enabled);
        await this.refresh();
    }

    async setAllEnabled(enabled: boolean) {
        await setAllJobsEnabled(enabled);
        await this.refresh();
    }

    async forceRun(id: string) {
        await forceRunJob(id);
        await this.refresh();
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
