<script lang="ts">
    import { untrack } from "svelte";
    import { Portal } from "bits-ui";
    import { toast } from "svelte-sonner";
    import { Copy, ImageDown, LoaderCircle, X } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { findPlayer, type MatchDetail } from "@deadlock-plus/match/detail";
    import { exportFileName, runExport, type ExportKind } from "@deadlock-plus/match/export";
    import { buildFrontPage } from "@deadlock-plus/match/stories/index";
    import {
        copyImage,
        documentHasFocus,
        exportFailureText,
        renderNodeToPng,
        saveImage,
        waitForWindowFocus,
    } from "$lib/features/match-history/export-dom";
    import FrontPage from "./front-page.svelte";
    import { frontPageView, PAPER_HEIGHT, PAPER_WIDTH } from "./front-page-view";
    import { loadExtras, viewDeps, type FrontPageExtras } from "./load";
    import type { Takeover } from "./takeover";

    let {
        detail,
        ownAccountId,
        takeover,
    }: { detail: MatchDetail; ownAccountId: number | null; takeover: Takeover<HTMLElement> } = $props();

    const ANGLE = 1.6;
    const RAIL = 168;
    const GAP = 28;
    const MARGIN = 24;
    const MAX_SCALE = 1.25;
    const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

    let dialog = $state<HTMLElement | null>(null);
    let paperNode = $state<HTMLElement | null>(null);
    let stageW = $state(0);
    let stageH = $state(0);
    let extras = $state.raw<FrontPageExtras | null>(null);
    let busy = $state<ExportKind | null>(null);

    const matchId = $derived(detail.matchId);
    const page = $derived(
        extras
            ? buildFrontPage({ detail, viewerAccountId: ownAccountId, grades: extras.grades, ping: extras.ping })
            : null,
    );
    const view = $derived(page && extras ? frontPageView(page, viewDeps(extras.heroes)) : null);

    const rad = (ANGLE * Math.PI) / 180;
    const boxW = PAPER_WIDTH * Math.cos(rad) + PAPER_HEIGHT * Math.sin(rad);
    const boxH = PAPER_WIDTH * Math.sin(rad) + PAPER_HEIGHT * Math.cos(rad);
    const scale = $derived(
        stageW && stageH
            ? Math.max(
                  0.1,
                  Math.min((stageW - RAIL - GAP - MARGIN * 2) / boxW, (stageH - MARGIN * 2) / boxH, MAX_SCALE),
              )
            : 0,
    );

    $effect(() => {
        void matchId;
        let live = true;
        extras = null;
        void loadExtras(untrack(() => detail)).then((x) => {
            if (live) extras = x;
        });
        return () => (live = false);
    });

    $effect(() => {
        dialog?.focus();
    });

    function onkeydown(e: KeyboardEvent) {
        const focusables = dialog ? [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        takeover.keydown(e, focusables, active);
    }

    function fileName(): string {
        const own = ownAccountId === null ? undefined : findPlayer(detail, [ownAccountId]);
        const heroName = own ? (extras?.heroes[own.heroId]?.name ?? null) : null;
        const outcome = own?.outcome === "win" || own?.outcome === "loss" ? own.outcome : null;
        const name = exportFileName({ heroName, outcome, matchId, date: new Date(detail.startTime * 1000) });
        return name.replace(/\.png$/, "-front-page.png");
    }

    async function run(kind: ExportKind) {
        if (!paperNode || busy) return;
        busy = kind;
        try {
            const node = paperNode;
            const result = await runExport(kind, fileName(), {
                render: () => renderNodeToPng(node, t("match_history.detail.export.made_with"), PAPER_WIDTH),
                save: saveImage,
                copy: copyImage,
                hasFocus: documentHasFocus,
                waitForFocus: waitForWindowFocus,
            });
            if (result.status === "saved") toast.success(t("front_page.export.saved"));
            else if (result.status === "copied") toast.success(t("front_page.export.copied"));
            else if (result.status === "failed")
                toast.error(exportFailureText(kind, result.error, "front_page.export.render_failed"));
        } finally {
            busy = null;
        }
    }
</script>

<svelte:window {onkeydown} />

<Portal>
    <div
        bind:this={dialog}
        class="takeover"
        role="dialog"
        aria-modal="true"
        aria-label={view?.label ?? t("front_page.dialog", { id: matchId })}
        tabindex="-1"
    >
        <div class="tabletop" aria-hidden="true" onclick={() => takeover.close()}></div>
        <div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
            {#if view && scale > 0}
                <div class="spot" style="width: {boxW * scale}px; height: {boxH * scale}px;">
                    <div
                        class="sheet"
                        style="width: {PAPER_WIDTH}px; height: {PAPER_HEIGHT}px; transform: translate(-50%, -50%) scale({scale}) rotate({ANGLE}deg);"
                    >
                        <div bind:this={paperNode}><FrontPage {view} /></div>
                    </div>
                </div>
            {:else}
                <p class="loading" role="status">
                    <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
                    {t("front_page.loading")}
                </p>
            {/if}
            <div class="rail" style="width: {RAIL}px;" role="group" aria-label={t("front_page.export.group")}>
                <Button
                    variant="outline"
                    class="w-full justify-start bg-background/85 backdrop-blur-sm"
                    onclick={() => run("save")}
                    disabled={!view || busy !== null}
                >
                    <ImageDown />
                    {busy === "save" ? t("match_history.detail.export.working") : t("match_history.detail.export.save")}
                </Button>
                <Button
                    variant="outline"
                    class="w-full justify-start bg-background/85 backdrop-blur-sm"
                    onclick={() => run("copy")}
                    disabled={!view || busy !== null}
                >
                    <Copy />
                    {busy === "copy" ? t("match_history.detail.export.working") : t("match_history.detail.export.copy")}
                </Button>
                <Button
                    variant="ghost"
                    class="w-full justify-start bg-background/85 backdrop-blur-sm"
                    onclick={() => takeover.close()}
                >
                    <X />
                    {t("front_page.close")}
                </Button>
            </div>
        </div>
    </div>
</Portal>

<style>
    .takeover {
        position: fixed;
        inset: 40px 0 0 0;
        z-index: var(--z-popover);
        outline: none;
        animation: fade 220ms ease-out both;
    }

    .tabletop {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(ellipse at 50% 45%, transparent 30%, rgb(0 0 0 / 0.45) 100%),
            color-mix(in oklch, var(--background) 55%, rgb(0 0 0 / 0.7));
        backdrop-filter: blur(3px) saturate(0.7);
    }

    .stage {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 28px;
        padding: 0 24px;
        pointer-events: none;
    }

    .spot {
        position: relative;
        flex: none;
        pointer-events: auto;
    }

    .sheet {
        position: absolute;
        left: 50%;
        top: 50%;
        transform-origin: 50% 50%;
    }

    .loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--muted-foreground);
        font-size: 14px;
    }

    .rail {
        display: flex;
        flex: none;
        flex-direction: column;
        gap: 8px;
        align-self: flex-end;
        margin-bottom: 32px;
        pointer-events: auto;
    }

    @keyframes fade {
        from {
            opacity: 0;
        }
    }
</style>
