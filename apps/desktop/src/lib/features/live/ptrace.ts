import { command } from "$lib/core/tauri";
import type { Platform } from "$lib/core/platform";
import type { PtraceStatus } from "@deadlock-plus/ipc-types/PtraceStatus";

export type { PtraceStatus };

export const ptraceStatus = () => command<PtraceStatus>("ptrace_status");
/** Resolves to whether the fix was applied; `false` means the password prompt was dismissed. */
export const fixPtrace = () => command<boolean>("fix_ptrace");

export type PtraceNotice = {
    action: "live.ptrace.fix" | "live.ptrace.fix_restart" | null;
    note: "live.ptrace.reboot" | "live.ptrace.manual" | null;
};

/** `applied` is whether the fix already ran this session. */
export function ptraceNotice(status: PtraceStatus | null, platform: Platform, applied: boolean): PtraceNotice | null {
    if (platform !== "linux" || !status?.denied) return null;
    switch (status.fix) {
        case "setcap":
            return { action: "live.ptrace.fix_restart", note: null };
        case "sysctl":
            return { action: "live.ptrace.fix", note: null };
        case "sysctlAfterReboot":
            return { action: applied ? null : "live.ptrace.fix", note: "live.ptrace.reboot" };
        case null:
            return { action: null, note: "live.ptrace.manual" };
    }
}
