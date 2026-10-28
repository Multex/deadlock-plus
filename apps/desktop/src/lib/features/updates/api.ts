import { command } from "$lib/core/tauri";
import { Update, type UpdateMetadata } from "$lib/core/updater";
import type { UpdateChannel } from "./channel";

export const changelog = () => command<string>("changelog");

/** Newer than the running build and never older: the backend refuses downgrades on every channel. */
export async function checkUpdate(channel: UpdateChannel): Promise<Update | null> {
    const metadata = await command<UpdateMetadata | null>("check_update", { channel });
    return metadata ? new Update(metadata) : null;
}
