<script lang="ts">
    import { TriangleAlert } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { formatBytes, type DeleteMode, type DeletePreview } from "$lib/features/demos/demos";
    import { platform, trashName } from "$lib/core/platform";

    const trash = trashName(platform);
    const OPTIONS = $derived([
        { mode: "recycle", label: t("demos.delete.recycle", { trash }), hint: t("demos.delete.recycle_hint") },
        { mode: "permanent", label: t("demos.delete.permanent"), hint: t("demos.delete.permanent_hint") },
    ] as const);

    type Copy = { title: string; canRecycle: boolean; notice: string | null };

    let {
        open = $bindable(false),
        mode = $bindable<DeleteMode>("recycle"),
        preview,
        copy,
        deleting,
        onconfirm,
    }: {
        open?: boolean;
        mode?: DeleteMode;
        preview: DeletePreview | null;
        copy: Copy | null;
        deleting: boolean;
        onconfirm: () => void | Promise<void>;
    } = $props();
</script>

<ConfirmDialog
    bind:open
    class="max-w-md"
    title={copy?.title ?? ""}
    destructive={mode === "permanent"}
    disabled={deleting}
    confirmLabel={mode === "permanent" ? t("demos.delete.permanent") : t("demos.delete.recycle", { trash })}
    {onconfirm}
>
    {#snippet description()}
        {#if preview}{t("demos.delete.description", { size: formatBytes(preview.totalBytes) })}{/if}
    {/snippet}
    {#if copy?.notice}
        <div class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
            <TriangleAlert class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p>{copy.notice}</p>
        </div>
    {:else if copy?.canRecycle}
        <div class="flex flex-col gap-2" role="radiogroup" aria-label={t("demos.delete.method")}>
            {#each OPTIONS as option (option.mode)}
                {@const on = mode === option.mode}
                <Button
                    variant="unstyled"
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabindex={on ? 0 : -1}
                    class="flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors {on
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-accent/40'}"
                    onclick={() => (mode = option.mode)}
                    onkeydown={(e) => {
                        const at = OPTIONS.findIndex((o) => o.mode === option.mode);
                        const next = radioTarget(e.key, at, OPTIONS.length);
                        if (next === null) return;
                        e.preventDefault();
                        mode = OPTIONS[next].mode;
                        (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
                    }}
                >
                    <span
                        class="flex size-4 shrink-0 items-center justify-center rounded-full border {on
                            ? 'border-primary'
                            : 'border-muted-foreground/60'}"
                    >
                        {#if on}<span class="size-2 rounded-full bg-primary"></span>{/if}
                    </span>
                    <span class="flex flex-col">
                        <span class="text-sm font-medium">{option.label}</span>
                        <span class="text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                </Button>
            {/each}
        </div>
    {/if}
</ConfirmDialog>
