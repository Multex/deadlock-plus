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
        font-size: calc(var(--u, 1px) * var(--value-size, 26));
        font-weight: 700;
        white-space: nowrap;
    }
    .affix {
        color: var(--at-affix);
        font-family: var(--affix-font, inherit);
    }
    .prefix {
        font-size: calc(var(--u, 1px) * var(--prefix-size, 18));
    }
    .postfix {
        font-size: calc(var(--u, 1px) * var(--postfix-size, 18));
    }
</style>
