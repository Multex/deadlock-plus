<script lang="ts">
    import type { ExportSection } from "../export-plan";

    /**
     * One export option drawn by its own component at full size, scaled to fit `w` x `h`. `node` is the unscaled
     * root the image is rendered from.
     */
    let {
        section,
        w,
        h,
        node = $bindable(null),
    }: { section: ExportSection; w: number; h: number; node?: HTMLElement | null } = $props();

    const size = $derived(section.size);
    const offset = $derived(section.offset ?? { x: 0, y: 0 });
    const scale = $derived(Math.max(0, Math.min(w / size.width, h / size.height)));
</script>

<div class="frame" style="width: {size.width * scale}px; height: {size.height * scale}px;" data-shot={section.id}>
    <div class="sheet" style="transform: scale({scale});">
        <div bind:this={node} style="width: {size.width}px; height: {size.height}px;">
            {#if section.card}
                <section.component {...section.props} />
            {:else}
                <!-- The image is drawn from this wrapper, not the root: the renderer paints its background over the
                     node it is given and appends the footer inside it. -->
                <div>
                    <div class="shot" style="width: {size.width}px; height: {size.height}px;">
                        <div
                            class="at"
                            style="left: {-offset.x}px; top: {-offset.y}px; width: {size.width +
                                offset.x}px; height: {size.height + offset.y}px;"
                        >
                            <section.component {...section.props} />
                            {#if section.facing}
                                <section.facing.component {...section.facing.props} />
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .frame {
        position: relative;
        flex: none;
        overflow: hidden;
    }

    .sheet {
        transform-origin: 0 0;
        pointer-events: none;
    }

    .shot {
        position: relative;
        overflow: hidden;
    }

    .at {
        position: absolute;
        display: flex;
    }
</style>
