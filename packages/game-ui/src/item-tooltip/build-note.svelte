<script lang="ts">
    import { gameText } from "../text";
    import type { BuildNoteView } from "./model";

    let { note }: { note: BuildNoteView } = $props();

    const t = gameText();
    let failed = $state<string | null>(null);
    const target = $derived(note.imbueTarget);
    const icon = $derived(target?.icon && failed !== target.icon ? target.icon : null);
    let failedAvatar = $state<string | null>(null);
    const avatar = $derived(note.avatar && failedAvatar !== note.avatar ? note.avatar : null);
</script>

<!-- `.BuildInfoContainer`: under the paper, buildsDark&ee, radius 5; `#AuthorAvatar`, then `.NotesContainer`. -->
<div class="build-note">
    <!-- An unknown avatar keeps its space so the note wraps where the game wraps it. -->
    {#if avatar}
        <img class="avatar" src={avatar} alt="" draggable="false" onerror={() => (failedAvatar = avatar)} />
    {:else}
        <span class="avatar placeholder"></span>
    {/if}
    <div class="notes">
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
</div>

<style>
    .build-note {
        display: flex;
        box-sizing: border-box;
        align-items: center;
        margin: calc(var(--u) * 3) calc(var(--u) * 10) 0;
        /* A two-line note's box is 71 tall at 1440p with the avatar centred in it. */
        padding: calc(var(--u) * 6) calc(var(--u) * 8);
        border-radius: calc(var(--u) * 5);
        background: var(--tt-build-note-bg);
    }
    /* `#AuthorAvatar`: 22 square, margin 3, 8 on the right; the game draws it as a circle with no frame. */
    .avatar {
        width: calc(var(--u) * 22);
        height: calc(var(--u) * 22);
        flex: none;
        margin: calc(var(--u) * 3) calc(var(--u) * 8) calc(var(--u) * 3) calc(var(--u) * 3);
        border-radius: 50%;
        object-fit: cover;
    }
    .placeholder {
        background: rgb(0 0 0 / 30%);
    }
    /*
     * `.NotesContainer`: flows down, 10 after the avatar. The game draws the text 1u above the box's centre while the
     * avatar stays centred (two-line note at 1440p: x-height tops 17.5 / 45.5 below the box top, avatar centre 36).
     */
    .notes {
        display: flex;
        min-width: 0;
        flex-direction: column;
        align-items: flex-start;
        margin-top: calc(var(--u) * -1);
        margin-left: calc(var(--u) * 10);
    }
    /*
     * `.ModifiesLabel`: oracle bold 16 silvered, at most 60 tall. The game shrinks a longer note to fit; here it is
     * cut at three whole lines (28 apart at 1440p) so no sliver of a fourth shows.
     */
    .annotation {
        max-height: calc(var(--u) * 63);
        overflow: hidden;
        color: var(--game-silvered, #c6c6c6);
        font-family: var(--game-font-oracle);
        /* The game's whole-pixel advances run 1.4% narrower than the browser's at 21 px (Enchanter's Emblem note
           line 2: 411 px ink against 417). */
        font-size: calc(round(down, calc(var(--u) * 16 * var(--game-font-scale)), 1px) * 0.986);
        font-weight: 700;
        line-height: calc(var(--u) * 21);
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
