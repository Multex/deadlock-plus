import { nextMaintenance } from "$lib/features/settings/maintenance";
import { settings } from "$lib/features/settings/settings.svelte";

/** The next maintenance start in Unix seconds; null when it cannot be read, so Home leaves the line out. */
export async function loadNextMaintenance(): Promise<number | null> {
    try {
        await settings.ready;
        return await nextMaintenance();
    } catch {
        return null;
    }
}
