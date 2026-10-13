<script lang="ts">
    import { Dialog } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: Dialog.TitleProps = $props();
</script>

<Dialog.Title class={cn("text-base font-semibold", className)} {...rest} />
