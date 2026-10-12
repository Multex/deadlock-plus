<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { MinimapArt } from "$lib/features/gamedata/gamedata";
    import { formatClock } from "$lib/features/live/live";
    import { activeDeath, deathEmphasis, type DeathStep, type SceneDot, type StepScene } from "../../death-steps";
    import type { LaneStroke } from "../../lane-lines";
    import { objectiveNameKey } from "../../deep-dive/objective-rows";
    import { takesTab, type MapObjectInfo } from "../../map-object-info";
    import { MAP_OBJECT_HIT_SCALE, hitZ, layerKey, layerScale, type MapObject } from "../../map-objects";
    import { playerDotStyle, skullDataUri, type PlayerDotStyle } from "../../player-dot";
    import type { DeathEvent, MapDot } from "../../replay";
    import ReplayObjectTip from "./replay-object-tip.svelte";

    interface Props {
        art: MinimapArt | null;
        artLoaded: boolean;
        dots: MapDot[];
        heroOf: (slot: number) => number | null;
        heroArt: Record<number, string>;
        markerArt: string | null;
        coneArt: string | null;
        laneLines: LaneStroke[];
        objects: MapObject[];
        nameOf: (slot: number) => string;
        heroNameOf: (slot: number) => string;
        ownSlot: number | null;
        deathMode: boolean;
        markers: DeathStep[];
        /** Own-deaths view: a skull dot on each death spot and the killer's head dot. */
        detailed: boolean;
        /** Every player at the moment of the selected death; replaces the all-deaths view. */
        scene: StepScene | null;
        deathLines: (step: DeathStep) => string[];
        selected: DeathEvent | null;
        onselect: (event: DeathEvent | null) => void;
    }

    let {
        art,
        artLoaded,
        dots,
        heroOf,
        heroArt,
        markerArt,
        coneArt,
        laneLines,
        objects,
        nameOf,
        heroNameOf,
        ownSlot,
        deathMode,
        markers,
        detailed,
        scene,
        deathLines,
        selected,
        onselect,
    }: Props = $props();

    let focusSlot = $state<number | null>(null);
    let hoverDeath = $state.raw<DeathEvent | null>(null);
    let focusDeath = $state.raw<DeathEvent | null>(null);
    let focusObject = $state<string | null>(null);

    const clock = (s: number) => formatClock(Math.round(s)) ?? "";
    const dotLabel = (slot: number) => `${nameOf(slot)} · ${heroNameOf(slot)}`;
    const shownDots = $derived<SceneDot[]>(scene?.dots ?? dots);
    const active = $derived(activeDeath(markers, hoverDeath, focusDeath));
    const tipMarker = $derived(active === null ? null : (markers.find((m) => m.event === active) ?? null));
    const ownTeam = $derived(ownSlot === null ? null : (dots.find((d) => d.slot === ownSlot)?.team ?? null));
    const skullSrc = skullDataUri();
    // Above every other dot, below the tooltip.
    const ROLE_Z = 20;
    const focusDot = $derived(focusSlot === null ? null : (shownDots.find((d) => d.slot === focusSlot) ?? null));
    const hoverObjects = $derived(deathMode ? [] : objects.filter((o) => o.info !== undefined));
    const tipObject = $derived(focusObject === null ? null : (hoverObjects.find((o) => o.key === focusObject) ?? null));
    const HIGHLIGHT_ICON_OPACITY = 0.45;

    // A removed element fires no pointerleave, so a hover would come back with the object on a scrub.
    $effect(() => {
        if (focusObject !== null && !tipObject) focusObject = null;
    });

    // The markers leave the map without a pointerleave or blur when a death is selected.
    $effect(() => {
        if (scene) {
            hoverDeath = null;
            focusDeath = null;
        }
    });

    function unhover(event: DeathEvent) {
        if (hoverDeath === event) hoverDeath = null;
    }

    function unfocus(event: DeathEvent) {
        if (focusDeath === event) focusDeath = null;
    }

    function objectTitle(info: MapObjectInfo): string {
        if (info.type === "objective") return t(objectiveNameKey(info.kind));
        if (info.type === "camp") return t(`match_history.detail.replay.camp_${info.tier}`);
        if (info.type === "shop") return t("match_history.detail.replay.shop");
        if (info.type === "teleporter") return t("match_history.detail.replay.teleporter");
        return t("match_history.detail.replay.kind_mid_boss");
    }

    function objectLabel(info: MapObjectInfo): string {
        const title = objectTitle(info);
        if (info.type !== "objective") return title;
        const team = t(
            info.team === "hidden-king" ? "match_history.team.hidden_king" : "match_history.team.archmother",
        );
        return `${title} · ${team}`;
    }

    const heroArtOf = (heroId: number | null) => (heroId === null ? null : (heroArt[heroId] ?? null));
    const markerDot = (team: MapDot["team"], alive: boolean, heroId: number | null) =>
        playerDotStyle({ team, alive, own: false, ownTeam, heroArt: heroArtOf(heroId), markerArt, coneArt });

    function anchor(left: number, top: number): string {
        const x = left < 22 ? "0%" : left > 78 ? "-100%" : "-50%";
        const y = top < 18 ? "14px" : "calc(-100% - 14px)";
        return `translate(${x}, ${y})`;
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.key === "Escape" && selected) onselect(null);
    }
