<script lang="ts">
    import RegionBoundary from "@deadlock-plus/ui/region-boundary.svelte";
    import ThrowingChild, { type Failure } from "./throwing-child.svelte";

    type Props = {
        fail: () => Failure;
        onretry?: () => void;
        onerror?: (error: unknown, name: string) => void;
    };

    let { fail, onretry, onerror }: Props = $props();
</script>

<p data-sibling>sibling content</p>
<RegionBoundary
    name="matches"
    title="Couldn't load your matches."
    body="The rest of the page still works."
    retryLabel="Retry"
    {onretry}
    {onerror}
>
    <ThrowingChild {fail} />
</RegionBoundary>
