<script lang="ts">
    import { tick } from "svelte";
    import { Newspaper } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { getOverlayHost } from "@deadlock-plus/ui/overlay-host";
    import type { MatchDetail } from "@deadlock-plus/match/detail";
    import FrontPageTakeover from "./front-page-takeover.svelte";
    import { createTakeover } from "./takeover";

    let { detail, ownAccountId }: { detail: MatchDetail; ownAccountId: number | null } = $props();

    let open = $state(false);
    const host = getOverlayHost();

    const takeover = createTakeover<HTMLElement>({
        activeElement: () => (document.activeElement instanceof HTMLElement ? document.activeElement : null),
        onChange: (next) => (open = next),
        afterClose: (fn) => void tick().then(fn),
    });

    // Tracked like a dialog: the page underneath turns inert and app shortcuts stand down while the paper is up.
    $effect(() => {
        if (!open || !host) return;
        return host.track(() => takeover.close());
    });
</script>

<Button variant="outline" size="sm" onclick={() => takeover.show()} aria-haspopup="dialog">
    <Newspaper />
    {t("front_page.open")}
</Button>

{#if open}
    <FrontPageTakeover {detail} {ownAccountId} {takeover} />
{/if}
