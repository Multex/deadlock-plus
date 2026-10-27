<script lang="ts" module>
    export type Failure = "render" | "effect" | null;
</script>

<script lang="ts">
    import { untrack } from "svelte";

    const props: { fail: () => Failure } = $props();

    const failure = untrack(() => props.fail());
    if (failure === "render") throw new Error("render broke");

    $effect(() => {
        if (failure === "effect") throw new Error("effect broke");
    });
</script>

<p data-child>child content</p>
