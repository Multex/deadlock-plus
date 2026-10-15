import { describe, expect, it } from "vitest";
import type { JobInfo } from "@deadlock-plus/ipc-types/JobInfo";
import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import { activeJobs, isJobEnabled, jobDescription, jobPercent, jobStatusText, jobTitle, POLICY_OPTIONS } from "./jobs";

function job(over: Partial<JobInfo> = {}): JobInfo {
    return {
        id: "patch-notes-index",
        state: "running",
        policy: "pauseInGame",
        done: 0,
        total: 0,
        label: null,
        ...over,
    };
}

describe("jobPercent", () => {
    it("is 0 while the total is unknown", () => {
        expect(jobPercent(job({ done: 3, total: 0 }))).toBe(0);
    });

    it("rounds done over total", () => {
        expect(jobPercent(job({ done: 1, total: 3 }))).toBe(33);
    });

    it("never exceeds 100", () => {
        expect(jobPercent(job({ done: 9, total: 4 }))).toBe(100);
    });
});

describe("jobStatusText", () => {
    it("shows the title alone before a total is known", () => {
        expect(jobStatusText(job())).toBe("Preparing patch note search...");
    });

    it("shows progress and the label", () => {
        expect(jobStatusText(job({ done: 2, total: 8, label: "2026-09-12" }))).toBe(
            "Preparing patch note search... 2/8 · 2026-09-12",
        );
    });

    it("omits the label when there is none", () => {
        expect(jobStatusText(job({ done: 2, total: 8 }))).toBe("Preparing patch note search... 2/8");
    });

    it("says why a paused job is waiting", () => {
        expect(jobStatusText(job({ state: "paused", done: 2, total: 8 }))).toBe(
            "Preparing patch note search paused while Deadlock runs",
        );
    });
});

describe("jobTitle and jobDescription", () => {
    it("render known jobs from the catalog by id", () => {
        expect(jobTitle({ id: "addon-scan" })).toBe("Scanning mods");
        expect(jobTitle({ id: "server-block-sync" })).toBe("Updating server blocks");
        expect(jobDescription({ id: "patch-notes-index" })).toContain("patch notes");
    });

    it("shows the id for an unknown job", () => {
        expect(jobTitle({ id: "future-job" })).toBe("future-job");
        expect(jobDescription({ id: "future-job" })).toBe("future-job");
    });
});

describe("activeJobs", () => {
    it("keeps queued, running and paused jobs in order", () => {
        const jobs = [
            job({ id: "q", state: "queued" }),
            job({ id: "d", state: "done" }),
            job({ id: "r", state: "running" }),
            job({ id: "p", state: "paused" }),
            job({ id: "c", state: "cancelled" }),
        ];
        expect(activeJobs(jobs).map((j) => j.id)).toEqual(["q", "r", "p"]);
    });
});

describe("isJobEnabled", () => {
    const snapshot = (over: Partial<JobsSnapshot> = {}): JobsSnapshot => ({
        catalog: [
            { id: "a", policy: "pauseInGame", policyConfigurable: true, enabled: true },
            { id: "b", policy: "pauseInGame", policyConfigurable: true, enabled: false },
        ],
        jobs: [],
        gameRunning: false,
        allEnabled: true,
        ...over,
    });

    it("is true before the first snapshot arrives", () => {
        expect(isJobEnabled(null, "a")).toBe(true);
    });

    it("follows the job's own switch", () => {
        expect(isJobEnabled(snapshot(), "a")).toBe(true);
        expect(isJobEnabled(snapshot(), "b")).toBe(false);
    });

    it("is false for every job when the global switch is off", () => {
        expect(isJobEnabled(snapshot({ allEnabled: false }), "a")).toBe(false);
    });

    it("treats a job the catalog does not list as enabled", () => {
        expect(isJobEnabled(snapshot(), "unknown")).toBe(true);
    });
});

describe("policy options", () => {
    it("offers every policy once, with distinct labels", () => {
        expect(POLICY_OPTIONS.map((o) => o.value)).toEqual(["always", "pauseInGame", "slowInGame"]);
        expect(new Set(POLICY_OPTIONS.map((o) => o.label)).size).toBe(POLICY_OPTIONS.length);
    });
});
