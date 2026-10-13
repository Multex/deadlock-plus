<script lang="ts">
    import { Slider } from "bits-ui";
    import type { Snippet } from "svelte";
    import { cn } from "./utils";
    import { pageValue, snapValue, tickValues, valuePercent } from "./slider";

    type Props = {
        value?: number;
        min?: number;
        max?: number;
        step?: number;
        disabled?: boolean;
        ticks?: boolean | readonly number[];
        formatValue?: (value: number) => string;
        /** Spoken value only; `formatValue` is spoken when this is absent. */
        valueText?: (value: number) => string;
        bubble?: boolean;
        size?: "sm" | "md";
        class?: string;
        "aria-label"?: string;
        "aria-labelledby"?: string;
        onValueChange?: (value: number) => void;
        onValueCommit?: (value: number) => void;
        track?: Snippet;
    };

    let {
        value = $bindable(),
        min = 0,
        max = 100,
        step = 1,
        disabled = false,
        ticks,
        formatValue,
        valueText,
        bubble = formatValue !== undefined,
        size = "md",
        class: className,
        "aria-label": ariaLabel,
        "aria-labelledby": ariaLabelledby,
        onValueChange,
        onValueCommit,
        track,
    }: Props = $props();

    const range = $derived({ min, max, step });
    // The primitive writes back any value that is off its step grid, which would reach the caller as a
    // change the user never made. It only ever sees the snapped value.
    const current = $derived(snapValue(value ?? min, range));
    const marks = $derived(tickValues(ticks, range));
    const text = $derived(formatValue?.(current));
    const spoken = $derived(valueText ? valueText(current) : text);

    function set(next: number) {
        if (next === current) return;
        value = next;
        onValueChange?.(next);
    }

    function onkeydown(e: KeyboardEvent) {
        if (disabled) return;
        const next = pageValue(e.key, current, range);
        if (next === null) return;
        e.preventDefault();
        set(next);
        onValueCommit?.(next);
    }
</script>

<div class={cn("slider", className)} data-size={size} data-disabled={disabled ? "" : undefined}>
    <Slider.Root
        type="single"
        bind:value={() => current, set}
        {min}
        {max}
        {step}
        {disabled}
        {onValueCommit}
        thumbPositioning="exact"
    >
        <span class="slider-rail"></span>
        <Slider.Range />
        {#if track}
            <div class="slider-layer">{@render track()}</div>
        {/if}
        {#each marks as mark (mark)}
            <span
                class="slider-tick"
                data-on={mark <= current ? "" : undefined}
                style:left="{valuePercent(mark, min, max)}%"
            ></span>
        {/each}
        <Slider.Thumb
            index={0}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            aria-valuetext={spoken}
            {onkeydown}
        >
            <span class="slider-gem"></span>
            {#if bubble}
                <span class="slider-bubble" aria-hidden="true">{text ?? current}</span>
            {/if}
        </Slider.Thumb>
    </Slider.Root>
</div>

<style>
    /* The thumb's centre travels the full width of the root, so the wrapper is padded by half a thumb. */
    .slider {
        --_fill: var(--slider-fill, var(--brass));
        --_thumb: var(--slider-thumb, var(--_fill));
        --_half: 8px;
        --_rail: 4px;
        --_tick: 4px;
        width: 100%;
        padding-inline: var(--_half);
    }
    .slider[data-size="sm"] {
        --_half: 6px;
        --_rail: 3px;
        --_tick: 3px;
    }
    .slider[data-disabled] {
        opacity: 0.5;
    }

    .slider :global {
        [data-slider-root] {
            position: relative;
            display: flex;
            align-items: center;
            width: 100%;
            height: calc(var(--_half) * 2 + 4px);
            cursor: pointer;
            user-select: none;
        }

        .slider-rail {
            position: absolute;
            inset-inline: calc(var(--_half) * -1);
            height: var(--_rail);
            border-radius: 999px;
            background: color-mix(in oklch, var(--foreground) 14%, transparent);
            box-shadow: inset 0 0 0 1px var(--border);
            transition: background-color 0.15s;
        }

        [data-slider-range] {
            height: var(--_rail);
            margin-left: calc(var(--_half) * -1);
            border-radius: 999px 0 0 999px;
            background: linear-gradient(to right, color-mix(in oklch, var(--_fill) 55%, transparent), var(--_fill));
        }

        .slider-layer {
            position: absolute;
            inset: 0;
            pointer-events: none;
        }

        .slider-tick {
            position: absolute;
            top: calc(50% + var(--_rail) / 2 + 3px);
            width: 1px;
            height: var(--_tick);
            translate: -50% 0;
            background: color-mix(in oklch, var(--foreground) 32%, transparent);
        }
        .slider-tick[data-on] {
            background: var(--_fill);
        }

        [data-slider-thumb] {
            display: grid;
            place-items: center;
            width: calc(var(--_half) * 2);
            height: calc(var(--_half) * 2);
            outline: none;
        }

        /* A diamond with a dark pip, like the objective markers on the game's minimap. */
        .slider-gem {
            position: relative;
            display: grid;
            place-items: center;
            width: 70.7%;
            height: 70.7%;
            rotate: 45deg;
            border-radius: 2px;
            background: var(--_thumb);
            box-shadow:
                0 0 0 2px var(--popover),
                0 1px 4px 2px rgb(0 0 0 / 35%);
            transition:
                box-shadow 0.15s,
                scale 0.15s;
        }
        .slider-gem::after {
            content: "";
            width: 36%;
            height: 36%;
            border-radius: 1px;
            background: var(--popover);
        }
        [data-slider-thumb][data-active] .slider-gem {
            scale: 1.15;
            box-shadow:
                0 0 0 2px var(--popover),
                0 0 0 6px color-mix(in oklch, var(--_thumb) 40%, transparent),
                0 0 14px 3px color-mix(in oklch, var(--_thumb) 50%, transparent);
        }
        [data-slider-thumb]:focus-visible .slider-gem {
            outline: 2px solid var(--ring);
            outline-offset: 3px;
        }

        /* Hidden with display, not opacity: an invisible nowrap box would still widen a scroll container. */
        .slider-bubble {
            position: absolute;
            bottom: calc(100% + 6px);
            left: 50%;
            z-index: var(--z-local);
            display: none;
            translate: -50% 0;
            padding: 1px 6px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            background: var(--popover);
            color: var(--popover-foreground);
            font-size: 11px;
            line-height: 1.45;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgb(0 0 0 / 30%);
            pointer-events: none;
            transition:
                opacity 0.12s,
                translate 0.12s;
        }
        [data-slider-thumb][data-active] .slider-bubble,
        [data-slider-thumb]:focus-visible .slider-bubble {
            display: block;

            @starting-style {
                opacity: 0;
                translate: -50% 3px;
            }
        }
    }

    .slider[data-disabled] :global([data-slider-root]) {
        cursor: not-allowed;
    }
    .slider:not([data-disabled]) :global {
        [data-slider-root]:hover .slider-rail {
            background: color-mix(in oklch, var(--foreground) 20%, transparent);
        }
        [data-slider-root]:hover [data-slider-thumb]:not([data-active]) .slider-gem {
            box-shadow:
                0 0 0 2px var(--popover),
                0 0 0 5px color-mix(in oklch, var(--_thumb) 30%, transparent),
                0 0 10px 2px color-mix(in oklch, var(--_thumb) 35%, transparent);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .slider :global {
            .slider-rail,
            .slider-gem,
            .slider-bubble {
                transition: none;
            }
        }
    }
</style>
