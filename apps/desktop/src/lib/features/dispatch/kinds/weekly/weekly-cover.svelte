<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import EditionPaper from "../../components/edition-paper.svelte";
    import { DISPATCH_PAPER, type EditionView } from "../../edition-view";
    import ExtraStamp from "./extra-stamp.svelte";

    let {
        view,
        hot,
        angle = 0,
    }: {
        view: EditionView;
        /** Stamps the front page "Extra!". */
        hot: boolean;
        /** Degrees; 0 for an image export. */
        angle?: number;
    } = $props();
</script>

<div
    class="cover"
    data-weekly-cover
    style="width: {DISPATCH_PAPER.width}px; height: {DISPATCH_PAPER.height}px; transform: rotate({angle}deg);"
>
    <EditionPaper {view} />
    {#if hot}
        <ExtraStamp text={t("dispatch.weekly.extra")} />
    {/if}
</div>

<style>
    .cover {
        position: relative;
        flex: none;
        transform-origin: 50% 50%;
    }
</style>
