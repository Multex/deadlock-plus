<script lang="ts">
    import { untrack } from "svelte";
    import { Crosshair, Gauge, Map as MapIcon, Pause, Play, Skull, Tent, UserRound, Users } from "@lucide/svelte";
    import { formatNumber, i18n, t } from "$lib/core/i18n.svelte";
    import {
        loadHeroMinimapArt,
        loadMapItems,
        loadMinimapArt,
        loadMinimapIcons,
        type MinimapArt,
    } from "$lib/features/gamedata/gamedata";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { keepGameArt } from "$lib/features/gamedata/art-refresh";
    import HeroIcon from "$lib/features/live/components/hero-icon.svelte";
    import { formatClock } from "$lib/features/live/live";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Section from "@deadlock-plus/ui/section.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Slider from "@deadlock-plus/ui/slider.svelte";
    import {
        deathFacts,
        deathSteps,
        resolveScope,
        scopeFilter,
        stepIndex,
        stepScene,
        stepTo,
        type DeathRole,
        type DeathScope,
        type DeathStep,
    } from "@deadlock-plus/match/death-steps";
    import type { IdVisual } from "@deadlock-plus/match/deep-dive/catalog";
    import { resolveItemListVisuals } from "../../deep-dive/catalog";
    import { campClears } from "@deadlock-plus/match/camp-clears";
    import { objectiveRows } from "@deadlock-plus/match/deep-dive/objective-rows";
    import { objectiveNameKey } from "../../deep-dive/objective-rows";
    import {
        allPlayers,
        findPlayer,
        playerBySlot,
        type MatchDetail,
        type MatchTeam,
    } from "@deadlock-plus/match/detail";
    import { laneStrokes, type LaneTable } from "@deadlock-plus/match/lane-lines";
    import { MAP_OBJECT_STEMS, mapObjects, type MapObjectIcons } from "@deadlock-plus/match/map-objects";
    import { decodePaths, WORLD_RADIUS } from "@deadlock-plus/match/paths";
    import { deathScopeItems, groupTeam, parseDeathScope, roleItems, speedOptions } from "../../player-menu";
    import {
        DEFAULT_KINDS,
        SPEEDS,
        advance,
        mapDots,
        markerPercent,
        replayDuration,
        type DeathEvent,
        type ReplaySpeed,
    } from "@deadlock-plus/match/replay";
    import { buildTimeline, type TimelineEvent, type TimelineKind } from "@deadlock-plus/match/timeline";
    import Segmented from "../list/segmented.svelte";
    import DeathStepper from "./death-stepper.svelte";
    import TeamMark from "./deep-dive/team-mark.svelte";
    import ReplayMap from "./replay-map.svelte";
    import ReplayTimeline from "./replay-timeline.svelte";

    let { detail, ownAccountIds = [] }: { detail: MatchDetail; ownAccountIds?: number[] } = $props();

    const MAX_FRAME_MS = 250;
    const uid = $props.id();

    const decoded = $derived(decodePaths(detail));
    const events = $derived(buildTimeline(detail));
    const duration = $derived(replayDuration(detail, decoded, events));
    const players = $derived(allPlayers(detail));
    const ownSlot = $derived(findPlayer(detail, ownAccountIds)?.slot ?? null);

    let time = $state(0);
    let playing = $state(false);
    let speed = $state<ReplaySpeed>(1);
    let kinds = $state<TimelineKind[]>([...DEFAULT_KINDS]);
    let deathMode = $state(false);
    let showCamps = $state(true);
    let scopeChoice = $state<DeathScope | null>(null);
    let filterRole = $state<DeathRole>("victim");
    let rangeFrom = $state(0);
    let rangeTo = $state(0);
    let rangeTouched = $state(false);
    let selected = $state.raw<TimelineEvent | null>(null);

    let art = $state.raw<MinimapArt | null>(null);
    let artLoaded = $state(false);
    let heroes = $state.raw<Record<number, Hero>>({});
    let heroArt = $state.raw<Record<number, string>>({});
    let markerArt = $state.raw<string | null>(null);
    let coneArt = $state.raw<string | null>(null);
    let mapTable = $state.raw<LaneTable | null>(null);
    let objectIcons = $state.raw<MapObjectIcons>({});
    let itemVisuals = $state.raw(new Map<number, IdVisual>());

    $effect(() => {
        detail.matchId;
        time = 0;
        playing = false;
        selected = null;
        scopeChoice = null;
        rangeTouched = false;
    });

    $effect(() => {
        let live = true;
        const stopArt = keepGameArt(() =>
            loadMinimapArt().then((found) => {
                if (!live) return;
                art = found;
                artLoaded = true;
            }),
        );
        return () => {
            live = false;
            stopArt();
        };
    });

    $effect(() => {
        let live = true;
        void loadMapItems().then((found) => {
            if (live) mapTable = found?.table ?? null;
        });
        return () => (live = false);
    });

    $effect(() => {
        let live = true;
        const stopArt = keepGameArt(() =>
            loadMinimapIcons([...MAP_OBJECT_STEMS]).then((found) => {
                if (live) objectIcons = found;
            }),
        );
        return () => {
            live = false;
            stopArt();
        };
    });

    $effect(() => {
        let live = true;
        const stopArt = keepGameArt(() =>
            Promise.all([
                loadHeroMinimapArt().then((found) => {
                    if (live) heroArt = found;
                }),
                loadMinimapIcons(["player_marker_self", "player_cone"]).then((found) => {
                    if (!live) return;
                    markerArt = found.player_marker_self ?? null;
                    coneArt = found.player_cone ?? null;
                }),
            ]),
        );
        return () => {
            live = false;
            stopArt();
        };
    });

    $effect(() => {
        const ids = players.map((p) => p.heroId);
        let live = true;
        void loadHeroes(ids).then((h) => {
            if (live) heroes = h;
        });
        return () => (live = false);
    });
    $effect(() => onHeroesRefreshed((h) => (heroes = h)));

    const wantsItems = $derived(kinds.includes("item-buy") || kinds.includes("item-sell"));
    $effect(() => {
        if (!wantsItems) return;
        const ids = [
            ...new Set(events.flatMap((e) => (e.kind === "item-buy" || e.kind === "item-sell" ? [e.itemId] : []))),
        ];
        const locale = i18n.locale;
        let live = true;
        const stopArt = keepGameArt(() =>
            resolveItemListVisuals(ids, locale).then((found) => {
                if (live) itemVisuals = found;
            }),
        );
        return () => {
            live = false;
            stopArt();
        };
    });

    $effect(() => {
        if (!playing) return;
        let last = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const next = advance(
                untrack(() => time),
                Math.min(now - last, MAX_FRAME_MS),
                untrack(() => speed),
                untrack(() => duration),
            );
            last = now;
            time = next.t;
            if (next.ended) {
                playing = false;
                return;
            }
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    });

    const radius = $derived(art?.radius ?? WORLD_RADIUS);
    const dots = $derived(decoded ? mapDots(decoded, time, radius) : []);
    const viewerTeam = $derived(dots.find((d) => d.slot === ownSlot)?.team ?? null);
    const laneLines = $derived(mapTable ? laneStrokes(mapTable, viewerTeam, radius) : []);
    const mapRows = $derived(mapTable?.rows ?? null);
    // Keyed by index into `mapRows`, so the objects below must be built from the same array.
    const campDowns = $derived(decoded && mapRows ? campClears(mapRows, decoded, detail.durationS) : null);
    const objects = $derived(
        mapRows
            ? mapObjects({
                  rows: mapRows,
                  objectives: detail.objectives,
                  viewerTeam,
                  time,
                  radius,
                  icons: objectIcons,
                  showCamps,
                  midBoss: detail.midBoss,
                  campDowns,
              })
            : [],
    );
    const effectiveTo = $derived(rangeTouched ? Math.min(rangeTo, duration) : duration);
    const effectiveFrom = $derived(rangeTouched ? Math.min(rangeFrom, effectiveTo) : 0);
    const scope = $derived(resolveScope(scopeChoice, ownSlot));
    const steps = $derived(
        deathMode
            ? deathSteps(
                  detail,
                  events,
                  scopeFilter(scope, ownSlot, filterRole, { fromS: effectiveFrom, toS: effectiveTo }),
                  radius,
              )
            : [],
    );
    const step = $derived(selected?.kind === "death" ? (steps[stepIndex(steps, selected)] ?? null) : null);
    const scene = $derived(decoded && step ? stepScene(decoded, step, radius) : null);

    const objectiveLabels = $derived.by(() => {
        const out = new Map<string, string>();
        for (const row of objectiveRows(detail.objectives)) {
            const name = t(objectiveNameKey(row.kind));
            out.set(
                `${row.objectiveId}:${row.team}:${row.destroyedS}`,
                row.index === undefined
                    ? name
                    : t("match_history.deep_dive.objectives.indexed_name", { name, index: row.index }),
            );
        }
        return out;
    });

    const clock = (s: number) => formatClock(Math.round(s)) ?? "0:00";
    const teamName = (team: MatchTeam | undefined) =>
        team === undefined
            ? t("match_history.detail.replay.unknown")
            : team === "hidden-king"
              ? t("match_history.team.hidden_king")
              : t("match_history.team.archmother");
    const nameOf = (slot: number) => {
        const p = playerBySlot(detail, slot);
        return p
            ? (p.name ?? t("match_history.deep_dive.player_fallback", { slot }))
            : t("match_history.detail.replay.unknown");
    };
    const heroOf = (slot: number) => playerBySlot(detail, slot)?.heroId ?? null;
    const heroNameOf = (slot: number) => {
        const id = heroOf(slot);
        return (id === null ? undefined : heroes[id]?.name) ?? t("match_history.detail.replay.unknown_hero");
    };
    const itemName = (id: number) => itemVisuals.get(id)?.name ?? t("match_history.deep_dive.names.item");

    const scopeItems = $derived(
        deathScopeItems(detail, ownSlot, {
            teamName,
            fallbackName: (slot) => t("match_history.deep_dive.player_fallback", { slot }),
            heroName: (heroId) => heroes[heroId]?.name ?? t("match_history.detail.replay.unknown_hero"),
            you: t("match_history.detail.you"),
            mine: t("match_history.detail.replay.my_deaths"),
            all: t("match_history.detail.replay.all_players"),
        }),
    );
    const roles = $derived(
        roleItems({
            victim: t("match_history.detail.replay.role_victim"),
            killer: t("match_history.detail.replay.role_killer"),
        }),
    );
    const speeds = $derived(speedOptions((s) => t("match_history.detail.replay.speed", { speed: s })));

    function labelOf(e: TimelineEvent): string {
        const time = clock(e.timeS);
        switch (e.kind) {
            case "death":
                return t("match_history.detail.replay.marker_death", {
                    victim: nameOf(e.victimSlot),
                    killer: nameOf(e.killerSlot),
                    time,
                });
            case "objective":
                return t("match_history.detail.replay.marker_objective", {
                    objective:
                        objectiveLabels.get(`${e.objectiveId}:${e.team}:${e.timeS}`) ??
                        t("match_history.deep_dive.objectives.kind_unknown"),
                    team: teamName(e.team),
                    time,
                });
            case "mid-boss":
                return t("match_history.detail.replay.marker_mid_boss", {
                    team: teamName(e.claimedBy ?? e.killedBy),
                    time,
                });
            case "item-buy":
                return t("match_history.detail.replay.marker_item_buy", {
                    player: nameOf(e.slot),
                    item: itemName(e.itemId),
                    time,
                });
            case "item-sell":
                return t("match_history.detail.replay.marker_item_sell", {
                    player: nameOf(e.slot),
                    item: itemName(e.itemId),
                    time,
                });
            case "swing":
                return t("match_history.detail.replay.marker_swing", {
                    team: teamName(e.team),
                    souls: formatNumber(Math.abs(e.leadAfter - e.leadBefore)),
                    time,
                });
        }
    }

    function deathLines(s: DeathStep): string[] {
        const facts = deathFacts(s);
        const killer = facts.killerKnown
            ? `${nameOf(facts.killerSlot)} · ${heroNameOf(facts.killerSlot)}`
            : t("match_history.detail.replay.killer_slot", { slot: facts.killerSlot });
        return [
            `${nameOf(facts.victimSlot)} · ${heroNameOf(facts.victimSlot)}`,
            clock(facts.timeS),
            t("match_history.detail.replay.killed_by", { killer }),
            ...(facts.respawnS === undefined
                ? []
                : [
                      t("match_history.detail.replay.death_respawn", {
                          seconds: formatNumber(Math.round(facts.respawnS)),
                      }),
                  ]),
            ...(facts.position ? [t("match_history.detail.replay.death_position", facts.position)] : []),
        ];
    }

    function togglePlay() {
        if (!playing && time >= duration) time = 0;
        playing = !playing;
        if (playing && deathMode) selected = null;
    }

    function onseek(timeS: number, event: TimelineEvent) {
        if (event.kind !== "death") {
            time = Math.min(Math.max(timeS, 0), duration);
            selected = null;
            return;
        }
        if (deathMode && stepIndex(steps, event) < 0) {
            scopeChoice = "all";
            rangeTouched = false;
        }
        onselect(event);
    }

    function onselect(event: DeathEvent | null) {
        selected = event;
        if (!event) return;
        time = Math.min(Math.max(event.timeS, 0), duration);
        if (deathMode) playing = false;
    }

    function onscrub(timeS: number) {
        time = timeS;
        if (deathMode) selected = null;
    }

    function setFrom(value: number) {
        rangeTouched = true;
        rangeTo = effectiveTo;
        rangeFrom = Math.min(value, effectiveTo);
    }

    function setTo(value: number) {
        rangeTouched = true;
        rangeFrom = effectiveFrom;
        rangeTo = Math.max(value, effectiveFrom);
    }
