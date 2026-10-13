<script lang="ts">
    import { AlertDialog } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: AlertDialog.TitleProps = $props();
</script>

<AlertDialog.Title class={cn("text-base font-semibold", className)} {...rest} />
