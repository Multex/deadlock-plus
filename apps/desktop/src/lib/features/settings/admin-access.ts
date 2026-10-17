import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import { buttons } from "$lib/features/admin-access/buttons";

export type AdminAccessChoice = "ask" | "always";

export interface AdminAccessRow {
    choice: AdminAccessChoice;
    afterMatch: boolean;
}

/** Null while the row does not apply: status unknown, already elevated, or no helper on this system. */
export function adminAccessRow(status: AdminAccessStatus | null): AdminAccessRow | null {
    if (!status) return null;
    const view = buttons(status);
    if (view.kind === "hidden") return null;
    return { choice: view.kind === "remove" ? "always" : "ask", afterMatch: !status.canPrompt };
}
