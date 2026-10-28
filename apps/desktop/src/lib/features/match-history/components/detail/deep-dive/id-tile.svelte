<script lang="ts">
    import ArtImage from "@deadlock-plus/ui/art-image.svelte";

    let { src, label, size = 28 }: { src?: string; label: string; size?: number } = $props();
</script>

<ArtImage
    {src}
    alt={label}
    title={label}
    class="shrink-0 rounded object-contain data-[art-state=fallback]:border data-[art-state=fallback]:border-border"
    width={size}
    height={size}
    style="width: {size}px; height: {size}px"
>
    {#snippet fallback()}{/snippet}
</ArtImage>
