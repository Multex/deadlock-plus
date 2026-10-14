import { errorText } from "$lib/core/errors";
import { jobs } from "$lib/features/jobs/jobs.svelte";
import { addonScanReport, startAddonScan, type AddonError, type AddonListing, type AddonScan } from "./api";
import { groupAddons, indexReport, summarize } from "./performance";

const JOB_ID = "addon-scan";
const AUTO_SCAN_DELAY_MS = 8000;

class PerformanceScanStore {
    listing = $state<AddonListing | null>(null);
    scans = $state<Record<string, AddonScan>>({});
    failures = $state<Record<string, AddonError>>({});
    error = $state<string | null>(null);
    hasRun = $state(false);

    private job = $derived(jobs.snapshot?.jobs.find((j) => j.id === JOB_ID) ?? null);
    private lastSeen = "";

    scanning = $derived(jobs.isActive(JOB_ID));
    paused = $derived(this.job?.state === "paused");
    current = $derived(this.scanning ? (this.job?.label ?? null) : null);
    done = $derived(this.job?.done ?? 0);
    addons = $derived(this.listing?.addons ?? []);
    summary = $derived(summarize(this.scans));
    groups = $derived(groupAddons(this.addons, this.scans, this.failures));

    private async refreshReport() {
        try {
            const report = await addonScanReport();
            this.listing = report.listing;
            ({ scans: this.scans, failures: this.failures } = indexReport(report));
        } catch (e) {
            this.error = errorText(e);
        }
    }

    /** A scan the user asks for runs at full speed even while the game is running. */
    async run(force = true) {
        if (this.scanning) {
            if (force) await jobs.forceRun(JOB_ID);
            return;
        }
        this.hasRun = true;
        this.error = null;
        try {
            await startAddonScan(force);
            await jobs.refresh();
            await this.refreshReport();
        } catch (e) {
            this.error = errorText(e);
        }
    }

    private onJobs() {
        const job = this.job;
        if (!job) return;
        this.hasRun = true;
        const seen = `${job.state}:${job.done}`;
        if (seen === this.lastSeen) return;
        this.lastSeen = seen;
        void this.refreshReport();
    }

    start() {
        const stopJobs = jobs.onChange(() => this.onJobs());
        const timer = setTimeout(async () => {
            await jobs.refresh();
            if (jobs.isEnabled(JOB_ID) && !this.hasRun) void this.run(false);
        }, AUTO_SCAN_DELAY_MS);
        return () => {
            clearTimeout(timer);
            stopJobs();
        };
    }
}

export const performanceScan = new PerformanceScanStore();
