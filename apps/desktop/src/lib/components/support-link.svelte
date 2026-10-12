<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import * as Tooltip from "$lib/ui/tooltip";
    import { openSupport } from "$lib/features/support/support";
    import KofiIcon from "./kofi-icon.svelte";

    let { collapsed }: { collapsed: boolean } = $props();

    const label = $derived(t("shell.sidebar.support"));

    const FIRST_PULSE_MS = 1500;
    const MIN_GAP_MS = 30_000;
    const MAX_GAP_MS = 45_000;

    let pulse = $state(0);

    onMount(() => {
        let timer: ReturnType<typeof setTimeout>;
        const schedule = (delay: number) => {
            timer = setTimeout(() => {
                if (document.visibilityState === "visible") pulse++;
                schedule(MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
            }, delay);
        };
        schedule(FIRST_PULSE_MS);
        return () => clearTimeout(timer);
    });
</script>

<Tooltip.Provider>
    <Tooltip.Root delayDuration={100} disabled={!collapsed}>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <button
                    {...props}
                    type="button"
                    aria-label={label}
                    onclick={openSupport}
                    class="flex h-10 w-full items-center gap-3 overflow-hidden rounded-md px-3.5 text-left font-heading text-sm font-semibold tracking-wide text-foreground transition-colors bg-kofi/10 hover:bg-kofi/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    <span class="relative flex size-5 shrink-0 items-center justify-center text-kofi">
                        {#key pulse}
                            {#if pulse > 0}
                                <span class="pulse-ring absolute inset-0 rounded-full bg-kofi/40"></span>
                            {/if}
                        {/key}
                        <KofiIcon class="relative size-5" />
                    </span>
                    {#if !collapsed}
                        <span class="truncate whitespace-nowrap">{label}</span>
                    {/if}
                </button>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">{label}</Tooltip.Content>
    </Tooltip.Root>
</Tooltip.Provider>

<style>
    .pulse-ring {
        opacity: 0;
        animation: support-pulse 1.6s ease-out 3;
    }

    @keyframes support-pulse {
        0% {
            transform: scale(0.8);
            opacity: 0.8;
        }
        100% {
            transform: scale(2);
            opacity: 0;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .pulse-ring {
            animation: none;
        }
    }
</style>
