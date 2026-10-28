<script lang="ts">
    import { updateSurface } from "../update-surface.svelte";
    import UpdateDialog from "./update-dialog.svelte";
</script>

{#if updateSurface.layout === "dialog"}
    <UpdateDialog surface={updateSurface} />
{/if}
