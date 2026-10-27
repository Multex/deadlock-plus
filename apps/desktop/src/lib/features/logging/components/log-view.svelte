<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { failureText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { saveTextFile } from "$lib/core/files";
    import { Copy, FolderOpen, RefreshCw, Save } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { exportLogs, filterEntries, LEVELS, openLogDir, readLogs, type LogLevel } from "$lib/features/logging/logs";
    import { LogReader } from "$lib/features/logging/log-reader.svelte";
    import { loadLogViewPrefs, saveLogAutoScroll, saveLogMinLevel } from "$lib/features/logging/view-prefs";

    let { full = false }: { full?: boolean } = $props();

    const COMPACT_ROWS = 300;
    const TAG_CLASS: Record<LogLevel, string> = {
        ERROR: "text-red-400",
        WARN: "text-yellow-400",
        INFO: "text-green-400",
        DEBUG: "text-green-400",
        TRACE: "text-blue-400",
    };
    const LEVEL_ITEMS = LEVELS.map((l) => ({ value: l, label: l, level: l }));

    const reader = new LogReader(readLogs);
    const entries = $derived(reader.entries);
    const failed = $derived(reader.failed);
    const saved = loadLogViewPrefs();
    let level = $state<LogLevel>(saved.level);
    let query = $state("");

    const visible = $derived(entries ? filterEntries(entries, level, query) : []);
    const shown = $derived(full ? visible : visible.slice(-COMPACT_ROWS));

    let autoScroll = $state(saved.autoScroll);
    let scroller = $state<HTMLDivElement | null>(null);

    $effect(() => {
        shown;
        if (autoScroll && scroller) scroller.scrollTop = scroller.scrollHeight;
    });

    const load = () => reader.load();

    onMount(load);

    async function copyLogs() {
        try {
            await navigator.clipboard.writeText(await exportLogs());
            toast.success(t("logging.copied"));
        } catch {
            toast.error(t("logging.copy_failed"));
        }
    }

    async function saveLogs() {
        try {
            const saved = await saveTextFile(
                { defaultName: "deadlock-plus-log.txt", filterName: t("logging.save_filter"), extension: "txt" },
                await exportLogs(),
            );
            if (saved) toast.success(t("logging.saved"));
        } catch (e) {
            toast.error(failureText(e, t("logging.save_failed")));
        }
    }

    async function openFolder() {
        try {
            await openLogDir();
        } catch (e) {
            toast.error(failureText(e, t("logging.open_failed")));
        }
    }
</script>

<div class="flex min-h-0 flex-col gap-3 {full ? 'h-full' : ''}">
    <div class="flex flex-wrap items-center gap-2">
        <SelectMenu
            items={LEVEL_ITEMS}
            value={level}
            onValueChange={(v) => {
                level = v as LogLevel;
                saveLogMinLevel(level);
            }}
            aria-label={t("logging.min_level")}
            class="w-32"
        >
            {#snippet leading(item)}
                <span class="size-2 rounded-full bg-current {TAG_CLASS[item.level]}"></span>
            {/snippet}
        </SelectMenu>
        <Input
            bind:value={query}
            placeholder={t("logging.search")}
            class="min-w-32 flex-1"
            aria-label={t("logging.search_label")}
        />
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
                bind:checked={autoScroll}
                onCheckedChange={saveLogAutoScroll}
                aria-label={t("logging.auto_scroll")}
            />
            {t("logging.auto_scroll")}
        </label>
        <Button variant="outline" size="sm" onclick={load} aria-label={t("logging.refresh")}><RefreshCw /></Button>
        <Button variant="outline" size="sm" onclick={copyLogs}><Copy />{t("logging.copy")}</Button>
        <Button variant="outline" size="sm" onclick={saveLogs}><Save />{t("logging.save")}</Button>
        <Button variant="outline" size="sm" onclick={openFolder}><FolderOpen />{t("logging.open_folder")}</Button>
    </div>

    {#if failed}
        <p class="text-xs text-destructive">{failed}</p>
    {:else if !entries}
        <p class="text-xs text-muted-foreground">{t("logging.loading")}</p>
    {:else if shown.length === 0}
        <p class="text-xs text-muted-foreground">{t("logging.no_match")}</p>
    {:else}
        <div
            bind:this={scroller}
            class="{full
                ? 'min-h-0 flex-1'
                : 'max-h-80'} overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] leading-snug select-text"
        >
            {#if visible.length > shown.length}
                <p class="mb-1 text-muted-foreground">
                    {t("logging.showing_latest", { shown: shown.length, total: visible.length })}
                </p>
            {/if}
            {#each shown as e, i (i)}
                <div class="whitespace-pre-wrap break-words">
                    <span class="text-blue-400">[{e.time}]</span>
                    <span class={TAG_CLASS[e.level]}>[{e.thread} | {e.level}]</span>
                    <span class="text-cyan-400">[{e.logger}]</span>:
                    <span class={e.level === "ERROR" ? "text-red-400" : ""}>{e.message}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>
