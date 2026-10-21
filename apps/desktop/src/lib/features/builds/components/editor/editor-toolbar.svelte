<script lang="ts">
    import { Check, Clock, LoaderCircle, Plus, Redo2, Save, Shrink, TriangleAlert, Undo2 } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { t } from "$lib/core/i18n.svelte";
    import type { BuildEditor, SaveStatus } from "$lib/features/builds/editor/editor.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { MEASURED_RESOLUTION, type ChipItem, type ShopResolution } from "$lib/features/builds/shop-view";
    import { compactAll } from "./inspector/actions";
    import VersionHistory from "./version-history.svelte";

    let {
        editor,
        resolution = $bindable(MEASURED_RESOLUTION),
        resolve,
        onAddCategory,
        onSave,
    }: {
        editor: BuildEditor;
        resolution?: ShopResolution;
        /** Draws chips in the version history; it waits for the shop catalog. */
        resolve?: (abilityId: number) => ChipItem | undefined;
        onAddCategory: () => void;
        onSave: () => void;
    } = $props();

    const RESOLUTIONS: readonly { value: ShopResolution; label: string }[] = [
        { value: "1080", label: "1080p" },
        { value: "1440", label: "1440p" },
        { value: "2160", label: "4K" },
    ];

    type EditStatus = SaveStatus | "draft_failed";
    const TONES: Record<EditStatus, "muted" | "warning" | "success"> = {
        saving: "muted",
        queued: "warning",
        conflict: "warning",
        saved: "success",
        unsaved: "muted",
        draft: "muted",
        draft_failed: "warning",
    };

    const editStatus = $derived.by((): EditStatus => {
        const status = editor.status;
        return status === "unsaved" && editor.dirty && editor.draftError ? "draft_failed" : status;
    });
    const tone = $derived(TONES[editStatus]);
    const empty = $derived(editor.build.modCategories.length === 0);

    function compact() {
        editor.apply(compactAll(editor.build));
    }
</script>

<div
    class="flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-3 py-2"
    role="toolbar"
    aria-label={t("builds.editor.toolbar.label")}
    data-testid="editor-toolbar"
>
    <Button variant="outline" size="sm" data-testid="toolbar-add-category" onclick={onAddCategory}>
        <Plus aria-hidden="true" />
        {t("builds.editor.toolbar.add_category")}
    </Button>
    <Button variant="outline" size="sm" disabled={empty} data-testid="toolbar-compact-all" onclick={compact}>
        <Shrink aria-hidden="true" />
        {t("builds.editor.toolbar.compact_all")}
    </Button>

    <Tooltip.Provider>
        <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    <span {...props} class="inline-flex" data-testid="toolbar-resolution">
                        <Segmented
                            options={RESOLUTIONS}
                            value={resolution}
                            label={t("builds.editor.toolbar.resolution")}
                            onselect={(value) => (resolution = value)}
                        />
                    </span>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{t("builds.editor.toolbar.resolution_hint")}</Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>

    <div class="ml-auto flex items-center gap-1">
        <p
            class={[
                "mr-2 flex items-center gap-1 text-xs",
                tone === "warning" && "text-warning",
                tone === "success" && "text-success",
                tone === "muted" && "text-muted-foreground",
            ]}
            role="status"
            data-testid="editor-status"
            data-state={editStatus}
        >
            {#if editor.saving}
                <LoaderCircle class="size-3 animate-spin" aria-hidden="true" />
            {:else if tone === "warning"}
                {#if editStatus === "queued"}
                    <Clock class="size-3" aria-hidden="true" />
                {:else}
                    <TriangleAlert class="size-3" aria-hidden="true" />
                {/if}
            {:else if tone === "success"}
                <Check class="size-3" aria-hidden="true" />
            {/if}
            {t(`builds.editor.status_${editStatus}`)}
        </p>
        <IconButton
            label={t("builds.editor.undo")}
            tooltip={t("builds.editor.undo_tooltip")}
            aria-keyshortcuts="Control+Z"
            disabled={!editor.canUndo}
            class="h-8 w-8"
            data-testid="editor-undo"
            onclick={() => editor.undo()}
        >
            <Undo2 aria-hidden="true" />
        </IconButton>
        <IconButton
            label={t("builds.editor.redo")}
            tooltip={t("builds.editor.redo_tooltip")}
            aria-keyshortcuts="Control+Shift+Z Control+Y"
            disabled={!editor.canRedo}
            class="h-8 w-8"
            data-testid="editor-redo"
            onclick={() => editor.redo()}
        >
            <Redo2 aria-hidden="true" />
        </IconButton>
        {#if resolve}
            <VersionHistory {editor} {resolve} />
        {/if}
        <Button
            size="sm"
            class="ml-1"
            disabled={editor.saving}
            aria-keyshortcuts="Control+S"
            data-testid="save-to-game"
            onclick={onSave}
        >
            {#if editor.saving}
                <LoaderCircle class="animate-spin" aria-hidden="true" />
            {:else}
                <Save aria-hidden="true" />
            {/if}
            {t("builds.editor.save")}
        </Button>
    </div>
</div>
