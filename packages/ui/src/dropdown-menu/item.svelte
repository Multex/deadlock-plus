<script lang="ts">
    import { DropdownMenu } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: DropdownMenu.ItemProps = $props();
</script>

<DropdownMenu.Item
    class={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className,
    )}
    {...rest}
/>
