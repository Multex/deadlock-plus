<script lang="ts">
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";

    let { label }: { label: string } = $props();
</script>

<div class="footer">
    <span class="label">{label}</span>
    <BrandMark solid />
</div>

<style>
    .footer {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 8px 0;
        border: 1px solid var(--border);
        border-top-color: color-mix(in oklch, var(--border) 60%, transparent);
        border-radius: 0 0 calc(var(--radius) + 2px) calc(var(--radius) + 2px);
        background: var(--card);
    }
    .label {
        font-size: 13px;
        color: var(--muted-foreground);
    }
</style>
