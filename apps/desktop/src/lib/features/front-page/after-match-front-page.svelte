<script lang="ts">
    import { onMount, tick, untrack } from "svelte";

    import { getOverlayHost } from "@deadlock-plus/ui/overlay-host";
    import { MAIN_WINDOW, windowLabel } from "$lib/core/window-label";
    import { windowVisibility } from "$lib/core/window-visibility";
    import { overlayHost } from "$lib/shell/overlay-host.svelte";
    import { live } from "$lib/features/live/live.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import type { MatchDetail } from "@deadlock-plus/match/detail";
    import { notifyFrontPageWaiting } from "./api";
    import { createAfterMatch } from "./after-match";
    import { captureFeed } from "./capture-feed.svelte";
    import FrontPageTakeover from "./front-page-takeover.svelte";
    import { readCapturedDetail } from "./load";
    import { createTakeover } from "./takeover";

    let open = $state(false);
    let detail = $state.raw<MatchDetail | null>(null);
    const host = getOverlayHost();
    const ownAccountId = $derived(steamAccount.account?.steamId32 ?? null);

    const takeover = createTakeover<HTMLElement>({
        activeElement: () => (document.activeElement instanceof HTMLElement ? document.activeElement : null),
        onChange: (next) => {
            open = next;
            if (!next) detail = null;
        },
        afterClose: (fn) => void tick().then(fn),
    });

    $effect(() => {
        if (!open || !host) return;
        return host.track(() => takeover.close());
    });

    // Never raises or focuses the window: a paper that arrives while the game has the focus waits for the user.
    const afterMatch = createAfterMatch({
        mainWindow: windowLabel() === MAIN_WINDOW,
        enabled: (mode) => settings.frontPageAfterMatch && settings.frontPageModes[mode],
        attended: () => document.hasFocus() && !windowVisibility.isHidden(),
        covered: () => overlayHost.count > 0,
        show: (matchId) => {
            void readCapturedDetail(matchId).then((found) => {
                if (!found) return;
                detail = found;
                takeover.show();
            });
        },
        waiting: () => {
            if (settings.frontPageOverlayAlert) notifyFrontPageWaiting().catch(() => {});
        },
        update: (matchId) => {
            if (!open || detail?.matchId !== matchId) return;
            void readCapturedDetail(matchId).then((found) => {
                if (found && open && detail?.matchId === matchId) detail = found;
            });
        },
    });

    $effect(() => {
        if (overlayHost.count === 0) untrack(() => afterMatch.attention());
    });

    $effect(() => {
        const phase = live.state?.phase;
        if (phase === "pregame" || phase === "inMatch") afterMatch.matchStarted();
    });

    onMount(() => {
        const stopCaptures = captureFeed.follow((c) => afterMatch.captured(c.matchId, c.mode));
        const attention = () => afterMatch.attention();
        window.addEventListener("focus", attention);
        const stopVisibility = windowVisibility.onVisibilityChange(attention);
        return () => {
            stopCaptures();
            window.removeEventListener("focus", attention);
            stopVisibility();
        };
    });
</script>

{#if open && detail}
    <FrontPageTakeover {detail} {ownAccountId} {takeover} requestGrade />
{/if}
