<script lang="ts">
    import { CircleHelp, ClipboardCopy, LoaderCircle } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import Button, { type ButtonSize, type ButtonVariant } from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t } from "$lib/core/i18n.svelte";
    import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
    import { GameCode } from "../../build-code.svelte";
    import PasteStepsDialog from "./paste-steps-dialog.svelte";

    let {
        request,
        heroId,
        variant = "outline",
        size = "sm",
        class: className,
    }: {
        /** Read on click, so the code holds the build as it is then. */
        request: () => SaveRequest;
        heroId: number;
        variant?: ButtonVariant;
        size?: ButtonSize;
        class?: string;
    } = $props();

    const code = new GameCode();
    const copying = $derived(code.status.kind === "copying");
    const help = $derived(size === "sm" ? "h-8 w-8" : "h-9 w-9");

    async function copy() {
        await code.copy(request(), heroId);
        if (code.status.kind === "failed") toast.error(code.status.message);
    }
</script>

<div class={cn("flex items-center gap-1", className)}>
    <Button class="flex-1" {variant} {size} disabled={copying} data-testid="copy-for-game" onclick={() => void copy()}>
        {#if copying}
            <LoaderCircle class="animate-spin" aria-hidden="true" />
        {:else}
            <ClipboardCopy aria-hidden="true" />
        {/if}
        {t("builds.code.copy")}
    </Button>
    <IconButton
        label={t("builds.code.steps_show")}
        tooltip
        class={cn(help, "shrink-0")}
        data-testid="copy-for-game-steps"
        onclick={() => void code.showSteps(heroId)}
    >
        <CircleHelp aria-hidden="true" />
    </IconButton>
</div>

<PasteStepsDialog {code} />
