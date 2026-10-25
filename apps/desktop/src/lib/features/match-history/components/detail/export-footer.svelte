<script lang="ts">
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";
    import { SITE_URL } from "@deadlock-plus/links";
    import { siteAddress } from "../../export-footer";

    let { label }: { label: string } = $props();

    const site = siteAddress(SITE_URL);
</script>

<!-- Sizes use container units so the footer scales with whatever width the image is drawn at. -->
<div class="footer">
    <div class="bar">
        <div class="rule"><span class="diamond"></span></div>
        <span class="brand">
            <span class="lead">{label}</span>
            <BrandMark solid />
        </span>
        <span class="site"><span>{site.name}</span><span class="ending">{site.ending}</span></span>
    </div>
</div>

<style>
    .footer {
        container-type: inline-size;
        border: 1px solid var(--border);
        border-top: 0;
        border-radius: 0 0 calc(var(--radius) + 2px) calc(var(--radius) + 2px);
        background: linear-gradient(180deg, var(--card), color-mix(in oklch, var(--card) 45%, var(--background)));
    }

    .bar {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 2cqw;
        padding: max(12px, 1.9cqw) max(16px, 2.6cqw);
    }

    .rule {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(
            90deg,
            transparent,
            color-mix(in oklch, var(--brass) 55%, transparent) 18%,
            color-mix(in oklch, var(--brass) 55%, transparent) 82%,
            transparent
        );
    }

    .diamond {
        position: absolute;
        top: 50%;
        left: 50%;
        width: max(5px, 0.6cqw);
        height: max(5px, 0.6cqw);
        background: var(--brass);
        transform: translate(-50%, -50%) rotate(45deg);
    }

    .brand {
        display: inline-flex;
        align-items: center;
        gap: max(8px, 1.2cqw);
    }

    .lead {
        font-family: "Retail Demo", var(--font-sans);
        font-size: max(10px, 1.1cqw);
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted-foreground);
    }

    .brand :global(img) {
        width: max(18px, 2.7cqw);
        height: max(18px, 2.7cqw);
        margin-right: max(6px, 0.9cqw);
    }

    .brand :global(.wordmark) {
        font-size: max(16px, 2.5cqw);
    }

    .site {
        font-family: "Retail Demo", var(--font-sans);
        font-size: max(13px, 1.9cqw);
        font-weight: 600;
        letter-spacing: 0.04em;
        line-height: 1;
        color: var(--foreground);
        white-space: nowrap;
    }

    .ending {
        color: var(--brass);
    }
</style>
