<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { OverlayToast } from "@deadlock-plus/ipc-types/OverlayToast";
    import { kindIcon } from "$lib/features/notifications/kind-icon";

    let { toast, size }: { toast: OverlayToast; size: "corner" | "center" } = $props();

    const Icon = $derived(kindIcon(toast.kind));

    // Sizes are in em of the overlay's base size, which follows the screen height like the game's HUD.
    const SIZES = {
        corner: { card: "w-[26em] gap-[0.75em] px-[1em] py-[0.875em]", icon: "size-[1.375em]", title: "text-[1.25em]" },
        center: { card: "w-[32em] gap-[1em] px-[1.375em] py-[1.125em]", icon: "size-[1.75em]", title: "text-[1.5em]" },
    };
    const s = $derived(SIZES[size]);
</script>

<Card
    as="article"
    padding="none"
    class="flex items-start leading-[1.3] shadow-[0_0.5em_1.5em_rgb(0_0_0/0.45)] {s.card}"
    data-kind={toast.kind}
>
    <Icon class="mt-[0.125em] shrink-0 text-brass {s.icon}" aria-hidden="true" />
    <div class="min-w-0 flex-1">
        <h2 class="font-heading font-semibold tracking-wide text-card-foreground {s.title}">{toast.title}</h2>
        <p class="mt-[0.25em] line-clamp-3 text-[1em] text-muted-foreground">{toast.body}</p>
    </div>
</Card>
