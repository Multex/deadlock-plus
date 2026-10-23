<script lang="ts">
    import { gameText } from "../text";
    import type { BuildNoteView } from "./model";

    let { note }: { note: BuildNoteView } = $props();

    const t = gameText();
    let failed = $state<string | null>(null);
    const target = $derived(note.imbueTarget);
    const icon = $derived(target?.icon && failed !== target.icon ? target.icon : null);
</script>

<!--
    `.BuildInfoContainer`: under the paper, buildsDark&ee, radius 5. The game puts the author's 22 px avatar
    before `.NotesContainer`; the tooltip has no author to show.
-->
<div class="build-note">
    {#if note.text !== null}<span class="annotation">{note.text}</span>{/if}
    {#if note.sellPriority}<span class="sell">{t(note.sellPriority)}</span>{/if}
    {#if target}
        <span class="imbue">
            <span class="imbue-label">{t(target.label)}</span>
            {#if icon}
                <img
                    class="ability"
                    src={icon}
                    alt={target.name}
                    title={target.name}
                    draggable="false"
                    onerror={() => (failed = icon)}
                />
            {:else}
                <span class="imbue-label name">{target.name}</span>
            {/if}
        </span>
    {/if}
</div>

<style>
    .build-note {
        display: flex;
        box-sizing: border-box;
        flex-direction: column;
        align-items: flex-start;
        margin: calc(var(--u) * 3) calc(var(--u) * 10) 0;
        /* A two-line note's box is 71 tall at 1440p, its first line's ink 13 below the top. */
        padding: calc(var(--u) * 8) calc(var(--u) * 8) calc(var(--u) * 9);
        border-radius: calc(var(--u) * 5);
        background: var(--tt-build-note-bg);
    }
    /*
     * `.ModifiesLabel`: oracle bold 16 silvered, at most 60 tall. The game shrinks a longer note to fit; here it is
     * cut at three whole lines (24 apart at 1440p) so no sliver of a fourth shows.
     */
    .annotation {
        max-height: calc(var(--u) * 54);
        overflow: hidden;
        color: var(--game-silvered, #c6c6c6);
        font-family: var(--game-font-oracle);
        font-size: round(down, calc(var(--u) * 16 * var(--game-font-scale)), 1px);
        font-weight: 700;
        line-height: calc(var(--u) * 18);
        overflow-wrap: anywhere;
        white-space: pre-line;
    }
    /* `.SellPriorityLabel` keeps the base `Label`: sans 18 offWhite. */
    .sell {
        font-size: round(down, calc(var(--u) * 18 * var(--game-font-scale)), 1px);
    }
    .imbue {
        display: flex;
        align-items: center;
    }
    /* `.ImbueTargetContainer Label`: semi-bold 16 offWhite, shadow 0 0 3 #00000090. */
    .imbue-label {
        font-size: round(down, calc(var(--u) * 16 * var(--game-font-scale)), 1px);
        font-weight: 600;
        text-shadow: 0 0 calc(var(--u) * 3) var(--tt-build-note-shadow);
    }
    .name {
        margin-left: calc(var(--u) * 5);
    }
    /* `#ImbueTargetAbilityIcon`: `CitadelAbilityIcon`'s 100 px image at 40% ui-scale. */
    .ability {
        width: calc(var(--u) * 40);
        height: calc(var(--u) * 40);
        flex: none;
        margin-left: calc(var(--u) * 5);
        object-fit: contain;
    }
</style>
