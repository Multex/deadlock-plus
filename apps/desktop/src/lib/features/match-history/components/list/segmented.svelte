<script lang="ts" generics="V extends string">
    import type { Component } from "svelte";

    type Icon = Component<{ class?: string; "aria-hidden"?: boolean | "true" | "false" }>;

    let {
        options,
        value,
        label,
        icon: Glyph,
        disabled = false,
        onselect,
    }: {
        options: readonly { value: V; label: string }[];
        value: V;
        label: string;
        icon?: Icon;
        disabled?: boolean;
        onselect: (value: V) => void;
    } = $props();
</script>

<div
    class="inline-flex items-center gap-0.5 rounded-md border border-input bg-muted/50 p-0.5 shadow-sm {disabled
        ? 'opacity-50'
        : ''}"
    role="group"
    aria-label={label}
    title={Glyph ? label : undefined}
>
    {#if Glyph}
        <span class="grid h-7 w-6 shrink-0 place-items-center text-muted-foreground">
            <Glyph class="size-3.5" aria-hidden="true" />
        </span>
    {/if}
    {#each options as o (o.value)}
        <button
            type="button"
            {disabled}
            aria-pressed={value === o.value}
            class="h-7 rounded px-2.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,box-shadow,translate] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px disabled:cursor-not-allowed {value ===
            o.value
                ? 'bg-accent text-accent-foreground shadow-[inset_0_-2px_0_var(--brass),inset_0_0_10px_color-mix(in_oklch,var(--brass)_16%,transparent)]'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'}"
            onclick={() => onselect(o.value)}
        >
            {o.label}
        </button>
    {/each}
</div>
