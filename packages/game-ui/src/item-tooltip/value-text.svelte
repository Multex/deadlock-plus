<script lang="ts">
    import type { ValueText } from "./model";

    let { value }: { value: ValueText } = $props();
</script>

{#if value.prefix}<span class="affix">{value.prefix}</span>{/if}{value.number}{#if value.postfix}<span class="affix"
        >{value.postfix}</span
    >{/if}

<style>
    /* `.PrefixValue, .PostfixValue`. */
    .affix {
        color: var(--tt-affix);
    }
</style>
