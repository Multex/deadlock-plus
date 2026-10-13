import type { PingStats } from "@deadlock-plus/ipc-types/PingStats";
import type { RelayInfo } from "@deadlock-plus/ipc-types/RelayInfo";
import type { NetworkSnapshot } from "@deadlock-plus/ipc-types/NetworkSnapshot";
import type { HistoryPoint } from "@deadlock-plus/ipc-types/HistoryPoint";
import type { EnginePingView } from "@deadlock-plus/ipc-types/EnginePingView";
import type { PingSummary } from "@deadlock-plus/ipc-types/PingSummary";

export type { EnginePingView, PingStats, RelayInfo, NetworkSnapshot, HistoryPoint, PingSummary };

export type NetworkPoll = { snapshot: NetworkSnapshot; tail: HistoryPoint[] };
