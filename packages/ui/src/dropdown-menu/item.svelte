<script lang="ts">
    import { DropdownMenu } from "bits-ui";
    import { cn } from "../utils";
    import { itemClass } from "./item-class";

    let { class: className, ...rest }: DropdownMenu.ItemProps = $props();
</script>

<DropdownMenu.Item class={cn(itemClass, className)} {...rest} />
