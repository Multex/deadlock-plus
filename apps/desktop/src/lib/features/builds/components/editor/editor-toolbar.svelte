<script lang="ts">
    import {
        Check,
        Clock,
        LoaderCircle,
        Magnet,
        Plus,
        Redo2,
        Save,
        Shrink,
        TriangleAlert,
        Undo2,
        ZoomIn,
        ZoomOut,
    } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { BuildEditor, SaveStatus } from "$lib/features/builds/editor/editor.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { MEASURED_RESOLUTION, type ChipItem, type ShopResolution } from "$lib/features/builds/shop-view";
    import { ZOOM_STEPS, shownZoom, stepZoom, zoomScale, type Zoom } from "./canvas/zoom";
    import { compactAll } from "./inspector/actions";
    import LayoutIssues from "./layout-issues.svelte";
    import VersionHistory from "./version-history.svelte";

    let {
        editor,
        resolution = $bindable(MEASURED_RESOLUTION),
        preview = $bindable(false),
        zoom = $bindable("fit"),
        snap = $bindable(true),
        fit = 1,
        resolve,
        onAddCategory,
        onSave,
    }: {
        editor: BuildEditor;
        resolution?: ShopResolution;
        /** The canvas shows the Build Browser's read-only preview at 1440p instead of the shop. */
        preview?: boolean;
        zoom?: Zoom;
        /** Resizes snap to sizes that keep their columns at every scale. */
        snap?: boolean;
        /** The scale that fills the canvas column; a larger zoom draws at it. */
        fit?: number;
        /** Draws chips in the version history; it waits for the shop catalog. */
        resolve?: (abilityId: number) => ChipItem | undefined;
        onAddCategory: () => void;
        onSave: () => void;
    } = $props();

    type View = ShopResolution | "preview";
    const views = $derived<readonly { value: View; label: string }[]>([
        { value: "1080", label: "1080p" },
        { value: "1440", label: "1440p" },
        { value: "2160", label: "4K" },
        { value: "preview", label: t("builds.editor.toolbar.preview") },
    ]);

    function selectView(value: View) {
        preview = value === "preview";
        resolution = value === "preview" ? MEASURED_RESOLUTION : value;
    }

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

    const percent = (scale: number) => formatNumber(scale, { style: "percent", maximumFractionDigits: 0 });
    const zoomItems = $derived([
        { value: "fit", label: t("builds.editor.toolbar.zoom_fit"), meta: percent(fit) },
        ...ZOOM_STEPS.map((step) => ({ value: String(step), label: percent(step), disabled: step >= fit })),
    ]);
    const shown = $derived(shownZoom(zoom, fit));
    const scale = $derived(zoomScale(zoom, fit));

    function compact() {
        editor.apply(compactAll(editor.build));
    }
</script>

<div
    class="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2"
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
                            options={views}
                            value={preview ? "preview" : resolution}
                            label={t("builds.editor.toolbar.resolution")}
                            onselect={selectView}
                        />
                    </span>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{t("builds.editor.toolbar.resolution_hint")}</Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>

    <div class="flex items-center gap-0.5" role="group" aria-label={t("builds.editor.toolbar.zoom")}>
        <IconButton
            label={t("builds.editor.toolbar.zoom_out")}
            tooltip={t("builds.editor.toolbar.zoom_out_tooltip")}
            aria-keyshortcuts="Control+-"
            disabled={stepZoom(zoom, fit, -1) === zoom}
            class="h-8 w-8"
            data-testid="toolbar-zoom-out"
            onclick={() => (zoom = stepZoom(zoom, fit, -1))}
        >
            <ZoomOut aria-hidden="true" />
        </IconButton>
        <span data-testid="toolbar-zoom" data-scale={scale}>
            <SelectMenu
                size="sm"
                class="w-[4.75rem]"
                items={zoomItems}
                value={String(shown)}
                aria-label={t("builds.editor.toolbar.zoom")}
                onValueChange={(value) => (zoom = value === "fit" ? "fit" : Number(value))}
            />
        </span>
        <IconButton
            label={t("builds.editor.toolbar.zoom_in")}
            tooltip={t("builds.editor.toolbar.zoom_in_tooltip")}
            aria-keyshortcuts="Control+="
            disabled={shown === "fit" || stepZoom(zoom, fit, 1) === zoom}
            class="h-8 w-8"
            data-testid="toolbar-zoom-in"
            onclick={() => (zoom = stepZoom(zoom, fit, 1))}
        >
            <ZoomIn aria-hidden="true" />
        </IconButton>
    </div>

    <IconButton
        label={t("builds.editor.toolbar.snap")}
        tooltip={t("builds.editor.toolbar.snap_tooltip")}
        variant="toggle"
        aria-pressed={snap}
        class="h-8 w-8"
        data-testid="toolbar-snap"
        onclick={() => (snap = !snap)}
    >
        <Magnet aria-hidden="true" />
    </IconButton>

    <div class="ml-auto flex items-center gap-1">
        <LayoutIssues {editor} />
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
