<script lang="ts" generics="T extends SelectMenuItem">
    import { Check, ChevronDown, ChevronUp } from "@lucide/svelte";
    import { Select } from "bits-ui";
    import type { Snippet } from "svelte";
    import { cn } from "$lib/core/utils";
    import { findItem, groupItems, type SelectMenuItem } from "./select-menu";

    type Props = {
        items: readonly T[];
        value?: string;
        onValueChange?: (value: string) => void;
        placeholder?: string;
        disabled?: boolean;
        size?: "sm" | "md";
        align?: "start" | "center" | "end";
        class?: string;
        id?: string;
        "aria-label"?: string;
        "aria-labelledby"?: string;
        leading?: Snippet<[T]>;
        icon?: Snippet;
        /** Shows the selected item's `meta` in the closed trigger, for lists where labels can repeat. */
        triggerMeta?: boolean;
        groupHeading?: Snippet<[string]>;
    };

    let {
        items,
        value = $bindable(),
        onValueChange,
        placeholder,
        disabled = false,
        size = "md",
        align = "start",
        class: className,
        id,
        "aria-label": ariaLabel,
        "aria-labelledby": ariaLabelledby,
        leading,
        icon,
        triggerMeta = false,
        groupHeading,
    }: Props = $props();

    const groups = $derived(groupItems(items));
    const selected = $derived(findItem(items, value));
    const typeahead = $derived(items.map((i) => ({ value: i.value, label: i.label, disabled: i.disabled })));

    const artClass = $derived(
        cn(
            "grid shrink-0 place-items-center overflow-hidden rounded text-muted-foreground [&>img]:size-full [&>img]:object-cover",
            size === "sm" ? "size-5 [&_svg]:size-3.5" : "size-6 [&_svg]:size-4",
        ),
    );
</script>

<Select.Root
    type="single"
    bind:value={
        () => value ?? "",
        (next) => {
            value = next;
            onValueChange?.(next);
        }
    }
    items={typeahead}
    {disabled}
>
    <Select.Trigger
        {id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        class={cn(
            "group/select inline-flex min-w-0 items-center gap-2 rounded-md border border-input bg-card text-left text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-brass/60 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
            size === "sm" ? "h-8 px-2 text-xs" : "h-9 px-2 text-sm",
            className,
        )}
    >
        {#if selected && leading}
            <span class={artClass}>{@render leading(selected)}</span>
        {:else if icon}
            <span class={artClass}>{@render icon()}</span>
        {/if}
        <span class={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder ?? ""}
        </span>
        {#if triggerMeta && selected?.meta}
            <span class="shrink-0 text-xs font-normal whitespace-nowrap text-muted-foreground tabular-nums">
                {selected.meta}
            </span>
        {/if}
        <ChevronDown
            class="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/select:rotate-180 group-data-[state=open]/select:text-brass"
            aria-hidden="true"
        />
    </Select.Trigger>
    <Select.Portal>
        <Select.Content
            {align}
            sideOffset={4}
            collisionPadding={8}
            strategy="fixed"
            class="z-(--z-popover) flex max-h-[min(38rem,var(--bits-select-content-available-height))] max-w-[min(26rem,var(--bits-select-content-available-width))] min-w-(--bits-select-anchor-width) flex-col rounded-md border border-border bg-popover text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
            <Select.ScrollUpButton class="flex h-5 shrink-0 items-center justify-center text-muted-foreground">
                <ChevronUp class="size-3.5" aria-hidden="true" />
            </Select.ScrollUpButton>
            <Select.Viewport class="p-1">
                {#each groups as group, g (group.heading)}
                    <Select.Group class={cn(g > 0 && "mt-1 border-t border-border/60 pt-1")}>
                        {#if group.heading !== null}
                            <Select.GroupHeading
                                class="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                            >
                                {#if groupHeading}
                                    {@render groupHeading(group.heading)}
                                {:else}
                                    {group.heading}
                                {/if}
                            </Select.GroupHeading>
                        {/if}
                        {#each group.items as item (item.value)}
                            <Select.Item
                                value={item.value}
                                label={item.label}
                                disabled={item.disabled}
                                class={cn(
                                    "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:font-semibold",
                                    size === "sm" ? "text-xs" : "text-sm",
                                )}
                            >
                                {#snippet children({ selected: isSelected })}
                                    {#if leading}
                                        <span class={artClass}>{@render leading(item)}</span>
                                    {/if}
                                    <span class="min-w-0 flex-1 truncate">{item.label}</span>
                                    {#if item.meta}
                                        <span class="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                                            {item.meta}
                                        </span>
                                    {/if}
                                    <Check
                                        class={cn("size-4 shrink-0 text-brass", !isSelected && "invisible")}
                                        aria-hidden="true"
                                    />
                                {/snippet}
                            </Select.Item>
                        {/each}
                    </Select.Group>
                {/each}
            </Select.Viewport>
            <Select.ScrollDownButton class="flex h-5 shrink-0 items-center justify-center text-muted-foreground">
                <ChevronDown class="size-3.5" aria-hidden="true" />
            </Select.ScrollDownButton>
        </Select.Content>
    </Select.Portal>
</Select.Root>
