<script lang="ts">
    import { Tooltip } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, sideOffset = 6, ...rest }: Tooltip.ContentProps = $props();
</script>

<Tooltip.Portal>
    <Tooltip.Content
        {sideOffset}
        class={cn(
            "z-(--z-popover) max-w-xs rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
            className,
        )}
        {...rest}
    />
</Tooltip.Portal>
