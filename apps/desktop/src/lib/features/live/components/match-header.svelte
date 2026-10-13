<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
    import type { LivePhase } from "@deadlock-plus/ipc-types/LivePhase";
    import MatchClock from "./match-clock.svelte";

    let { match, phase }: { match: LiveMatch; phase: LivePhase } = $props();

    const pregame = $derived(phase === "pregame");
    const mode = $derived(
        [
            match.matchMode && match.matchMode !== "other" ? t(`live.mode.${match.matchMode}`) : null,
            match.gameMode && match.gameMode !== "normal" ? t(`live.game.${match.gameMode}`) : null,
        ]
            .filter(Boolean)
            .join(" · "),
    );
</script>

<div class="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-0.5 text-[13px] text-muted-foreground tabular-nums">
    {#if !pregame}<MatchClock clockSecs={match.clockSecs} paused={match.paused} />{/if}
    {#if mode}<span>{mode}</span>{/if}
</div>
