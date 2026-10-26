<script lang="ts">
    import { untrack } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { EditionObjectProps } from "../types";
    import { collectorsAssets } from "./assets.svelte";
    import ClimbPage from "./climb-page.svelte";
    import Cover from "./cover.svelte";
    import { CONTROLS_H, COVER, PAGE, SLEEVE, SPREAD, fitBox, insideMode, spotHeight, tearScale } from "./layout";
    import PeakPage from "./peak-page.svelte";
    import Sleeve from "./sleeve.svelte";
    import { TEAR_MS, tearFrame } from "./tear";
    import { collectorsView } from "./view";

    let { edition, stage, reveal, onrevealed, onexpand }: EditionObjectProps = $props();

    type Phase = "sealed" | "tearing" | "open";

    const assets = collectorsAssets();
    const v = $derived(assets.ready ? collectorsView(edition, assets.deps) : null);

    let phase = $state<Phase>("open");
    let at = $state(0);
    let inside = $state(false);
    let page = $state(0);
    let still = $state(false);
    let raf = 0;
    let announced = false;

    // Read per tear as well as on arrival, so a motion setting changed while the page is open applies.
    const reducedMotion = () =>
        document.documentElement.hasAttribute("data-reduced-motion") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = $derived(phase === "tearing" ? tearFrame(at) : null);
    const mode = $derived(insideMode(stage));
    const box = $derived(inside ? (mode === "spread" ? SPREAD : PAGE) : phase === "open" ? COVER : SLEEVE);
    const scale = $derived(
        inside || phase === "open" ? fitBox(stage, box) : tearScale(stage, frame ? frame.settle : 0),
    );
    const spot = $derived(spotHeight(stage, inside ? box : null));

    function setInside(open: boolean) {
        if (inside === open) return;
        inside = open;
        onexpand?.(open);
    }

    $effect(() => () => {
        if (untrack(() => inside)) onexpand?.(false);
    });

    function stop() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
    }

    function arrived() {
        if (!reveal || announced) return;
        announced = true;
        onrevealed?.();
    }

    $effect(() => {
        void edition.id;
        const arriving = reveal;
        untrack(() => {
            stop();
            still = reducedMotion();
            setInside(false);
            page = 0;
            announced = false;
            phase = arriving && !still ? "sealed" : "open";
            if (arriving && still) arrived();
        });
        return stop;
    });

    function tear() {
        if (phase !== "sealed") return;
        still = reducedMotion();
        if (still) {
            phase = "open";
            arrived();
            return;
        }
        at = 0;
        phase = "tearing";
        const t0 = performance.now();
        const step = (now: number) => {
            at = Math.min(TEAR_MS, Math.max(0, now - t0));
            if (at < TEAR_MS) {
                raf = requestAnimationFrame(step);
                return;
            }
            raf = 0;
            phase = "open";
            arrived();
        };
        raf = requestAnimationFrame(step);
    }

    function reseal() {
        setInside(false);
        page = 0;
        phase = "sealed";
    }
</script>

{#if v && scale > 0}
    <div class="object" data-kind="collectors" data-phase={phase} data-view={inside ? `inside-${mode}` : "cover"}>
        <div class="spot" style="height: {spot}px;">
            <div
                class="obj"
                style="width: {box.width}px; height: {box.height}px; transform: translate(-50%, -50%) scale({scale});"
            >
                {#if inside && mode === "spread"}
                    <div
                        class="spread"
                        role="group"
                        aria-label={t("dispatch.collectors.inside_label", { season: v.season })}
                    >
                        <ClimbPage {v} />
                        <PeakPage {v} />
                    </div>
                {:else if inside}
                    {#if page === 0}<ClimbPage {v} alone />{:else}<PeakPage {v} alone />{/if}
                {:else if phase === "open"}
                    <Cover {v} {still} />
                {:else}
                    <Sleeve {frame} {at} {still} ontear={tear}>
                        <Cover {v} still={still || phase === "tearing"} tilt={false} plate={frame?.plate ?? null} />
                    </Sleeve>
                {/if}
            </div>
        </div>

        <div class="controls" style="height: {CONTROLS_H}px;">
            {#if phase === "sealed"}
                <Button size="sm" onclick={tear}>{t("dispatch.collectors.tear_open")}</Button>
            {:else if phase === "open" && !inside}
                <Button size="sm" onclick={() => setInside(true)}>{t("dispatch.collectors.open_issue")}</Button>
                <Button size="sm" variant="outline" onclick={reseal}>{t("dispatch.collectors.reseal")}</Button>
            {:else if inside}
                {#if mode === "pages"}
                    <Button size="sm" variant="outline" disabled={page === 0} onclick={() => (page = 0)}>
                        {t("dispatch.collectors.previous_page")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={page === 1} onclick={() => (page = 1)}>
                        {t("dispatch.collectors.next_page")}
                    </Button>
                {/if}
                <Button size="sm" variant="outline" onclick={() => setInside(false)}>
                    {t("dispatch.collectors.back_to_cover")}
                </Button>
            {/if}
        </div>
    </div>
{/if}

<style>
    .object {
        display: flex;
        flex-direction: column;
        align-self: stretch;
        justify-content: center;
        width: 100%;
        min-width: 0;
    }
    .spot {
        position: relative;
        flex: none;
    }
    .obj {
        position: absolute;
        top: 50%;
        left: 50%;
        transform-origin: center;
    }
    .spread {
        display: grid;
        grid-template-columns: 720px 720px;
        width: 1440px;
        height: 1080px;
        overflow: hidden;
        border-radius: 6px;
        box-shadow:
            0 30px 60px -20px #000000bf,
            0 10px 22px #00000073;
    }
    .controls {
        display: flex;
        flex: none;
        gap: 8px;
        align-items: flex-start;
        justify-content: center;
    }
</style>
