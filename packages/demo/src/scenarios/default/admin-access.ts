import type { AdminAccessOutcome } from "@deadlock-plus/ipc-types/AdminAccessOutcome";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";

import type { Module } from "../../scenario";

export interface AdminAccessOptions {
    /** Where the app starts. Defaults to running elevated. */
    status?: AdminAccessStatus;
    /** What Allow answers. Anything but `applied` leaves the route as it was. */
    allow?: AdminAccessOutcome;
}

const ELEVATED: AdminAccessStatus = { elevated: true, route: "inProcess", canPrompt: false, gameRunsAsAdmin: false };
const APPLIED: AdminAccessOutcome = { status: "applied" };

const refuse = (code: string): never => {
    throw { code, params: {} };
};

/** The admin-access commands, refusing the way the backend does: while elevated, and while a match runs. */
export function adminAccessModule({ status = ELEVATED, allow = APPLIED }: AdminAccessOptions = {}): Module {
    return {
        name: "admin-access",
        create() {
            let state = status;
            return {
                handlers: {
                    admin_access_status: () => state,
                    allow_admin_access: ({ always }) => {
                        if (state.elevated) refuse("admin_access.already_elevated");
                        if (!state.canPrompt) refuse("admin_access.in_match");
                        if (allow.status === "applied")
                            state = { ...state, route: always === true ? "service" : "helper" };
                        return allow;
                    },
                    remove_admin_access: () => {
                        if (state.elevated) refuse("admin_access.already_elevated");
                        state = { ...state, route: "needsPermission" };
                        return null;
                    },
                },
            };
        },
    };
}
