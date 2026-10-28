<script lang="ts">
    let {
        text,
        w,
        h,
        fill,
        stroke = "none",
    }: { text: string; w: number; h: number; fill: string; stroke?: string } = $props();
</script>

<svg class="mini-mast" viewBox="0 0 {w} {h}" width={w} height={h} aria-hidden="true">
    <text
        x="0"
        y={h * 0.86}
        textLength={w}
        lengthAdjust="spacingAndGlyphs"
        font-size={h * 1.08}
        {fill}
        {stroke}
        stroke-width={stroke === "none" ? 0 : 1.4}>{text}</text
    >
</svg>

<style>
    .mini-mast {
        display: block;
        flex: none;
        font-family: "Retail Demo", sans-serif;
        font-weight: 800;
    }
</style>
