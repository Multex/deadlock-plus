import type { AdminAccessOutcome } from "@deadlock-plus/ipc-types/AdminAccessOutcome";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import { command } from "$lib/core/tauri";

export function adminAccessStatus() {
    return command<AdminAccessStatus>("admin_access_status");
}

export function allowAdminAccess(always: boolean) {
    return command<AdminAccessOutcome>("allow_admin_access", { always });
}

export function removeAdminAccess() {
    return command<void>("remove_admin_access");
}
