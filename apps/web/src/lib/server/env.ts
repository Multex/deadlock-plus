import type { PollEnv } from "./invite-poll";
import type { StatsEnv } from "./transparency/stats";
import type { Store } from "@deadlock-plus/costs";

export interface WorkerEnv extends PollEnv, StatsEnv {
    TRANSPARENCY?: Store;
}
