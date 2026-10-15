import { untrack } from "svelte";
import { settings } from "$lib/features/settings/settings.svelte";
import { stats } from "$lib/features/stats/stats.svelte";
import { steamAccount } from "$lib/features/steam-account/account.svelte";
import { notifyBreakReminder } from "./api";
import { createBreakReminder } from "./break-reminder";

/**
 * Watches the stats store rather than the capture event: the store already merges captured games
 * and later API refreshes into one list, and this effect root lives outside any page, so it keeps
 * running while the window sits in the tray.
 */
export function startBreakReminder(): () => void {
    const observe = createBreakReminder({
        now: () => Date.now(),
        enabled: () => settings.breakHint,
        notify: (lossStreak) => void notifyBreakReminder(lossStreak).catch(() => {}),
    });
    return $effect.root(() => {
        $effect(() => {
            const accountId = steamAccount.account?.steamId32 ?? null;
            if (settings.breakHint && accountId !== null) void stats.load(accountId);
        });
        $effect(() => {
            const matches = stats.matches;
            untrack(() => observe(matches));
        });
    });
}
