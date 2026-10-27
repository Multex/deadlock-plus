import { firewallCapability, getGameDefinitions, listBlockedGroupIds } from "$lib/features/server-picker/api";
import { savedOrFetchedServerData } from "$lib/features/server-picker/cache";
import { readVoiceBan } from "$lib/features/voice-bans/api";
import { parseVoiceBan } from "$lib/features/voice-bans/voice-ban";
import { listDemos } from "$lib/features/demos/api";

export interface GlanceSummary {
    blocked: number | null;
    mutes: number | null;
    replays: number | null;
}

async function loadBlocked(): Promise<number | null> {
    const capability = await firewallCapability();
    if (!capability.supported) return null;
    const game = (await getGameDefinitions())[0];
    if (!game) return null;
    const data = await savedOrFetchedServerData(game.id);
    const ids = [...new Set([...data.clustered, ...data.unclustered].map((g) => g.id))];
    return (await listBlockedGroupIds(ids)).length;
}

/** Fills each count as it arrives. A count that fails stays null, so its tile shows the empty value. */
export function loadGlance(summary: GlanceSummary): Promise<void> {
    // `ok` runs inside the chain so a throw while reading an answer is swallowed like a failed command.
    const settle = <T>(load: Promise<T>, ok: (value: T) => void) => load.then(ok).catch(() => {});
    return Promise.all([
        settle(loadBlocked(), (n) => (summary.blocked = n)),
        settle(readVoiceBan(), (file) => (summary.mutes = parseVoiceBan(file.text).users.length)),
        settle(listDemos(), (l) => (summary.replays = l.demos.length)),
    ]).then(() => {});
}
