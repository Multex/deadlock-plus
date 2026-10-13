<script lang="ts">
    import { AlertDialog } from "bits-ui";
    import { cn } from "../utils";
    import { buttonVariants, type ButtonVariant } from "../button.svelte";

    type Props = AlertDialog.ActionProps & { variant?: ButtonVariant };

    let { class: className, variant = "default", ...rest }: Props = $props();
</script>

<AlertDialog.Action class={cn(buttonVariants({ variant }), className)} {...rest} />
