<script lang="ts">
    import { DropdownMenu } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: DropdownMenu.GroupHeadingProps = $props();
</script>

<DropdownMenu.GroupHeading class={cn("px-2 py-1 text-xs text-muted-foreground", className)} {...rest} />
