import { command } from "$lib/core/tauri";
import type { EditionKind } from "@deadlock-plus/stats/dispatch/types";

/** Announces a newly issued edition as a notification that opens `/dispatch`. */
export const notifyDispatchEdition = (kind: EditionKind) => command("notify_dispatch_edition", { edition: kind });
