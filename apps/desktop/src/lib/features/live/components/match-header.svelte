<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
    import type { LivePhase } from "@deadlock-plus/ipc-types/LivePhase";
    import { formatClock } from "../live";
    import MatchClock from "./match-clock.svelte";

    let { match, phase }: { match: LiveMatch; phase: LivePhase } = $props();

    const clockShown = $derived(phase !== "pregame" && formatClock(match.clockSecs) !== null);
    const mode = $derived(
        [
            match.matchMode && match.matchMode !== "other" ? t(`live.mode.${match.matchMode}`) : null,
            match.gameMode && match.gameMode !== "normal" ? t(`live.game.${match.gameMode}`) : null,
        ]
            .filter(Boolean)
            .join(" · "),
    );
</script>

{#if clockShown || mode}
    <Badge variant="outline" class="gap-2.5 font-normal text-muted-foreground tabular-nums">
        {#if clockShown}<MatchClock clockSecs={match.clockSecs} paused={match.paused} />{/if}
        {#if mode}<span>{mode}</span>{/if}
    </Badge>
{/if}
