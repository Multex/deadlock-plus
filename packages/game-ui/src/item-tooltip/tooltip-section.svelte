<script lang="ts">
    import type { ItemTooltipModel, SectionView } from "./model";
    import SectionBar from "./section-bar.svelte";
    import TooltipBlock from "./tooltip-block.svelte";

    type Props = {
        section: SectionView;
        text: ItemTooltipModel["text"];
        bindings?: Partial<Record<string, string>>;
    };

    let { section, text, bindings }: Props = $props();
</script>

<!-- `AbilityTypeSection`: the header bar, then the blocks with 14 less on the right. -->
<section class="section">
    {#if section.bar !== "none"}<SectionBar {section} />{/if}
    <div class="body">
        {#each section.blocks as block, i (i)}
            <div class="block"><TooltipBlock {block} innate={section.kind === "innate"} {text} {bindings} /></div>
        {/each}
    </div>
</section>

<style>
    .body {
        padding: 0 calc(var(--u) * 14) calc(var(--u) * 12) 0;
    }
    .block + .block {
        margin-top: calc(var(--u) * 10);
    }
</style>
