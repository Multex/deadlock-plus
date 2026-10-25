import { command } from "$lib/core/tauri";

export type DispatchEditionKind = "weekly" | "monthly";

/** Announces a newly issued edition as a notification that opens `/dispatch`. */
export const notifyDispatchEdition = (kind: DispatchEditionKind) =>
    command("notify_dispatch_edition", { edition: kind });
