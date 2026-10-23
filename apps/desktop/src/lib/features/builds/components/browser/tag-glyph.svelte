<script lang="ts">
    import { cn } from "@deadlock-plus/ui/utils";
    import type { TagInfo } from "../../editor/details";
    import { tagLabel } from "../../lookups.svelte";

    let { tag, class: className }: { tag: TagInfo; class?: string } = $props();
</script>

<!-- Standard tag icons come in their own accent colours; a currentColor mask gives every tag one tint. -->
{#if tag.kind === "standard" && tag.icon}
    <span
        class={cn("shrink-0 bg-current mask-contain mask-center mask-no-repeat", className)}
        style:mask-image={`url("${tag.icon}")`}
        aria-hidden="true"
    ></span>
{:else if (tag.kind === "ability" || tag.kind === "item") && tag.art}
    <span class={cn("relative shrink-0 overflow-hidden rounded-[3px] bg-black/30", className)} aria-hidden="true">
        <img src={tag.art} alt="" loading="lazy" decoding="async" class="size-full object-cover" />
        <span class="absolute inset-0 rounded-[inherit] ring-1 ring-white/12 ring-inset"></span>
    </span>
{:else}
    <span
        class={cn(
            "grid shrink-0 place-items-center rounded-[3px] border border-current/30 text-[10px] leading-none font-semibold uppercase before:content-[attr(data-initial)]",
            className,
        )}
        data-initial={tagLabel(tag).trim().charAt(0) || "?"}
        aria-hidden="true"
    ></span>
{/if}
