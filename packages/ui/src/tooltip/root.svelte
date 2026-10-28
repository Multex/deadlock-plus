<script lang="ts" module>
    import { getContext, setContext } from "svelte";

    const KEY = Symbol("tooltip-opened");

    /** Whether the enclosing Root has opened yet; true when there is no such Root. */
    export function contentWanted(): () => boolean {
        return getContext<(() => boolean) | undefined>(KEY) ?? (() => true);
    }
</script>

<script lang="ts">
    import { Tooltip } from "bits-ui";
    import { openedOnce } from "./opened";

    let { open = $bindable(false), ...rest }: Tooltip.RootProps = $props();

    // A page can hold dozens of closed tooltips; their content's floating and dismiss state waits for a hover.
    const opened = openedOnce();
    const wanted = $derived(opened(open));
    setContext(KEY, () => wanted);
</script>

<Tooltip.Root bind:open {...rest} />
