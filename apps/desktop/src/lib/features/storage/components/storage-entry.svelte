<script lang="ts">
    import { ArrowRight, Eraser, FolderOpen, LoaderCircle } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { formatBytes } from "$lib/features/demos/demos";
    import {
        describeUnits,
        ENTRY_META,
        entryText,
        KIND_META,
        kindText,
        sizeShare,
        type EntryInfo,
        type EntryStats,
    } from "$lib/features/storage/storage";

    type Props = {
        entry: EntryInfo;
        stats: EntryStats | undefined;
        failed: boolean;
        total: number;
        now: number;
        showPath: boolean;
        clearing: boolean;
        onretry: () => void;
        onopen: (link: string) => void;
        onreveal: () => void;
        onclear: () => void;
    };

    let { entry, stats, failed, total, now, showPath, clearing, onretry, onopen, onreveal, onclear }: Props = $props();

    const meta = $derived(ENTRY_META[entry.id]);
    const text = $derived(entryText(entry.id));
    const kindVariant = $derived(KIND_META[meta.kind].variant);
    const kind = $derived(kindText(meta.kind));
    const units = $derived(stats ? describeUnits(entry.id, stats, now) : null);
</script>

<Card as="li" radius="md" padding="row" class="flex items-center gap-3">
    <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
            <p class="text-sm font-semibold text-foreground">{text.label}</p>
            <Badge variant={kindVariant} title={kind.hint}>{kind.label}</Badge>
        </div>
        <p class="mt-0.5 text-xs text-foreground">{text.description}</p>
        <p class="mt-0.5 text-xs text-muted-foreground">{text.consequence}</p>
        {#if units}
            <p class="mt-0.5 text-xs text-muted-foreground">{units}</p>
        {/if}
        {#if stats && stats.bytes > 0}
            <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                    class="h-full rounded-full bg-primary/70"
                    style="width: {Math.max(2, sizeShare(stats.bytes, total) * 100)}%"
                ></div>
            </div>
        {/if}
        {#if showPath}
            <p class="mt-1.5 truncate font-mono text-[11px] text-muted-foreground" title={entry.path ?? ""}>
                {entry.path ?? t("storage.entry.path_missing")}
            </p>
        {/if}
    </div>

    <div class="flex w-28 shrink-0 flex-col items-end text-right text-sm tabular-nums">
        {#if !entry.path}
            <span class="text-xs text-muted-foreground">{t("storage.entry.not_found")}</span>
        {:else if failed}
            <span class="text-xs text-muted-foreground">{t("storage.entry.unmeasured")}</span>
            <Button
                variant="ghost"
                size="sm"
                aria-label={t("storage.entry.retry_aria", { label: text.label })}
                onclick={onretry}
            >
                {t("storage.entry.retry")}
            </Button>
        {:else if stats === undefined}
            <LoaderCircle
                class="ml-auto size-4 animate-spin text-muted-foreground"
                role="img"
                aria-label={t("storage.entry.measuring")}
            />
        {:else}
            {formatBytes(stats.bytes)}
        {/if}
    </div>

    <div class="flex shrink-0 items-center gap-1">
        <div class="flex w-9 justify-center">
            {#if meta.link}
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("storage.entry.open_aria", { label: text.label })}
                    title={t("storage.entry.open_title", { label: text.label })}
                    onclick={() => onopen(meta.link!)}
                >
                    <ArrowRight />
                </Button>
            {/if}
        </div>
        <div class="flex w-9 justify-center">
            <Button
                variant="ghost"
                size="sm"
                aria-label={t("storage.entry.reveal_aria", { label: text.label })}
                title={t("storage.entry.reveal_title")}
                disabled={!entry.path}
                onclick={onreveal}
            >
                <FolderOpen />
            </Button>
        </div>
        <div class="flex w-9 justify-center">
            {#if entry.clearable}
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("storage.entry.clear_aria", { label: text.label })}
                    title={t("storage.entry.clear_title")}
                    disabled={!entry.path || clearing || stats?.bytes === 0}
                    onclick={onclear}
                >
                    <Eraser />
                </Button>
            {/if}
        </div>
    </div>
</Card>
