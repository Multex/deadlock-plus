<script lang="ts">
    import { gameArt } from "../art";
    import { cssUrl } from "./view";

    const art = gameArt();
    const arrow = $derived(cssUrl(art().ui.modified_arrow_1));
</script>

<!-- `.GreenUpArrow`: 10 x 16 at 80% ui-scale, washed #00FF99. -->
<span class="arrow" class:fallback={!arrow} style:--arrow={arrow} aria-hidden="true"></span>

<style>
    .arrow {
        display: inline-block;
        flex: none;
        width: calc(var(--u, 1px) * 8);
        height: calc(var(--u, 1px) * 12.8);
        margin-top: calc(var(--u, 1px) * 1);
        margin-left: calc(var(--u, 1px) * 3);
        background: var(--tt-modified);
        mask: var(--arrow) center / contain no-repeat;
        vertical-align: middle;
    }
    .fallback {
        mask: none;
        clip-path: polygon(50% 0, 100% 45%, 65% 45%, 65% 100%, 35% 100%, 35% 45%, 0 45%);
    }
</style>
