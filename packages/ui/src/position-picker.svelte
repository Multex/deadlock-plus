<script lang="ts" generics="T extends string">
    import Button from "./button.svelte";
    import { cn } from "./utils";
    import { pickerCells, pickerTarget, tabStop } from "./position-picker";

    type Option = { value: T; label: string };

    type Props = {
        /** Eight options, row by row, skipping the middle cell. */
        options: readonly Option[];
        value: T;
        /** Names the reserved middle cell. */
        centerLabel: string;
        class?: string;
        "aria-label"?: string;
        "aria-labelledby"?: string;
        onValueChange?: (value: T) => void;
    };

    let {
        options,
        value,
        centerLabel,
        class: className,
        "aria-label": ariaLabel,
        "aria-labelledby": ariaLabelledby,
        onValueChange,
    }: Props = $props();

    const ROW_ALIGN = ["items-start", "items-center", "items-end"];
    const COLUMN_ALIGN = ["justify-start", "justify-center", "justify-end"];

    let group = $state<HTMLDivElement | null>(null);
    const values = $derived(options.map((o) => o.value));
    const cells = $derived(pickerCells(options));
    const focusable = $derived(tabStop(values, value));

    const align = (cell: number) => `${ROW_ALIGN[Math.floor(cell / 3)]} ${COLUMN_ALIGN[cell % 3]}`;

    function onkeydown(e: KeyboardEvent) {
        const next = pickerTarget(e.key, values, value);
        if (next === null) return;
        e.preventDefault();
        onValueChange?.(values[next]!);
        group?.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
    }
</script>

<div
    bind:this={group}
    role="radiogroup"
    aria-label={ariaLabel}
    aria-labelledby={ariaLabelledby}
    class={cn(
        "grid aspect-video w-48 shrink-0 grid-cols-3 grid-rows-3 gap-1 rounded-md border border-border bg-background/60 p-1 shadow-[inset_0_1px_3px_rgb(0_0_0/0.25)]",
        className,
    )}
>
    {#each cells as cell, at (cell.kind === "center" ? "center" : cell.option.value)}
        {#if cell.kind === "center"}
            <div
                class="flex items-center justify-center rounded-sm border border-dashed border-border px-1 text-center text-[10px] leading-tight text-muted-foreground"
            >
                {centerLabel}
            </div>
        {:else}
            {@const selected = cell.option.value === value}
            <Button
                variant="unstyled"
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={cell.option.label}
                tabindex={cell.index === focusable ? 0 : -1}
                {onkeydown}
                onclick={() => onValueChange?.(cell.option.value)}
                class={cn(
                    "group flex rounded-sm p-1.5 hover:bg-accent",
                    align(at),
                    selected && "bg-brass/10 hover:bg-brass/15",
                )}
            >
                <span
                    class={cn(
                        "h-2.5 w-7 rounded-[3px] transition-colors",
                        selected
                            ? "bg-brass shadow-[0_0_8px_color-mix(in_oklch,var(--brass)_45%,transparent)]"
                            : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50",
                    )}
                ></span>
            </Button>
        {/if}
    {/each}
</div>
