<script lang="ts">
    import type { Snippet } from "svelte";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { cn } from "@deadlock-plus/ui/utils";

    let {
        label,
        disabled = false,
        testid,
        icon,
        children,
    }: {
        label: string;
        disabled?: boolean;
        testid: string;
        icon: Snippet;
        children: Snippet;
    } = $props();
</script>

<DropdownMenu.Root>
    <Tooltip.Provider>
        <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    <DropdownMenu.Trigger
                        {...props}
                        class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
                        aria-label={label}
                        {disabled}
                        data-testid={testid}
                    >
                        {@render icon()}
                    </DropdownMenu.Trigger>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>
    <DropdownMenu.Content align="start" class="max-h-80 w-60 overflow-y-auto">
        {@render children()}
    </DropdownMenu.Content>
</DropdownMenu.Root>
