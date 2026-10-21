<script lang="ts">
    import { ChevronRight } from "@lucide/svelte";
    import { DropdownMenu } from "bits-ui";
    import { cn } from "../utils";
    import { itemClass } from "./item-class";

    let { class: className, children, ...rest }: DropdownMenu.SubTriggerProps = $props();
</script>

<DropdownMenu.SubTrigger class={cn(itemClass, "data-[state=open]:bg-accent", className)} {...rest}>
    {@render children?.()}
    <ChevronRight class="ml-auto" />
</DropdownMenu.SubTrigger>
