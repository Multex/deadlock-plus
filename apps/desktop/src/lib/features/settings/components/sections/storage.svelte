<script lang="ts">
    import StoragePanel from "$lib/features/storage/components/storage-panel.svelte";

    let { show }: { show: (id: string) => boolean } = $props();
</script>

{#if show("storage")}
    <StoragePanel />
{/if}
