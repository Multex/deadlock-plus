import { deadlockApi } from "$lib/core/deadlock-api";
import { steamAccount } from "$lib/features/steam-account/account.svelte";

let avatars = $state.raw<ReadonlyMap<number, string>>(new Map());
const requested = new Set<number>();

async function load(accountId: number): Promise<void> {
    try {
        const profiles = await deadlockApi.steamProfiles([accountId]);
        const avatar = profiles.find((p) => p.account_id === accountId)?.avatarmedium;
        if (avatar) avatars = new Map(avatars).set(accountId, avatar);
    } catch {
        // The note keeps its placeholder.
    }
}

/**
 * A build author's Steam avatar: the signed-in account's own picture on its builds, else the author's public picture
 * from deadlock-api, asked once per author. Null until known.
 */
export function authorAvatar(accountId: number): string | null {
    if (accountId <= 0) return null;
    const own = steamAccount.account;
    if (own?.steamId32 === accountId && own.avatarDataUrl) return own.avatarDataUrl;
    if (!requested.has(accountId)) {
        requested.add(accountId);
        void load(accountId);
    }
    return avatars.get(accountId) ?? null;
}
