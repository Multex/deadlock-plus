import { formatNumber, t } from "$lib/core/i18n.svelte";
import type { JobInfo } from "@deadlock-plus/ipc-types/JobInfo";
import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import type { Policy } from "@deadlock-plus/ipc-types/Policy";

export type { JobInfo, JobsSnapshot, Policy };

/** Whether a job may start on its own. True until the first snapshot says otherwise. */
export function isJobEnabled(snapshot: JobsSnapshot | null, id: string): boolean {
    if (!snapshot) return true;
    if (!snapshot.allEnabled) return false;
    return snapshot.catalog.find((c) => c.id === id)?.enabled ?? true;
}

export const POLICY_OPTIONS: { value: Policy; readonly label: string }[] = [
    {
        value: "always",
        get label() {
            return t("jobs.policy.always");
        },
    },
    {
        value: "pauseInGame",
        get label() {
            return t("jobs.policy.pause_in_game");
        },
    },
    {
        value: "slowInGame",
        get label() {
            return t("jobs.policy.slow_in_game");
        },
    },
];

const JOB_TEXT: Record<string, { title: () => string; description: () => string }> = {
    "addon-scan": {
        title: () => t("jobs.catalog.addon_scan.title"),
        description: () => t("jobs.catalog.addon_scan.description"),
    },
    "match-grades": {
        title: () => t("jobs.catalog.match_grades.title"),
        description: () => t("jobs.catalog.match_grades.description"),
    },
    "patch-notes-index": {
        title: () => t("jobs.catalog.patch_notes_index.title"),
        description: () => t("jobs.catalog.patch_notes_index.description"),
    },
    "server-block-sync": {
        title: () => t("jobs.catalog.server_block_sync.title"),
        description: () => t("jobs.catalog.server_block_sync.description"),
    },
};

export function jobTitle(job: { id: string }): string {
    return JOB_TEXT[job.id]?.title() ?? job.id;
}

export function jobDescription(job: { id: string }): string {
    return JOB_TEXT[job.id]?.description() ?? job.id;
}

export function activeJobs(jobs: JobInfo[]): JobInfo[] {
    return jobs.filter((j) => j.state === "queued" || j.state === "running" || j.state === "paused");
}

export function jobPercent(job: JobInfo): number {
    if (job.total <= 0) return 0;
    return Math.min(100, Math.round((job.done / job.total) * 100));
}

export function jobStatusText(job: JobInfo): string {
    const title = jobTitle(job);
    if (job.state === "paused") return t("jobs.status.paused", { title });
    if (job.total <= 0) return t("jobs.status.starting", { title });
    const params = { title, done: formatNumber(job.done), total: formatNumber(job.total) };
    if (job.label) return t("jobs.status.progress_labeled", { ...params, label: job.label });
    return t("jobs.status.progress", params);
}
