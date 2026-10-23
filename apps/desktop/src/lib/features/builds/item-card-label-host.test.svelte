<script lang="ts">
    import type { ComponentProps } from "svelte";
    import { provideGameText } from "@deadlock-plus/game-ui";
    import ItemCard from "@deadlock-plus/game-ui/item-card/item-card.svelte";

    let props: ComponentProps<typeof ItemCard> = $props();

    provideGameText((text) => `[${text.key}]`);
</script>

<ItemCard {...props} />
