<script lang="ts">
    import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
    import Card from "@deadlock-plus/ui/card.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import { abilitySteps, type HeroKit } from "../../build-detail.svelte";

    let { order, kit }: { order: readonly CurrencyChangeView[]; kit: HeroKit | null } = $props();

    const steps = $derived(abilitySteps(order, kit?.levels ?? []));

    const initials = (name: string | undefined) =>
        (name ?? "?")
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase() ?? "")
            .join("");
</script>

<Card as="section" padding="none" aria-label={t("builds.view.abilities")}>
    <h2 class="border-b border-border px-4 py-3 text-lg font-semibold">{t("builds.view.abilities")}</h2>
    {#if steps.length === 0}
        <EmptyState>{t("builds.view.no_abilities")}</EmptyState>
    {:else}
        <ol class="flex flex-wrap gap-2 p-4" data-testid="ability-order">
            {#each steps as step, i (i)}
                {@const ability = kit?.abilities.get(step.abilityId)}
                <li
                    class="flex w-[84px] flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-center {step.kind ===
                    'unlock'
                        ? 'border-brass/40 bg-brass/10'
                        : 'border-border bg-muted/20'}"
                    data-kind={step.kind}
                >
                    <span class="self-start text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
                    <span
                        class="-mt-2 grid size-10 place-items-center overflow-hidden rounded-md border bg-muted {step.abilityId ===
                        kit?.ultimateId
                            ? 'border-brass/70'
                            : 'border-border'}"
                        title={ability?.name}
                    >
                        {#if ability?.art}
                            <img
                                src={ability.art}
                                alt={ability.name}
                                draggable="false"
                                class="size-[78%] object-contain"
                            />
                        {:else}
                            <span class="text-xs text-muted-foreground" aria-label={ability?.name}>
                                {initials(ability?.name)}
                            </span>
                        {/if}
                    </span>
                    <span class="text-xs font-medium">
                        {step.kind === "unlock"
                            ? t("builds.view.step_unlock")
                            : t("builds.view.step_tier", { tier: step.tier })}
                    </span>
                    {#if step.netWorth !== null}
                        <span class="text-[11px] text-muted-foreground tabular-nums">
                            {t("builds.view.step_souls", { souls: formatNumber(step.netWorth) })}
                        </span>
                    {/if}
                </li>
            {/each}
        </ol>
    {/if}
</Card>
