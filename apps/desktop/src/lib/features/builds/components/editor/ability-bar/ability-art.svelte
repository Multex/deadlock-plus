<script lang="ts">
    import ArtImage from "@deadlock-plus/ui/art-image.svelte";
    import { cn } from "@deadlock-plus/ui/utils";
    import type { AbilityInfo } from "../../../build-detail.svelte";

    let { ability, class: className }: { ability: AbilityInfo | undefined; class?: string } = $props();
</script>

<ArtImage
    src={ability?.art}
    alt=""
    label={ability?.name ?? "?"}
    draggable="false"
    class={cn("object-contain select-none", className, "text-[10px] font-semibold")}
/>
