<script lang="ts">
    import { DropdownMenu } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: DropdownMenu.SeparatorProps = $props();
</script>

<DropdownMenu.Separator class={cn("-mx-1 my-1 h-px bg-border", className)} {...rest} />
