<script lang="ts">
    import type { ValueText } from "../item-tooltip/model";

    let { value }: { value: ValueText } = $props();
</script>

<!-- `.CurrentValue`: the parent sets `--value-size`, `--prefix-size` and `--postfix-size` in Panorama px. -->
<span class="value"
    >{#if value.prefix}<span class="affix prefix">{value.prefix}</span>{/if}{value.number}{#if value.postfix}<span
            class="affix postfix">{value.postfix}</span
        >{/if}</span
>

<style>
    .value {
        color: var(--game-off-white, #ffefd7);
        font-family: var(--game-font-oracle);
        font-size: round(down, calc(var(--u, 1px) * var(--value-size, 26) * var(--game-font-scale)), 1px);
        font-weight: 700;
        /* `max-height: 36` is the line box (Lightning Ball cells: value baseline to name baseline 34 px). */
        line-height: calc(var(--u, 1px) * 36);
        white-space: nowrap;
    }
    /* The affixes' own font must not grow the value's line box. */
    .affix {
        color: var(--at-affix);
        line-height: 0;
        font-family: var(--affix-font, inherit);
    }
    .prefix {
        font-size: round(down, calc(var(--u, 1px) * var(--prefix-size, 18) * var(--game-font-scale)), 1px);
    }
    .postfix {
        font-size: round(down, calc(var(--u, 1px) * var(--postfix-size, 18) * var(--game-font-scale)), 1px);
    }
</style>
