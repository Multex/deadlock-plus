import type { AdminAccessOutcome } from "@deadlock-plus/ipc-types/AdminAccessOutcome";
import type { AppError } from "@deadlock-plus/ipc-types/AppError";

// Always allow failed here, but the helper already started and serves this session.
const SESSION_STILL_ALLOWED = new Set(["admin_access.always_allow_blocked", "admin_access.always_allow_needs_install"]);

export type AdminNotice = { kind: "nothing_changed" } | { kind: "error"; error: AppError };

/** `retry`: run the action that needed admin access again. */
export interface AdminOutcomeView {
    retry: boolean;
    notice: AdminNotice | null;
}

export function outcomeView(outcome: AdminAccessOutcome): AdminOutcomeView {
    switch (outcome.status) {
        case "applied":
            return { retry: true, notice: null };
        case "cancelled":
            return { retry: false, notice: { kind: "nothing_changed" } };
        case "failed":
            return {
                retry: SESSION_STILL_ALLOWED.has(outcome.error.code),
                notice: { kind: "error", error: outcome.error },
            };
    }
}
