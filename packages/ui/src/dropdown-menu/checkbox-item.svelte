<script lang="ts">
    import { Check } from "@lucide/svelte";
    import { DropdownMenu } from "bits-ui";
    import type { Snippet } from "svelte";
    import { cn } from "../utils";
    import { itemClass } from "./item-class";

    type Props = Omit<DropdownMenu.CheckboxItemProps, "children" | "child"> & { children?: Snippet };

    let { class: className, checked = $bindable(false), children: label, ...rest }: Props = $props();
</script>

<DropdownMenu.CheckboxItem bind:checked class={cn(itemClass, className)} {...rest}>
    {#snippet children({ checked })}
        <Check class={checked ? "" : "invisible"} />
        {@render label?.()}
    {/snippet}
</DropdownMenu.CheckboxItem>
