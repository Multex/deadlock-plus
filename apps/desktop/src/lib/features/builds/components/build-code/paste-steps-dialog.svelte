<script lang="ts">
    import { CircleCheck } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import { t } from "$lib/core/i18n.svelte";
    import { pasteSteps, type GameCode } from "../../build-code.svelte";

    let { code }: { code: GameCode } = $props();

    const steps = $derived(pasteSteps(code.heroName));
</script>

<Dialog.Root bind:open={code.open}>
    <Dialog.Content class="max-w-md" data-testid="paste-steps">
        {#if code.copied}
            <Dialog.Title class="flex items-center gap-2">
                <CircleCheck class="size-5 text-success" aria-hidden="true" />
                {t("builds.code.copied_title")}
            </Dialog.Title>
            <Dialog.Description class="text-sm text-muted-foreground">
                {t("builds.code.copied_description")}
            </Dialog.Description>
        {:else}
            <Dialog.Title>{t("builds.code.steps_title")}</Dialog.Title>
        {/if}
        <ol class="flex flex-col gap-2">
            {#each steps as step, i (step.key)}
                <li class="flex items-baseline gap-3 text-sm">
                    <span
                        class="flex size-6 shrink-0 items-center justify-center rounded-full border border-brass/50 text-xs font-semibold text-brass tabular-nums"
                        aria-hidden="true"
                    >
                        {i + 1}
                    </span>
                    <span>{t(step.key, step.params)}</span>
                </li>
            {/each}
        </ol>
        <div class="flex justify-end">
            <Button onclick={() => (code.open = false)}>{t("builds.code.done")}</Button>
        </div>
    </Dialog.Content>
</Dialog.Root>
