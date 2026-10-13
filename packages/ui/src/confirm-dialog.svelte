<script lang="ts">
    import type { Snippet } from "svelte";
    import * as AlertDialog from "./alert-dialog";
    import { closeOutcome, confirmRunner } from "./confirm-dialog";

    type Props = {
        open?: boolean;
        title: string;
        description?: string | Snippet;
        confirmLabel: string;
        cancelLabel: string;
        destructive?: boolean;
        disabled?: boolean;
        class?: string;
        children?: Snippet;
        onconfirm?: () => void | Promise<void>;
        oncancel?: () => void;
    };

    let {
        open = $bindable(false),
        title,
        description,
        confirmLabel,
        cancelLabel,
        destructive = false,
        disabled = false,
        class: className,
        children,
        onconfirm,
        oncancel,
    }: Props = $props();

    let confirmed = false;
    let pending = $state(false);

    const runner = confirmRunner({
        close: () => (open = false),
        pending: (on) => (pending = on),
    });

    // bits-ui reports only the changes it makes itself, and callers open the dialog through the binding.
    $effect.pre(() => {
        if (!open) return;
        confirmed = false;
        runner.opened();
    });

    function onOpenChange(next: boolean) {
        if (closeOutcome(next, confirmed) === "cancel") oncancel?.();
    }
</script>

<AlertDialog.Root bind:open {onOpenChange}>
    <AlertDialog.Content class={className}>
        <div class="flex flex-col gap-1.5">
            <AlertDialog.Title>{title}</AlertDialog.Title>
            {#if typeof description === "string"}
                <AlertDialog.Description>{description}</AlertDialog.Description>
            {:else if description}
                <AlertDialog.Description>{@render description()}</AlertDialog.Description>
            {/if}
        </div>
        {@render children?.()}
        <AlertDialog.Footer>
            <AlertDialog.Cancel>{cancelLabel}</AlertDialog.Cancel>
            <AlertDialog.Action
                variant={destructive ? "destructive" : "default"}
                disabled={disabled || pending}
                onclick={() => {
                    confirmed = true;
                    void runner.confirm(onconfirm);
                }}
            >
                {confirmLabel}
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
