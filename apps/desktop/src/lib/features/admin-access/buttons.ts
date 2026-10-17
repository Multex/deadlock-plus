import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";

export type AdminButtons =
    { kind: "hidden" } | { kind: "remove" } | { kind: "prompt"; allow: boolean; disabled: "after_match" | null };

export function buttons(status: AdminAccessStatus): AdminButtons {
    if (status.elevated || status.route === "inProcess") return { kind: "hidden" };
    if (status.route === "service") return { kind: "remove" };
    return {
        kind: "prompt",
        allow: status.route !== "helper",
        disabled: status.canPrompt ? null : "after_match",
    };
}
