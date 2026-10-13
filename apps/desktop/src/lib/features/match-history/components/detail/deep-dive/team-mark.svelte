<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { MatchTeam } from "@deadlock-plus/match/detail";

    let { team, size = 10 }: { team: MatchTeam; size?: number } = $props();

    const hiddenKing = $derived(team === "hidden-king");
    const name = $derived(t(hiddenKing ? "match_history.team.hidden_king" : "match_history.team.archmother"));
</script>

<span
    role="img"
    aria-label={name}
    title={name}
    class="inline-block shrink-0 {hiddenKing ? 'rounded-full' : 'rotate-45 rounded-[2px]'}"
    style:width="{size}px"
    style:height="{size}px"
    style:background={hiddenKing ? "var(--dd-hk)" : "var(--dd-am)"}
></span>
