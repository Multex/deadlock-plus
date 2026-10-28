<script lang="ts">
    import { Printer } from "@lucide/svelte";

    let { label, ink, bg = "transparent" }: { label: string; ink: string; bg?: string } = $props();
</script>

<span class="mini-print" style="color: {ink}; background: {bg};"><Printer size={13} />{label}</span>

<style>
    .mini-print {
        display: inline-flex;
        align-items: center;
        align-self: center;
        gap: 6px;
        margin-top: auto;
        margin-bottom: 14px;
        padding: 4px 14px;
        border: 2px solid currentcolor;
        border-radius: 999px;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 17px;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }
</style>
