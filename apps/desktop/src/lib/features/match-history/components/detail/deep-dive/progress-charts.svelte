<script lang="ts">
    import type { Snippet } from "svelte";
    import { ChartLine, ChevronDown, ChevronUp, Coins, Swords } from "@lucide/svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import { formatClock } from "$lib/features/live/live";
    import Button from "$lib/ui/button.svelte";
    import {
        chartDomain,
        edgeLabelTop,
        linePath,
        nearestSample,
        playerLine,
        rangeAt,
        stepSample,
        teamLeadLine,
        timeTicks,
        tOf,
        valueAt,
        xOf,
        yOf,
        type ChartBox,
        type ChartDomain,
        type LinePoint,
        type Metric,
        type TimeTick,
    } from "../../../deep-dive/chart";
    import { teamRoster } from "../../../deep-dive/roster";
    import { allPlayers, type MatchDetail, type MatchPlayer, type MatchTeam } from "../../../detail";
    import ChartTip from "./chart-tip.svelte";
    import HeroChip from "./hero-chip.svelte";
    import SectionCard from "./section-card.svelte";
    import TeamMark from "./team-mark.svelte";

    let {
        detail,
        selected,
        heroes,
        actions,
    }: { detail: MatchDetail; selected: MatchPlayer; heroes: Record<number, Hero>; actions?: Snippet } = $props();

    class Hover {
        index = $state<number | null>(null);
        /** Set while a pointer drives the cursor; the tooltip then follows it instead of the dot. */
        pointer = $state<{ x: number; y: number } | null>(null);
    }

    let metric = $state<Metric>("souls");
    const leadHover = new Hover();
    const playerHover = new Hover();
    let leadW = $state(0);
    let leadH = $state(0);
    let playerW = $state(0);
    let playerH = $state(0);

    const box: ChartBox = { width: 600, height: 160, padLeft: 4, padRight: 4, padTop: 6, padBottom: 6 };
    const TEAMS: MatchTeam[] = ["hidden-king", "archmother"];

    const lines = $derived(allPlayers(detail).map((p) => ({ p, line: playerLine(p, metric) })));
    const lead = $derived(teamLeadLine(detail, metric));
    const available = $derived(lead.length > 1);

    const playerDom = $derived(chartDomain(lines.map((l) => l.line)));
    const leadDom = $derived(chartDomain([lead]));
    const paths = $derived(lines.map((l) => ({ slot: l.p.slot, team: l.p.team, d: linePath(l.line, playerDom, box) })));
    const others = $derived(paths.filter((p) => p.slot !== selected.slot));
    const selectedPath = $derived(paths.find((p) => p.slot === selected.slot)?.d ?? "");
    const selectedLine = $derived(lines.find((l) => l.p.slot === selected.slot)?.line ?? []);
    const leadPath = $derived(linePath(lead, leadDom, box));
    const zeroY = $derived(yOf(0, leadDom, box));

    // Labels are placed in px, so the edge maths runs on the chart's drawn height, not its viewBox height.
    const LEAD_LABEL_PX = 14;
    const leadPxBox = $derived.by(() => {
        if (leadH <= 0) return box;
        const k = leadH / box.height;
        return { ...box, height: leadH, padTop: box.padTop * k, padBottom: box.padBottom * k };
    });
    const leadMaxTop = $derived(edgeLabelTop("max", leadDom, leadPxBox, LEAD_LABEL_PX));
    const leadMinTop = $derived(edgeLabelTop("min", leadDom, leadPxBox, LEAD_LABEL_PX));

    // Widest clock label at this size is 30px ("1:10:00"); the gap keeps a 35 minute match on 5 minute steps.
    const TICK_LABEL_PX = 32;
    const TICK_GAP_PX = 24;
    const ticksFor = (dom: ChartDomain, width: number) =>
        timeTicks(
            dom.tMax,
            { width, padLeft: (box.padLeft / box.width) * width, padRight: (box.padRight / box.width) * width },
            TICK_LABEL_PX,
            TICK_GAP_PX,
        );
    const leadTicks = $derived(ticksFor(leadDom, leadW));
    const playerTicks = $derived(ticksFor(playerDom, playerW));

    const num = (v: number) => formatNumber(Math.round(v));
    const signed = (v: number) => (v > 0 ? `+${num(v)}` : num(v));
    const clock = (s: number) => formatClock(Math.round(s)) ?? "";
    const roster = $derived(teamRoster(detail));
    const teamColor = (team: string) => (team === "hidden-king" ? "var(--dd-hk)" : "var(--dd-am)");
    const teamName = (team: MatchTeam) =>
        team === "hidden-king" ? t("match_history.team.hidden_king") : t("match_history.team.archmother");
    const metricName = $derived(
        t(metric === "souls" ? "match_history.deep_dive.progress.souls" : "match_history.deep_dive.progress.damage"),
    );
    const selectedName = $derived(selected.name ?? heroes[selected.heroId]?.name ?? "");

    const leftPct = (time: number, dom: ChartDomain) => (xOf(time, dom, box) / box.width) * 100;
    const topPct = (v: number, dom: ChartDomain) => (yOf(v, dom, box) / box.height) * 100;

    function track(e: PointerEvent, hover: Hover, line: readonly LinePoint[], dom: ChartDomain) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (r.width <= 0) return;
        const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
        hover.index = nearestSample(line, tOf((x / r.width) * box.width, dom, box));
        hover.pointer = { x, y: e.clientY - r.top };
    }

    function clear(hover: Hover) {
        hover.index = null;
        hover.pointer = null;
    }

    function focusIn(e: FocusEvent, hover: Hover, line: readonly LinePoint[]) {
        if (hover.index !== null || line.length === 0) return;
        if ((e.currentTarget as HTMLElement).matches(":focus-visible")) hover.index = line.length - 1;
    }

    function key(e: KeyboardEvent, hover: Hover, line: readonly LinePoint[]) {
        let next: number | null;
        if (e.key === "ArrowLeft") next = stepSample(hover.index, -1, line.length);
        else if (e.key === "ArrowRight") next = stepSample(hover.index, 1, line.length);
        else if (e.key === "Home") next = stepSample(null, 1, line.length);
        else if (e.key === "End") next = stepSample(null, -1, line.length);
        else if (e.key === "Escape") next = null;
        else return;
        e.preventDefault();
        hover.pointer = null;
        hover.index = next;
    }

    const leadPoint = $derived(leadHover.index === null ? null : (lead[leadHover.index] ?? null));
    const leadingTeam = $derived<MatchTeam | null>(
        leadPoint === null || leadPoint.v === 0 ? null : leadPoint.v > 0 ? "hidden-king" : "archmother",
    );
    const leadDot = $derived(
        leadPoint === null ? null : { left: leftPct(leadPoint.t, leadDom), top: topPct(leadPoint.v, leadDom) },
    );
    const leadAnchor = $derived(
        leadHover.pointer ?? (leadDot ? { x: (leadDot.left / 100) * leadW, y: (leadDot.top / 100) * leadH } : null),
    );
    const leadText = $derived(
        leadPoint === null
            ? ""
            : leadingTeam
              ? `${clock(leadPoint.t)} · ${teamName(leadingTeam)} +${num(Math.abs(leadPoint.v))}`
              : `${clock(leadPoint.t)} · ${t("match_history.deep_dive.progress.lead_even")}`,
    );

    const playerPoint = $derived(playerHover.index === null ? null : (selectedLine[playerHover.index] ?? null));
    const playerDots = $derived.by(() => {
        const at = playerPoint;
        if (at === null) return [];
        return lines
            .filter((l) => l.line.length > 0)
            .map((l) => ({
                slot: l.p.slot,
                team: l.p.team,
                selected: l.p.slot === selected.slot,
                left: leftPct(at.t, playerDom),
                top: topPct(valueAt(l.line, at.t), playerDom),
            }));
    });
    const otherRanges = $derived.by(() => {
        const at = playerPoint;
        if (at === null) return [];
        return TEAMS.flatMap((team) => {
            const range = rangeAt(
                lines.filter((l) => l.p.team === team && l.p.slot !== selected.slot).map((l) => l.line),
                at.t,
            );
            return range ? [{ team, ...range }] : [];
        });
    });
    const playerAnchor = $derived.by(() => {
        if (playerHover.pointer) return playerHover.pointer;
        const dot = playerDots.find((d) => d.selected);
        return dot ? { x: (dot.left / 100) * playerW, y: (dot.top / 100) * playerH } : null;
    });
    const playerText = $derived(
        playerPoint === null ? "" : `${clock(playerPoint.t)} · ${selectedName} ${num(playerPoint.v)}`,
    );
