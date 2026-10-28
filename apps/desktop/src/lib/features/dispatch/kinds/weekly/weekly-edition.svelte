<script lang="ts">
    import { prefersReducedMotion } from "$lib/core/reduced-motion";
    import { untrack } from "svelte";
    import { restTransform } from "$lib/features/front-page/toss";
    import { DISPATCH_PAPER } from "../../edition-view";
    import { fitScale, rotatedBox } from "../../fit";
    import type { EditionObjectProps } from "../types";
    import { weeklyArrival, weeklyLanding } from "./arrival";
    import { hotReasons, isHotWeek } from "./hot";
    import WeeklyCover from "./weekly-cover.svelte";

    const PAPER_ANGLE = -0.8;
    /** Room around the paper for its drop shadow. */
    const PAPER_PAD = 22;
    const JOLT: Keyframe[] = [
        { transform: "translateY(0px)" },
        { transform: "translateY(5px)", offset: 0.25 },
        { transform: "translateY(-2px)", offset: 0.6 },
        { transform: "translateY(0px)" },
    ];
    const JOLT_MS = 240;

    let { edition, view, stage, reveal, onrevealed }: EditionObjectProps = $props();

    let spot = $state<HTMLElement | null>(null);
    let toss = $state<HTMLElement | null>(null);
    let shadow = $state<HTMLElement | null>(null);
    let playing = $state(false);

    const hot = $derived(isHotWeek(edition));
    const landing = $derived(weeklyLanding(edition.id));
    const box = rotatedBox(DISPATCH_PAPER.width, DISPATCH_PAPER.height, PAPER_ANGLE);
    const scale = $derived(fitScale(stage.width, stage.height, DISPATCH_PAPER, PAPER_ANGLE, PAPER_PAD));
    const measured = $derived(scale > 0);

    const reducedMotion = () => prefersReducedMotion();

    /** Every part of the arrival starts on one timeline origin, so a frame at time t is the same on every run. */
    function arrive(): () => void {
        const arrival = weeklyArrival(edition.id, {
            hot,
            sheetHeight: DISPATCH_PAPER.height * scale,
            reduced: reducedMotion(),
        });
        if (!arrival || !toss) {
            onrevealed?.();
            return () => {};
        }
        const timing = { duration: arrival.toss.duration, easing: arrival.toss.easing };
        const animations = [toss.animate(arrival.toss.keyframes, timing)];
        if (shadow) animations.push(shadow.animate(arrival.shadow, timing));
        const stamp = toss.querySelector<HTMLElement>("[data-extra]");
        if (stamp && arrival.stamp) {
            const { keyframes, duration, delay } = arrival.stamp;
            animations.push(stamp.animate(keyframes, { duration, delay, easing: "linear", fill: "backwards" }));
        }
        const table = spot?.closest("main") ?? spot;
        for (const at of arrival.jolts) {
            const jolt = table?.animate(JOLT, { duration: JOLT_MS, delay: at, easing: "ease-out" });
            if (jolt) animations.push(jolt);
        }
        const origin = document.timeline.currentTime;
        for (const a of animations) a.startTime = origin;

        playing = true;
        let live = true;
        // Settled, not fulfilled: a part cancelled from outside still ends the reveal.
        void Promise.allSettled(animations.map((a) => a.finished)).then(() => {
            if (!live) return;
            playing = false;
            onrevealed?.();
        });
        return () => {
            live = false;
            playing = false;
            for (const a of animations) a.cancel();
        };
    }

    // Plays once per reveal: a resize or a fresher copy of the same edition must not throw the paper again.
    $effect(() => {
        if (!reveal || !measured || !toss) return;
        return untrack(arrive);
    });
</script>

{#if measured}
    <div
        bind:this={spot}
        class="spot"
        style="width: {box.w * scale}px; height: {box.h * scale}px;"
        data-weekly
        data-toss={landing.kind}
        data-hot={hot ? hotReasons(edition).join(" ") : undefined}
        data-arriving={playing ? "" : undefined}
    >
        <div bind:this={toss} class="toss" style="transform: {restTransform(landing)};">
            <div
                bind:this={shadow}
                class="shadow"
                style="width: {DISPATCH_PAPER.width * scale}px; height: {DISPATCH_PAPER.height * scale}px;"
            ></div>
            <div
                class="sheet"
                style="width: {DISPATCH_PAPER.width}px; height: {DISPATCH_PAPER.height}px; transform: translate(-50%, -50%) scale({scale});"
            >
                <WeeklyCover {view} {hot} angle={PAPER_ANGLE} />
            </div>
        </div>
    </div>
{/if}

<style>
    .spot {
        position: relative;
        flex: none;
    }

    .toss {
        position: absolute;
        inset: 0;
        transform-origin: 50% 50%;
    }

    .shadow {
        position: absolute;
        left: 50%;
        top: 50%;
        border-radius: 2px;
        background: rgb(0 0 0 / 0.6);
        filter: blur(14px);
        opacity: 0;
        translate: -50% -50%;
    }

    .sheet {
        position: absolute;
        top: 50%;
        left: 50%;
        transform-origin: center;
    }
</style>
