<script lang="ts">
    import PaperObject from "../paper-object.svelte";
    import type { EditionObjectProps } from "../types";

    let props: EditionObjectProps = $props();
</script>

<PaperObject {...props} />
