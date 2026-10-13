<script lang="ts">
    import type { HTMLButtonAttributes } from "svelte/elements";
    import Button, { type ButtonSize, type ButtonVariant } from "./button.svelte";
    import * as Tooltip from "./tooltip";

    type Props = Omit<HTMLButtonAttributes, "aria-label"> & {
        label: string;
        tooltip?: boolean | string;
        variant?: ButtonVariant;
        size?: ButtonSize;
        class?: string;
    };

    let { label, tooltip = false, variant = "ghost", size = "icon", children, ...rest }: Props = $props();

    const tooltipText = $derived(typeof tooltip === "string" ? tooltip : label);
</script>

{#if tooltip}
    <Tooltip.Provider>
        <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    <Button {...props} {...rest} {variant} {size} type={rest.type ?? "button"} aria-label={label}>
                        {@render children?.()}
                    </Button>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{tooltipText}</Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>
{:else}
    <Button {...rest} {variant} {size} type={rest.type ?? "button"} aria-label={label}>
        {@render children?.()}
    </Button>
{/if}
