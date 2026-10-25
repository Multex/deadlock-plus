<script lang="ts">
    import { ChevronDown, RotateCcw } from "@lucide/svelte";
    import Button from "./button.svelte";
    import Input from "./input.svelte";
    import Slider from "./slider.svelte";
    import { MAX_CHROMA, accentColour, hexToAccent, isHex, themeAccent, type Accent } from "./accent";
    import { oklchToHex, type Theme } from "./themes";

    type Props = {
        theme: Theme;
        /** The user's own accent, or `null` for the theme's trim. */
        value: Accent | null;
        labels: { title: string; hue: string; vividness: string; hex: string; reset: string };
        onValueChange: (accent: Accent | null) => void;
    };

    let { theme, value, labels, onValueChange }: Props = $props();

    // Sliders preview while dragged and save on release, so a drag is one write, not one per pixel.
    let draft = $state<Accent | null>(null);
    let open = $state(false);
    const shown = $derived(draft ?? value ?? themeAccent(theme));
    const colour = $derived(accentColour(theme, shown));
    const hex = $derived(oklchToHex(colour));
    const id = $props.id();

    /** Each stop as this theme would draw it, so the ramp shows the colours the accent can really become. */
    const ramp = (stops: Accent[]) =>
        `linear-gradient(to right, ${stops.map((s) => accentColour(theme, s)).join(", ")})`;
    const hueRamp = $derived(
        ramp(Array.from({ length: 13 }, (_, i) => ({ hue: i * 30, chroma: Math.max(shown.chroma, 0.08) }))),
    );
    const chromaRamp = $derived(
        ramp(Array.from({ length: 6 }, (_, i) => ({ hue: shown.hue, chroma: (i / 5) * MAX_CHROMA }))),
    );

    function commit(next: Accent) {
        draft = null;
        onValueChange(next);
    }

    let trigger = $state<HTMLButtonElement>();

    // Escape closes an open picker and stops there, so it does not also leave the page it sits on.
    function onkeydown(e: KeyboardEvent) {
        if (e.key !== "Escape" || !open || e.defaultPrevented) return;
        e.preventDefault();
        open = false;
        trigger?.focus();
    }

    function onHex(e: Event & { currentTarget: HTMLInputElement }) {
        const text = e.currentTarget.value;
        if (isHex(text)) commit(hexToAccent(text));
        else e.currentTarget.value = hex;
    }
</script>

<div class="accent-picker" style:--accent-now={colour} role="presentation" {onkeydown}>
    <button
        bind:this={trigger}
        type="button"
        class="flex w-full items-center gap-2 rounded-sm py-0.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-expanded={open}
        aria-controls="{id}-panel"
        onclick={() => (open = !open)}
    >
        <span class="flex-1">{labels.title}</span>
        <span class="swatch" aria-hidden="true"></span>
        <span class="font-mono tabular-nums">{hex}</span>
        <ChevronDown class="size-3.5 transition-transform {open ? 'rotate-180' : ''}" aria-hidden="true" />
    </button>

    {#if open}
        <div id="{id}-panel" class="mt-2 flex flex-col gap-2.5">
            {#snippet bar(background: string)}
                <span class="ramp" style:background></span>
            {/snippet}
            <div class="flex items-center gap-3">
                <span class="w-16 shrink-0 text-xs text-muted-foreground">{labels.hue}</span>
                <div class="ramp-slider min-w-0 flex-1">
                    <Slider
                        size="sm"
                        value={Math.round(shown.hue)}
                        min={0}
                        max={359}
                        aria-label={labels.hue}
                        onValueChange={(hue) => (draft = { ...shown, hue })}
                        onValueCommit={(hue) => commit({ ...shown, hue })}
                    >
                        {#snippet track()}{@render bar(hueRamp)}{/snippet}
                    </Slider>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span class="w-16 shrink-0 text-xs text-muted-foreground">{labels.vividness}</span>
                <div class="ramp-slider min-w-0 flex-1">
                    <Slider
                        size="sm"
                        value={Math.round(shown.chroma * 1000)}
                        min={0}
                        max={Math.round(MAX_CHROMA * 1000)}
                        aria-label={labels.vividness}
                        onValueChange={(c) => (draft = { ...shown, chroma: c / 1000 })}
                        onValueCommit={(c) => commit({ ...shown, chroma: c / 1000 })}
                    >
                        {#snippet track()}{@render bar(chromaRamp)}{/snippet}
                    </Slider>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <Input
                    class="h-8 w-28 font-mono text-xs"
                    value={hex}
                    aria-label={labels.hex}
                    spellcheck="false"
                    autocomplete="off"
                    onchange={onHex}
                />
                {#if value}
                    <Button variant="ghost" size="sm" onclick={() => onValueChange(null)}>
                        <RotateCcw aria-hidden="true" />
                        {labels.reset}
                    </Button>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .swatch {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: var(--accent-now);
        box-shadow:
            0 0 0 1px var(--border),
            0 0 8px color-mix(in oklch, var(--accent-now) 45%, transparent);
    }

    /* The ramp replaces the rail and its fill, and the thumb takes the colour being picked. */
    .ramp-slider {
        --slider-fill: transparent;
        --slider-thumb: var(--accent-now);
    }

    .ramp {
        position: absolute;
        top: 50%;
        inset-inline: calc(var(--_half) * -1);
        height: 6px;
        translate: 0 -50%;
        border-radius: 999px;
        box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 12%, transparent);
    }
</style>