</script>

<svelte:window {onkeydown} />

{#snippet dotLayers(style: PlayerDotStyle)}
    {#if style.cone}
        <span
            class="layer"
            style:background-color={style.cone.color}
            style:opacity={style.cone.opacity}
            style:scale={style.cone.scale}
            style:mask-image="url({style.cone.src})"
            style:mask-size="contain"
            style:mask-repeat="no-repeat"
            style:mask-position="center"
        ></span>
    {/if}
    <span
        class="layer rounded-full"
        style:background={style.discColor}
        style:opacity={style.discOpacity}
        style:scale={style.discScale}
        style:box-shadow="inset 0 0 0 {style.borderPx}px rgba(0, 0, 0, 0.55)"
    ></span>
    {#if style.marker}
        <img
            src={style.marker.src}
            alt=""
            draggable="false"
            class="layer"
            style:scale={style.marker.scale}
            style:clip-path={style.marker.clip}
        />
    {/if}
    {#if style.head}
        <img src={style.head.src} alt="" draggable="false" class="layer" style:scale={style.head.scale} />
    {/if}
    {#if style.skull}
        <img
            src={skullSrc}
            alt=""
            draggable="false"
            class="layer"
            style:scale="0.6"
            style:opacity={style.skull.opacity}
        />
    {/if}
{/snippet}

{#snippet deathLine(m: DeathStep, dimmed: boolean)}
    {@const killer = detailed ? m.killerSpot : m.killer}
    {#if killer}
        <line
            class="mark"
            class:dimmed
            x1={m.victim.left}
            y1={m.victim.top}
            x2={killer.left}
            y2={killer.top}
            stroke={m.event.victimTeam === "hidden-king" ? "var(--dd-hk)" : "var(--dd-am)"}
            stroke-width="1"
            stroke-opacity="0.8"
            stroke-dasharray="3 2"
            vector-effect="non-scaling-stroke"
        />
    {/if}
{/snippet}

<div
    class="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-lg border border-border bg-muted"
    role="group"
    aria-label={t("match_history.detail.replay.map_aria")}
>
    {#if art}
        <img src={art.src} alt="" draggable="false" class="absolute inset-0 size-full select-none object-fill" />
    {/if}

    {#if laneLines.length > 0}
        <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            class="pointer-events-none absolute inset-0 size-full"
            aria-hidden="true"
        >
            {#each laneLines as l (l.key)}
                <polyline
                    points={l.points}
                    fill="none"
                    stroke={l.color}
                    stroke-width="2"
                    stroke-opacity="0.85"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                    vector-effect="non-scaling-stroke"
                />
            {/each}
        </svg>
    {/if}

    {#if deathMode && !scene}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 size-full" aria-hidden="true">
            {#each markers as m, i (i)}
                {#if m.event !== active}
                    {@render deathLine(m, active !== null)}
                {/if}
            {/each}
        </svg>
        {#if tipMarker}
            <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                class="pointer-events-none absolute inset-0 size-full"
                style:z-index={ROLE_Z}
                aria-hidden="true"
            >
                {@render deathLine(tipMarker, false)}
            </svg>
        {/if}
        {#each markers as m, i (i)}
            {@const emphasis = deathEmphasis(m.event, active)}
            {@const label = t("match_history.detail.replay.death_marker", {
                victim: nameOf(m.event.victimSlot),
                time: clock(m.event.timeS),
            })}
            {#if detailed}
                {@const killerStyle = markerDot(m.killerTeam, true, m.killerHeroId)}
                {@const victimStyle = markerDot(m.event.victimTeam, false, null)}
                <span
                    class="mark absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                    class:raised={emphasis === "raised"}
                    class:dimmed={emphasis === "dimmed"}
                    style:left="{m.killerSpot.left}%"
                    style:top="{m.killerSpot.top}%"
                    style:width="{killerStyle.size * 100}%"
                    style:height="{killerStyle.size * 100}%"
                    aria-hidden="true"
                    onpointerenter={() => (hoverDeath = m.event)}
                    onpointerleave={() => unhover(m.event)}
                >
                    {@render dotLayers(killerStyle)}
                </span>
                <button
                    type="button"
                    class="mark absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    class:raised={emphasis === "raised"}
                    class:dimmed={emphasis === "dimmed"}
                    style:left="{m.victim.left}%"
                    style:top="{m.victim.top}%"
                    style:width="{victimStyle.size * 100}%"
                    style:height="{victimStyle.size * 100}%"
                    aria-label={label}
                    onpointerenter={() => (hoverDeath = m.event)}
                    onpointerleave={() => unhover(m.event)}
                    onfocus={() => (focusDeath = m.event)}
                    onblur={() => unfocus(m.event)}
                    onclick={() => onselect(m.event)}
                >
                    {@render dotLayers(victimStyle)}
                </button>
            {:else}
                {#if m.killer}
                    <span
                        class="mark absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/80"
                        class:raised={emphasis === "raised"}
                        class:dimmed={emphasis === "dimmed"}
                        style:left="{m.killer.left}%"
                        style:top="{m.killer.top}%"
                        aria-hidden="true"
                        onpointerenter={() => (hoverDeath = m.event)}
                        onpointerleave={() => unhover(m.event)}
                    ></span>
                {/if}
                <button
                    type="button"
                    class="death mark absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    class:hk={m.event.victimTeam === "hidden-king"}
                    class:am={m.event.victimTeam === "archmother"}
                    class:raised={emphasis === "raised"}
                    class:dimmed={emphasis === "dimmed"}
                    style:left="{m.victim.left}%"
                    style:top="{m.victim.top}%"
                    aria-label={label}
                    onpointerenter={() => (hoverDeath = m.event)}
                    onpointerleave={() => unhover(m.event)}
                    onfocus={() => (focusDeath = m.event)}
                    onblur={() => unfocus(m.event)}
                    onclick={() => onselect(m.event)}
                ></button>
            {/if}
        {/each}
        {#if tipMarker}
            {@const lines = deathLines(tipMarker)}
            <div
                class="pointer-events-none absolute z-30 w-max max-w-56 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
                style:left="{tipMarker.victim.left}%"
                style:top="{tipMarker.victim.top}%"
                style:transform={anchor(tipMarker.victim.left, tipMarker.victim.top)}
                role="status"
            >
                {#each lines as line, i (i)}
                    <div class={i === 0 ? "font-medium" : "text-muted-foreground tabular-nums"}>{line}</div>
                {/each}
            </div>
        {/if}
    {:else}
        {#if scene?.line}
            <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                class="pointer-events-none absolute inset-0 size-full"
                aria-hidden="true"
            >
                <line
                    x1={scene.line.from.left}
                    y1={scene.line.from.top}
                    x2={scene.line.to.left}
                    y2={scene.line.to.top}
                    stroke="var(--color-foreground)"
                    stroke-width="1.5"
                    stroke-opacity="0.8"
                    vector-effect="non-scaling-stroke"
                />
            </svg>
        {/if}
        {#each deathMode ? [] : objects as o (o.key)}
            <span
                class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style:left="{o.left}%"
                style:top="{o.top}%"
                style:width="{o.size * 100}%"
                style:height="{o.size * 100}%"
                style:z-index={o.z}
                style:opacity={o.highlight ? o.highlight.opacity : o.opacity}
                style:scale={layerScale(o)}
                aria-hidden="true"
            >
                {#if o.highlight}
                    <span class="layer rounded-full" style:box-shadow="inset 0 0 0 2px {o.highlight.color}"></span>
                {/if}
                {#each o.parts as part, i (layerKey(part, i))}
                    {#if part.tint}
                        <span
                            class="layer"
                            style:background-color={part.tint}
                            style:mask-image="url({part.src})"
                            style:mask-size="contain"
                            style:mask-repeat="no-repeat"
                            style:mask-position="center"
                            style:clip-path={part.clip}
                            style:opacity={o.highlight && !o.highlight.solid ? HIGHLIGHT_ICON_OPACITY : undefined}
                        ></span>
                    {:else}
                        <img
                            src={part.src}
                            alt=""
                            draggable="false"
                            class="layer"
                            style:opacity={o.highlight && !o.highlight.solid ? HIGHLIGHT_ICON_OPACITY : undefined}
                        />
                    {/if}
                {/each}
            </span>
        {/each}
        {#each hoverObjects as o (o.key)}
            <button
                type="button"
                class="absolute -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style:left="{o.left}%"
                style:top="{o.top}%"
                style:width="{o.size * MAP_OBJECT_HIT_SCALE * 100}%"
                style:height="{o.size * MAP_OBJECT_HIT_SCALE * 100}%"
                style:z-index={hitZ(o)}
                tabindex={o.info && !takesTab(o.info) ? -1 : undefined}
                aria-label={o.info ? objectLabel(o.info) : undefined}
                onpointerenter={() => (focusObject = o.key)}
                onpointerleave={() => (focusObject = null)}
                onfocus={() => (focusObject = o.key)}
                onblur={() => (focusObject = null)}
            ></button>
        {/each}
        {#each shownDots as d (d.slot)}
            {@const own = d.slot === ownSlot}
            {@const heroId = heroOf(d.slot)}
            {@const style = playerDotStyle({
                team: d.team,
                alive: d.alive,
                own,
                ownTeam,
                heroArt: heroId === null ? null : (heroArt[heroId] ?? null),
                markerArt,
                coneArt,
            })}
            <button
                type="button"
                class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                class:emphasis={d.role !== undefined}
                style:left="{d.left}%"
                style:top="{d.top}%"
                style:width="{style.size * 100}%"
                style:height="{style.size * 100}%"
                style:z-index={d.role ? ROLE_Z : style.zIndex}
                aria-pressed={d.role === "victim" ? true : undefined}
                aria-label={d.alive
                    ? dotLabel(d.slot)
                    : t("match_history.detail.replay.dot_dead", { label: dotLabel(d.slot) })}
                onpointerenter={() => (focusSlot = d.slot)}
                onpointerleave={() => (focusSlot = null)}
                onfocus={() => (focusSlot = d.slot)}
                onblur={() => (focusSlot = null)}
                onclick={d.role === "victim" ? () => onselect(null) : undefined}
            >
                {@render dotLayers(style)}
            </button>
        {/each}
        {#if focusDot}
            <div
                class="pointer-events-none absolute z-30 w-max max-w-48 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
                style:left="{focusDot.left}%"
                style:top="{focusDot.top}%"
                style:transform={anchor(focusDot.left, focusDot.top)}
                role="status"
            >
                <div class="font-medium">{nameOf(focusDot.slot)}</div>
                <div class="text-muted-foreground">
                    {heroNameOf(focusDot.slot)}{focusDot.alive ? "" : ` · ${t("match_history.detail.replay.dead")}`}
                </div>
            </div>
        {:else if tipObject?.info}
            <div
                class="pointer-events-none absolute z-30 w-max max-w-56 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
                style:left="{tipObject.left}%"
                style:top="{tipObject.top}%"
                style:transform={anchor(tipObject.left, tipObject.top)}
                role="status"
            >
                <ReplayObjectTip title={objectTitle(tipObject.info)} info={tipObject.info} />
            </div>
        {/if}
    {/if}

    {#if artLoaded && !art}
        <p class="pointer-events-none absolute inset-x-2 bottom-2 text-center text-xs text-muted-foreground">
            {t("match_history.detail.replay.no_art")}
        </p>
    {/if}
</div>

<style>
    .layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
    }
    .death {
        background: var(--color-muted-foreground);
    }
    .mark {
        transition: opacity 0.12s ease-out;
    }
    .death.mark {
        transition:
            transform 0.15s,
            opacity 0.12s ease-out;
    }
    span.mark {
        pointer-events: none;
    }
    .mark.dimmed {
        opacity: 0.3;
    }
    /* Level with the death-scene role dots: above every other marker, below the tooltip. */
    .mark.raised {
        z-index: 20;
    }
    span.mark.raised {
        pointer-events: auto;
    }
    .death.hk {
        background: var(--dd-hk);
    }
    .death.am {
        background: var(--dd-am);
    }
    .emphasis {
        outline: 2px solid var(--color-foreground);
        outline-offset: 1px;
    }
    @media (prefers-reduced-motion: reduce) {
        .mark,
        .death.mark {
            transition: none;
        }
    }
</style>
