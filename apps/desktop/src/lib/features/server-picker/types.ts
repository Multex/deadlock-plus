import type { KeywordFilterMode } from "@deadlock-plus/ipc-types/KeywordFilterMode";
import type { RoutingNoteDefinition } from "@deadlock-plus/ipc-types/RoutingNoteDefinition";
import type { GameDefinition } from "@deadlock-plus/ipc-types/GameDefinition";
import type { RoutingNoteInfo } from "@deadlock-plus/ipc-types/RoutingNoteInfo";
import type { ServerGroup } from "@deadlock-plus/ipc-types/ServerGroup";
import type { ServerData } from "@deadlock-plus/ipc-types/ServerData";
import type { ExternalScan } from "@deadlock-plus/ipc-types/ExternalScan";
import type { FirewallCapability } from "@deadlock-plus/ipc-types/FirewallCapability";
import type { SyncOutcome } from "@deadlock-plus/ipc-types/SyncOutcome";

export type {
    SyncOutcome,
    KeywordFilterMode,
    RoutingNoteDefinition,
    GameDefinition,
    RoutingNoteInfo,
    ServerGroup,
    ServerData,
    ExternalScan,
    FirewallCapability,
};
export type PingResults = Record<string, number | null>;
