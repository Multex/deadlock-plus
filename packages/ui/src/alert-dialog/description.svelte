<script lang="ts">
    import { AlertDialog } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: AlertDialog.DescriptionProps = $props();
</script>

<AlertDialog.Description class={cn("text-sm text-muted-foreground", className)} {...rest} />
