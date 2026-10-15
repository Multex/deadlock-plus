import type { PollEnv } from "./invite-poll";
import type { StatsEnv } from "./transparency/stats";
import type { Store } from "./transparency/store";

export interface WorkerEnv extends PollEnv, StatsEnv {
    TRANSPARENCY?: Store;
}
