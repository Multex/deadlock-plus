<script lang="ts">
    import { provideBuildsGameUi } from "$lib/features/builds/game-ui-host.svelte";

    let { children } = $props();

    provideBuildsGameUi();
</script>

{@render children?.()}
