import type { CrashKind } from "@deadlock-plus/ipc-types/CrashKind";
import type { CrashReport } from "@deadlock-plus/ipc-types/CrashReport";

export type { CrashKind, CrashReport };

export {
    dismissCrash,
    openCrashIssue,
    pendingCrash,
    reportWebviewCrash,
    revealCrashBundle,
    writeCrashBundle,
} from "./api";
