<script lang="ts">
    import { Plus } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { drag } from "../../editor/drag.svelte";

    const current = $derived(drag.current);
    const count = $derived(current?.payload.kind === "items" ? current.payload.refs.length : 0);

    // The top layer keeps the ghost above dialogs and popovers without a z-index race.
    function topLayer(node: HTMLElement) {
        node.showPopover?.();
        return () => {
            if (node.isConnected) node.hidePopover?.();
        };
    }
</script>

{#if current}
    <div
        class="ghost"
        class:category={current.payload.kind === "category"}
        popover="manual"
        aria-hidden="true"
        style:translate="{current.x + 12}px {current.y + 12}px"
        {@attach topLayer}
    >
        {#if current.preview?.art}
            <img src={current.preview.art} alt="" draggable="false" />
        {/if}
        <span class="label">{current.preview?.label ?? ""}</span>
        {#if count > 1}
            <span class="count">{count}</span>
        {/if}
        {#if current.copy}
            <span class="copy"><Plus aria-hidden="true" />{t("builds.editor.drag_copy")}</span>
        {/if}
    </div>
{/if}

<style>
    .ghost {
        position: fixed;
        inset: 0 auto auto 0;
        display: flex;
        max-width: 260px;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 4px 10px 4px 4px;
        overflow: visible;
        border: 1px solid color-mix(in oklch, var(--brass) 60%, transparent);
        border-radius: 6px;
        background: color-mix(in oklch, var(--popover) 92%, transparent);
        box-shadow: 0 8px 24px #000a;
        color: var(--popover-foreground);
        font-size: 13px;
        font-weight: 600;
        pointer-events: none;
        user-select: none;
    }
    .ghost.category {
        padding: 6px 12px;
    }
    img {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        border-radius: 4px;
        background: #0006;
        object-fit: contain;
    }
    .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .count {
        min-width: 20px;
        padding: 0 6px;
        border-radius: 999px;
        background: var(--brass);
        color: #10130d;
        font-size: 11px;
        line-height: 18px;
        text-align: center;
    }
    .copy {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        color: var(--brass);
        font-size: 11px;
        text-transform: uppercase;
    }
    .copy :global(svg) {
        width: 12px;
        height: 12px;
    }
</style>
