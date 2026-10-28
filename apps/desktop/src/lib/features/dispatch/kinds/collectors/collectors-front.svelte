<script lang="ts">
    import type { Edition } from "@deadlock-plus/stats/dispatch/types";
    import { collectorsAssets } from "./assets.svelte";
    import Cover from "./cover.svelte";
    import { collectorsView } from "./view";

    /** The cover at rest, 720×1080, for the export's "front page": no sleeve, no tilt, the foil caught mid-shine. */
    let { edition }: { edition: Edition } = $props();

    const assets = collectorsAssets();
    const v = $derived(assets.ready ? collectorsView(edition, assets.deps) : null);
</script>

{#if v}
    <div class="front" data-kind="collectors">
        <Cover {v} still tilt={false} />
    </div>
{/if}

<style>
    .front {
        width: 720px;
        height: 1080px;
    }
    .front :global(.cover) {
        --hover: 0.75;
        --mx: 0.24;
        --my: 0.3;
    }
</style>
