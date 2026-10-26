<script lang="ts">
    import EditionPaper from "../components/edition-paper.svelte";
    import { DISPATCH_PAPER } from "../edition-view";
    import { fitScale, rotatedBox } from "../fit";
    import type { EditionObjectProps } from "./types";

    const PAPER_ANGLE = -0.8;
    const PAPER_PAD = 22;

    let { view, stage }: EditionObjectProps = $props();

    const box = rotatedBox(DISPATCH_PAPER.width, DISPATCH_PAPER.height, PAPER_ANGLE);
    const scale = $derived(fitScale(stage.width, stage.height, DISPATCH_PAPER, PAPER_ANGLE, PAPER_PAD));
</script>

{#if scale > 0}
    <div class="spot" style="width: {box.w * scale}px; height: {box.h * scale}px;">
        <div
            class="sheet"
            style="width: {DISPATCH_PAPER.width}px; height: {DISPATCH_PAPER.height}px; transform: translate(-50%, -50%) scale({scale});"
        >
            <EditionPaper {view} angle={PAPER_ANGLE} />
        </div>
    </div>
{/if}

<style>
    .spot {
        position: relative;
        flex: none;
    }
    .sheet {
        position: absolute;
        top: 50%;
        left: 50%;
        transform-origin: center;
    }
</style>
