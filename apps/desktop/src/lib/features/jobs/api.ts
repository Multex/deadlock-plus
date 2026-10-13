import { command, listen, type Unlisten } from "$lib/core/tauri";
import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import type { Policy } from "./jobs";

export const jobsSnapshot = () => command<JobsSnapshot>("jobs_snapshot");
export const setJobPolicy = (id: string, policy: Policy) => command("set_job_policy", { id, policy });
export const setPauseInGame = (enabled: boolean) => command("set_pause_in_game", { enabled });
export const setJobEnabled = (id: string, enabled: boolean) => command("set_job_enabled", { id, enabled });
export const setAllJobsEnabled = (enabled: boolean) => command("set_all_jobs_enabled", { enabled });
export const forceRunJob = (id: string) => command("force_run_job", { id });
export const onJobsChanged = (handler: (snapshot: JobsSnapshot) => void): Promise<Unlisten> =>
    listen<JobsSnapshot>("jobs://changed", handler);
