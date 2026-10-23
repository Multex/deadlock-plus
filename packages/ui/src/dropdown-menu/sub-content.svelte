<script lang="ts">
    import { DropdownMenu } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: DropdownMenu.SubContentProps = $props();
</script>

<DropdownMenu.SubContent
    class={cn(
        "z-(--z-popover) min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
        className,
    )}
    {...rest}
/>
