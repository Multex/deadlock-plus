<script lang="ts">
    import { ArrowLeftRight, X } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { LiveTeam } from "@deadlock-plus/ipc-types/LiveTeam";
    import type { HeroSwap } from "../live";

    let {
        swaps,
        teams,
        heroes,
        ondismiss,
    }: { swaps: HeroSwap[]; teams: LiveTeam[]; heroes: Record<number, Hero>; ondismiss: () => void } = $props();

    const lines = $derived.by(() => {
        const names = new Map(teams.flatMap((team) => team.players).map((p) => [p.key, p.name]));
        return swaps.flatMap((s) => {
            const from = heroes[s.from]?.name;
            const to = heroes[s.to]?.name;
            if (!from || !to) return [];
            const name = names.get(s.key);
            return [
                {
                    key: s.key,
                    text: name ? t("live.swaps.named", { name, from, to }) : t("live.swaps.line", { from, to }),
                },
            ];
        });
    });
</script>

{#if lines.length > 0}
    <div
        class="flex items-start gap-2.5 rounded-lg border border-border bg-card py-2 pr-1.5 pl-3 text-[13px]"
        role="status"
    >
        <ArrowLeftRight class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <ul class="flex min-w-0 flex-1 flex-col gap-0.5">
            {#each lines as line (line.key)}
                <li class="min-w-0 break-words">{line.text}</li>
            {/each}
        </ul>
        <button
            type="button"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:bg-foreground/10 focus-visible:text-foreground"
            aria-label={t("live.swaps.dismiss")}
            title={t("live.swaps.dismiss")}
            onclick={ondismiss}
        >
            <X size={14} />
        </button>
    </div>
{/if}
