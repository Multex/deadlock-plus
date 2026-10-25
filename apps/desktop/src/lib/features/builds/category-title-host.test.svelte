<script lang="ts">
    import type { ComponentProps } from "svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import CategoryTitle from "./components/shop/category-title.svelte";

    let props: ComponentProps<typeof CategoryTitle> = $props();
</script>

<Tooltip.Provider>
    <CategoryTitle {...props} />
</Tooltip.Provider>
