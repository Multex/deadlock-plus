<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import HeroIcon from "$lib/features/live/components/hero-icon.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import type { MatchDetail } from "@deadlock-plus/match/detail";
    import { groupTeam, playerMenuItems } from "../../../player-menu";
    import TeamMark from "./team-mark.svelte";

    let {
        detail,
        heroes,
        selectedSlot,
        ownSlot,
        label,
        onpick,
    }: {
        detail: MatchDetail;
        heroes: Record<number, Hero>;
        selectedSlot: number;
        ownSlot: number | null;
        label: string;
        onpick: (slot: number) => void;
    } = $props();

    const items = $derived(
        playerMenuItems(detail, ownSlot, {
            teamName: (team) =>
                team === "hidden-king" ? t("match_history.team.hidden_king") : t("match_history.team.archmother"),
            fallbackName: (n) => t("match_history.deep_dive.player_fallback", { slot: n }),
            heroName: (heroId) => heroes[heroId]?.name,
            you: t("match_history.detail.you"),
        }),
    );
</script>

<SelectMenu
    {items}
    size="sm"
    align="end"
    class="w-48"
    aria-label={label}
    bind:value={() => String(selectedSlot), (v) => onpick(Number(v))}
>
    {#snippet leading(item)}
        <span class="flex" aria-hidden="true"><HeroIcon heroId={item.heroId} {heroes} size={20} /></span>
    {/snippet}
    {#snippet groupHeading(group)}
        {@const team = groupTeam(items, group)}
        <span class="flex items-center gap-1.5">
            {#if team}<span class="flex" aria-hidden="true"><TeamMark {team} size={8} /></span>{/if}
            {group}
        </span>
    {/snippet}
</SelectMenu>
