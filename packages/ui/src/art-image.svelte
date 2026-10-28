<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLImgAttributes } from "svelte/elements";
    import { cn } from "./utils";

    type Props = Omit<HTMLImgAttributes, "src" | "alt"> & {
        src: string | null | undefined;
        /** `""` marks the art as decorative: the placeholder is hidden from screen readers too. */
        alt: string;
        /** Name the initials come from when the art is missing. */
        label?: string;
        fallback?: Snippet;
    };

    let { src, alt, label, fallback, class: className, width, height, style, onerror, ...rest }: Props = $props();

    // Keyed by the src that failed, so a new src gets a fresh attempt without an effect.
    let failedSrc = $state<string>();
    const showImage = $derived(!!src && failedSrc !== src);

    const initials = $derived(
        (label ?? "")
            .split(/\s+/)
            .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
            .filter((letter): letter is string => !!letter)
            .slice(0, 2)
            .map((letter) => letter.toUpperCase())
            .join(""),
    );

    const cssSize = (value: typeof width) =>
        value === undefined || value === null || value === ""
            ? undefined
            : /^\d+(\.\d+)?$/.test(String(value))
              ? `${value}px`
              : String(value);

    // img-only attributes (loading, srcset, draggable...) would be invalid on the placeholder.
    const passThrough = $derived(
        Object.fromEntries(
            Object.entries(rest).filter(([key]) => key.startsWith("data-") || key === "id" || key === "title"),
        ),
    );
</script>

{#if showImage}
    <img
        {...rest}
        {src}
        {alt}
        {width}
        {height}
        {style}
        class={className}
        onerror={(event) => {
            failedSrc = src ?? undefined;
            onerror?.(event);
        }}
    />
{:else}
    <span
        {...passThrough}
        class={cn(
            "inline-grid place-items-center overflow-hidden bg-muted text-xs font-semibold text-muted-foreground select-none",
            className,
        )}
        {style}
        style:width={cssSize(width)}
        style:height={cssSize(height)}
        data-art-state="fallback"
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : "true"}
    >
        {#if fallback}
            {@render fallback()}
        {:else}
            {initials}
        {/if}
    </span>
{/if}