</script>

{#snippet keptRange()}
    <span
        class="kept"
        style:left="{markerPercent(effectiveFrom, duration)}%"
        style:right="{100 - markerPercent(effectiveTo, duration)}%"
        style:margin-left={effectiveFrom <= 0 ? "-8px" : undefined}
        style:margin-right={effectiveTo >= duration ? "-8px" : undefined}
    ></span>
{/snippet}

<Section class="replay flex flex-col gap-4" aria-labelledby="{uid}-heading">
    <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 id="{uid}-heading" class="flex items-center gap-2 text-sm font-medium">
            <MapIcon size={16} class="shrink-0 text-muted-foreground" aria-hidden="true" />
            {t("match_history.detail.replay.heading")}
        </h2>
        {#if decoded}
            <div class="flex flex-wrap items-center gap-2">
                {#if !deathMode}
                    <Button
                        size="sm"
                        variant="toggle"
                        aria-pressed={showCamps}
                        title={t("match_history.detail.replay.camps_hint")}
                        onclick={() => (showCamps = !showCamps)}
                    >
                        <Tent size={14} aria-hidden="true" />
                        {t("match_history.detail.replay.camps")}
                    </Button>
                {/if}
                <Button
                    size="sm"
                    variant="toggle"
                    aria-pressed={deathMode}
                    onclick={() => {
                        deathMode = !deathMode;
                        selected = null;
                    }}
                >
                    <Skull size={14} aria-hidden="true" />
                    {t("match_history.detail.replay.death_map")}
                </Button>
            </div>
        {/if}
    </div>

    {#if decoded}
        {#if deathMode}
            <div class="flex flex-wrap items-end gap-x-4 gap-y-2 text-sm">
                <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t("match_history.detail.replay.filter_player")}
                    <SelectMenu
                        items={scopeItems}
                        class="w-52"
                        aria-label={t("match_history.detail.replay.death_map_player")}
                        bind:value={
                            () => String(scope),
                            (value) => {
                                scopeChoice = parseDeathScope(value);
                                selected = null;
                            }
                        }
                    >
                        {#snippet leading(item)}
                            {#if item.kind === "player"}
                                <span class="flex" aria-hidden="true">
                                    <HeroIcon heroId={item.heroId} {heroes} size={24} />
                                </span>
                            {:else if item.kind === "mine"}
                                <UserRound aria-hidden="true" />
                            {:else}
                                <Users aria-hidden="true" />
                            {/if}
                        {/snippet}
                        {#snippet groupHeading(group)}
                            {@const team = groupTeam(scopeItems, group)}
                            <span class="flex items-center gap-1.5">
                                {#if team}
                                    <span class="flex" aria-hidden="true"><TeamMark {team} size={8} /></span>
                                {/if}
                                {group}
                            </span>
                        {/snippet}
                    </SelectMenu>
                </label>
                {#if typeof scope === "number"}
                    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                        {t("match_history.detail.replay.filter_role")}
                        <SelectMenu
                            items={roles}
                            class="w-36"
                            bind:value={
                                () => filterRole,
                                (value) => {
                                    filterRole = value === "killer" ? "killer" : "victim";
                                    selected = null;
                                }
                            }
                        >
                            {#snippet leading(item)}
                                {#if item.value === "killer"}
                                    <Crosshair aria-hidden="true" />
                                {:else}
                                    <Skull aria-hidden="true" />
                                {/if}
                            {/snippet}
                        </SelectMenu>
                    </label>
                {/if}
                <div class="flex min-w-72 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                    <div class="flex items-baseline justify-between gap-2 tabular-nums">
                        <span id="{uid}-from">
                            {t("match_history.detail.replay.range_from", { time: clock(effectiveFrom) })}
                        </span>
                        <span id="{uid}-to">
                            {t("match_history.detail.replay.range_to", { time: clock(effectiveTo) })}
                        </span>
                    </div>
                    <div class="grid h-9 grid-cols-2 items-center gap-3">
                        <Slider
                            class="kept-slider"
                            bind:value={() => effectiveFrom, setFrom}
                            min={0}
                            max={duration}
                            step={1}
                            formatValue={clock}
                            bubble={false}
                            aria-labelledby="{uid}-from"
                            track={keptRange}
                        />
                        <Slider
                            class="kept-slider"
                            bind:value={() => effectiveTo, setTo}
                            min={0}
                            max={duration}
                            step={1}
                            formatValue={clock}
                            bubble={false}
                            aria-labelledby="{uid}-to"
                            track={keptRange}
                        />
                    </div>
                </div>
            </div>
            <DeathStepper
                index={stepIndex(steps, step?.event ?? null)}
                count={steps.length}
                summary={step ? deathLines(step).join(" · ") : null}
                onstep={(delta) => onselect(stepTo(steps, step?.event ?? null, delta))}
                onclear={() => (selected = null)}
            />
        {/if}

        <ReplayMap
            {art}
            {artLoaded}
            {dots}
            {heroOf}
            {heroArt}
            {markerArt}
            {coneArt}
            {laneLines}
            {objects}
            {nameOf}
            {heroNameOf}
            {ownSlot}
            {deathMode}
            markers={steps}
            detailed={scope === "mine"}
            {scene}
            {deathLines}
            selected={step?.event ?? null}
            {onselect}
        />
    {:else}
        <p class="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground" role="status">
            {t("match_history.detail.replay.no_paths")}
        </p>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" class="min-w-24" aria-pressed={playing} onclick={togglePlay} disabled={duration <= 0}>
            {#if playing}
                <Pause class="fill-current" aria-hidden="true" />
                {t("match_history.detail.replay.pause")}
            {:else}
                <Play class="fill-current" aria-hidden="true" />
                {t("match_history.detail.replay.play")}
            {/if}
        </Button>
        <Segmented
            label={t("match_history.detail.replay.speed_aria")}
            icon={Gauge}
            options={speeds.options}
            value={String(speed)}
            onselect={(value) => (speed = speeds.parse(value))}
        />
        <span class="ml-auto text-sm tabular-nums text-muted-foreground">
            {t("match_history.detail.replay.time", { current: clock(time), total: clock(duration) })}
        </span>
    </div>

    {#if events.length === 0}
        <p class="text-sm text-muted-foreground" role="status">{t("match_history.detail.replay.no_events")}</p>
    {:else}
        <ReplayTimeline
            {events}
            {kinds}
            {duration}
            {time}
            {labelOf}
            {selected}
            onkinds={(next) => (kinds = next)}
            {onseek}
            {onscrub}
        />
    {/if}
</Section>

<style>
    /* Both sliders light the kept window instead of the span below their own thumb. */
    :global(.replay .kept-slider) {
        --slider-fill: transparent;
        --slider-thumb: var(--brass);
    }
    .kept {
        position: absolute;
        top: 50%;
        height: 4px;
        translate: 0 -50%;
        border-radius: 999px;
        background: linear-gradient(
            to right,
            color-mix(in oklch, var(--brass) 55%, transparent),
            var(--brass),
            color-mix(in oklch, var(--brass) 55%, transparent)
        );
    }
</style>
