<script lang="ts">
    import { cn } from "@deadlock-plus/ui/utils";

    let {
        done,
        total,
        label,
        tone = "brass",
        dim = false,
        size = "md",
    }: {
        done: number;
        total: number;
        label: string;
        tone?: "brass" | "primary" | "warning";
        dim?: boolean;
        size?: "sm" | "md";
    } = $props();

    const pct = $derived(total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100)));
    const FILL = { brass: "bg-brass", primary: "bg-primary", warning: "bg-warning" };
    const HEIGHT = { sm: "h-1", md: "h-2.5" };
</script>

<div
    class={cn("overflow-hidden rounded-full bg-muted-foreground/20", HEIGHT[size])}
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={total}
    aria-valuenow={done}
>
    <div
        class={cn("h-full rounded-full transition-[width] duration-300", FILL[tone], dim && "opacity-50")}
        style="width: {pct}%"
    ></div>
</div>
