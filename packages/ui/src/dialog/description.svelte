<script lang="ts">
    import { Dialog } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: Dialog.DescriptionProps = $props();
</script>

<Dialog.Description class={cn("text-sm text-muted-foreground", className)} {...rest} />
