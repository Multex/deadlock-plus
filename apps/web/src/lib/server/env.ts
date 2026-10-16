import type { AnalyticsEnv } from "./analytics";
import type { StatsEnv } from "./transparency/stats";
import type { Store } from "@deadlock-plus/costs";

export interface WorkerEnv extends AnalyticsEnv, StatsEnv {
    TRANSPARENCY?: Store;
}