</script>

{#snippet cursor(time: number, dom: ChartDomain)}
    <line
        x1={xOf(time, dom, box)}
        x2={xOf(time, dom, box)}
        y1="0"
        y2={box.height}
        stroke="var(--color-muted-foreground)"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
    />
{/snippet}

{#snippet gridlines(ticks: TimeTick[], dom: ChartDomain)}
    {#each ticks as k (k.t)}
        <line
            x1={xOf(k.t, dom, box)}
            x2={xOf(k.t, dom, box)}
            y1="0"
            y2={box.height}
            stroke="var(--color-border)"
            stroke-opacity="0.5"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
        />
    {/each}
{/snippet}

{#snippet axis(ticks: TimeTick[])}
    <div class="relative h-[18px] text-[10px] leading-[14px] text-muted-foreground tabular-nums" aria-hidden="true">
        {#each ticks as k (k.t)}
            <i class="absolute top-0 h-1 w-px -translate-x-1/2 bg-muted-foreground/60" style:left="{k.x}px"></i>
            <span
                class={["absolute top-1 whitespace-nowrap", k.align === "center" && "-translate-x-1/2"]}
                style:left={k.align === "end" ? null : `${k.align === "start" ? 0 : k.x}px`}
                style:right={k.align === "end" ? "0" : null}
            >
                {clock(k.t)}
            </span>
        {/each}
    </div>
{/snippet}

<SectionCard title={t("match_history.deep_dive.progress.heading")} icon={ChartLine} {available} {actions}>
    <div class="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="toggle" aria-pressed={metric === "souls"} onclick={() => (metric = "souls")}>
            <Coins size={14} aria-hidden="true" />
            {t("match_history.deep_dive.progress.souls")}
        </Button>
        <Button
            size="sm"
            variant="toggle"
            aria-pressed={metric === "playerDamage"}
            onclick={() => (metric = "playerDamage")}
        >
            <Swords size={14} aria-hidden="true" />
            {t("match_history.deep_dive.progress.damage")}
        </Button>
    </div>

    <h3 class="mb-1 text-xs font-medium text-muted-foreground">
        {t("match_history.deep_dive.progress.lead_heading")}
    </h3>
    <div
        class="relative touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="slider"
        tabindex="0"
        aria-label={t("match_history.deep_dive.progress.lead_aria")}
        aria-valuemin={0}
        aria-valuemax={Math.max(lead.length - 1, 0)}
        aria-valuenow={leadHover.index ?? Math.max(lead.length - 1, 0)}
        aria-valuetext={leadText}
        bind:clientWidth={leadW}
        bind:clientHeight={leadH}
        onpointermove={(e) => track(e, leadHover, lead, leadDom)}
        onpointerleave={() => clear(leadHover)}
        onfocus={(e) => focusIn(e, leadHover, lead)}
        onblur={() => clear(leadHover)}
        onkeydown={(e) => key(e, leadHover, lead)}
    >
        <svg
            viewBox="0 0 {box.width} {box.height}"
            class="block h-40 w-full"
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            {@render gridlines(leadTicks, leadDom)}
            <line
                x1={box.padLeft}
                x2={box.width - box.padRight}
                y1={zeroY}
                y2={zeroY}
                stroke="var(--color-border)"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
            />
            {#if leadPoint}{@render cursor(leadPoint.t, leadDom)}{/if}
            <path
                d={leadPath}
                fill="none"
                stroke="var(--color-foreground)"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
            />
        </svg>
        {#if leadMaxTop !== null}
            <span class="absolute left-1 text-[10px] leading-[14px] text-muted-foreground" style:top="{leadMaxTop}px">
                {signed(leadDom.vMax)}
            </span>
        {/if}
        {#if leadMinTop !== null}
            <span class="absolute left-1 text-[10px] leading-[14px] text-muted-foreground" style:top="{leadMinTop}px">
                {signed(leadDom.vMin)}
            </span>
        {/if}
        {#if leadPoint && leadDot && leadAnchor}
            <span
                class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
                style:left="{leadDot.left}%"
                style:top="{leadDot.top}%"
                style:background={leadingTeam ? teamColor(leadingTeam) : "var(--color-foreground)"}
                aria-hidden="true"
                data-export-ignore
            ></span>
            <ChartTip anchor={leadAnchor} area={{ width: leadW, height: leadH }}>
                <div class="text-muted-foreground tabular-nums">{clock(leadPoint.t)} · {metricName}</div>
                {#if leadingTeam}
                    <div class="flex items-center gap-1.5 font-medium" style:color={teamColor(leadingTeam)}>
                        <TeamMark team={leadingTeam} size={8} />
                        <span>{teamName(leadingTeam)}</span>
                        <span class="ml-auto pl-3 tabular-nums">+{num(Math.abs(leadPoint.v))}</span>
                    </div>
                {:else}
                    <div class="font-medium">{t("match_history.deep_dive.progress.lead_even")}</div>
                {/if}
            </ChartTip>
        {/if}
    </div>
    {@render axis(leadTicks)}
    <p class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1">
            <ChevronUp size={14} aria-hidden="true" />
            <TeamMark team="hidden-king" />
            <ChevronDown size={14} aria-hidden="true" />
            <TeamMark team="archmother" />
            {t("match_history.deep_dive.progress.lead_hint")}
        </span>
    </p>

    <h3 class="mb-1 mt-4 text-xs font-medium text-muted-foreground">
        {t("match_history.deep_dive.progress.player_heading")}
    </h3>
    <div
        class="relative touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="slider"
        tabindex="0"
        aria-label={t("match_history.deep_dive.progress.player_aria")}
        aria-valuemin={0}
        aria-valuemax={Math.max(selectedLine.length - 1, 0)}
        aria-valuenow={playerHover.index ?? Math.max(selectedLine.length - 1, 0)}
        aria-valuetext={playerText}
        bind:clientWidth={playerW}
        bind:clientHeight={playerH}
        onpointermove={(e) => track(e, playerHover, selectedLine, playerDom)}
        onpointerleave={() => clear(playerHover)}
        onfocus={(e) => focusIn(e, playerHover, selectedLine)}
        onblur={() => clear(playerHover)}
        onkeydown={(e) => key(e, playerHover, selectedLine)}
    >
        <svg
            viewBox="0 0 {box.width} {box.height}"
            class="block h-40 w-full"
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            {@render gridlines(playerTicks, playerDom)}
            {#if playerPoint}{@render cursor(playerPoint.t, playerDom)}{/if}
            {#each others as o (o.slot)}
                <path
                    d={o.d}
                    fill="none"
                    stroke={teamColor(o.team)}
                    stroke-opacity="0.35"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                />
            {/each}
            <path
                d={selectedPath}
                fill="none"
                stroke={teamColor(selected.team)}
                stroke-width="2.5"
                vector-effect="non-scaling-stroke"
            />
        </svg>
        <span class="absolute left-1 top-0 text-[10px] text-muted-foreground">{num(playerDom.vMax)}</span>
        <span class="absolute bottom-0 left-1 text-[10px] text-muted-foreground">{num(playerDom.vMin)}</span>
        {#if playerPoint && playerAnchor}
            {#each playerDots as d (d.slot)}
                <span
                    class={[
                        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
                        d.selected ? "z-10 size-2.5 border-2 border-background" : "size-1.5 opacity-70",
                    ]}
                    style:left="{d.left}%"
                    style:top="{d.top}%"
                    style:background={teamColor(d.team)}
                    aria-hidden="true"
                    data-export-ignore
                ></span>
            {/each}
            <ChartTip anchor={playerAnchor} area={{ width: playerW, height: playerH }}>
                <div class="text-muted-foreground tabular-nums">{clock(playerPoint.t)} · {metricName}</div>
                <div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5 tabular-nums">
                    <i
                        class="inline-block h-[3px] w-3 rounded-full"
                        style:background={teamColor(selected.team)}
                        aria-hidden="true"
                    ></i>
                    <span class="font-medium">{selectedName}</span>
                    <span class="pl-3 text-right font-medium">{num(playerPoint.v)}</span>
                    {#if otherRanges.length > 0}
                        <span class="col-span-3 mt-1 text-muted-foreground">
                            {t("match_history.deep_dive.progress.others_range")}
                        </span>
                        {#each otherRanges as r (r.team)}
                            <i
                                class="inline-block h-px w-3 opacity-70"
                                style:background={teamColor(r.team)}
                                aria-hidden="true"
                            ></i>
                            <span>{teamName(r.team)}</span>
                            <span class="pl-3 text-right">{num(r.min)} – {num(r.max)}</span>
                        {/each}
                    {/if}
                </div>
            </ChartTip>
        {/if}
    </div>
    {@render axis(playerTicks)}
    <div class="mt-2 flex flex-col gap-1.5">
        {#each roster as r (r.team)}
            <div class="flex flex-wrap items-center gap-1.5">
                <TeamMark team={r.team} />
                {#each r.players as p (p.slot)}
                    <HeroChip
                        heroId={p.heroId}
                        {heroes}
                        team={p.team}
                        size={22}
                        emphasised={p.slot === selected.slot}
                        dimmed={p.slot !== selected.slot}
                    />
                {/each}
            </div>
        {/each}
        <p class="text-xs text-muted-foreground">{t("match_history.deep_dive.progress.player_hint")}</p>
    </div>
</SectionCard>
