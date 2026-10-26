<script lang="ts">
    import { toast } from "svelte-sonner";
    import { onMount, untrack } from "svelte";
    import { Check, ClipboardCopy, Download, Film, Image, Music, X } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { runExport, type ExportKind } from "@deadlock-plus/match/export";
    import {
        copyImage,
        documentHasFocus,
        exportFailureText,
        renderNodeToPng,
        saveImage,
        waitForWindowFocus,
    } from "$lib/features/match-history/export-dom";
    import type { Edition } from "@deadlock-plus/stats/dispatch/types";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
    import { loadApiRanks } from "$lib/features/ranks/ranks";
    import type { CardAspect, EditionView } from "../edition-view";
    import { exportSections, type ExportModel } from "../export-plan";
    import { inlineSvgStyles } from "../front-export";
    import { collectorsAssets } from "../kinds/collectors/assets.svelte";
    import { collectorsView } from "../kinds/collectors/view";
    import { coverArt, type CoverArt } from "../kinds/monthly/art";
    import { magazineDeps } from "../kinds/monthly/deps";
    import { buildMagazine } from "../kinds/monthly/magazine";
    import { useYearEnd } from "../kinds/year_end/year-end-data.svelte";
    import { DEFAULT_TRACKS } from "../video/export-video";
    import { MUSIC_TRACKS, type MusicTrackId } from "../video/music";
    import { PREVIEW_START, STORYBOARD, type PreviewState } from "../video/preview";
    import { isVideoKind } from "../video/scene";
    import { VIDEO_SECONDS } from "../video/timeline";
    import VideoPanel from "../video/video-panel.svelte";
    import { contactSheet } from "./contact-sheet";
    import PageShot from "./page-shot.svelte";
    import ShapeGlyph from "./shape-glyph.svelte";
    import ShareStage from "./share-stage.svelte";
    import {
        SHAPES,
        chosenSection,
        destinationKey,
        mediaBox,
        nextRadio,
        shapeKey,
        shareFileName,
        stageFor,
        type ShareFormat,
        type VideoStatus,
    } from "./share-sheet";
    import VideoFrame from "./video-frame.svelte";

    let { edition, view }: { edition: Edition; view: EditionView } = $props();

    /** Room under each contact sheet tile for its caption: three lines and the gap above them. */
    const CAPTION = 45;
    const SHEET_GAP = 12;
    /** Room under each storyboard still for its time. */
    const STILL_CAPTION = 20;
    /** The stage keeps this much air around the frame. */
    const STAGE_PAD = 48;

    // The dialog mounts this panel each time it opens, so the edition's kind holds for the panel's life, and each
    // kind loads only what its own pages are drawn from.
    const kind = untrack(() => edition.window.kind);
    const videoKind = isVideoKind(kind) ? kind : null;
    const collectors = kind === "collectors" ? collectorsAssets() : null;
    const yearEnd =
        kind === "year_end"
            ? useYearEnd(
                  () => edition,
                  () => view,
              )
            : null;
    let heroes = $state.raw<Record<number, Hero> | null>(null);
    let ranks = $state.raw<RankTier[]>([]);
    let art = $state.raw<CoverArt>({ card: null, backdrop: null });
    const mag = $derived(
        kind === "monthly" && heroes ? buildMagazine(edition, view, magazineDeps(heroes, ranks)) : null,
    );
    const coverHeroId = $derived(mag?.coverHero?.heroId ?? null);

    onMount(() => {
        if (kind !== "monthly") return;
        void Promise.all([loadHeroes(), loadApiRanks()]).then(([h, r]) => {
            ranks = r;
            heroes = h;
        });
    });

    $effect(() => {
        const id = coverHeroId;
        let live = true;
        if (id !== null) void coverArt(id).then((a) => live && (art = a));
        return () => (live = false);
    });

    const model = $derived.by((): ExportModel | null => {
        if (kind === "monthly") return mag ? { kind, mag, art } : null;
        if (kind === "collectors")
            return collectors?.ready ? { kind, v: collectorsView(edition, collectors.deps) } : null;
        if (kind === "year_end") return yearEnd ? { kind, poster: yearEnd.view.poster } : null;
        return { kind: "weekly" };
    });

    let format = $state<ShareFormat>("picture");
    let pick = $state("front_page");
    let cardAspect = $state<CardAspect>("9:16");
    let videoAspect = $state<CardAspect>("9:16");
    let track = $state<MusicTrackId>(videoKind ? DEFAULT_TRACKS[videoKind] : "postgame");
    let video = $state<VideoStatus>({ state: "idle" });
    let busy = $state<ExportKind | null>(null);
    let done = $state<ExportKind | null>(null);
    let node = $state<HTMLElement | null>(null);
    let sheetW = $state(0);
    let sheetH = $state(0);
    let stageW = $state(0);
    let stageH = $state(0);
    let time = $state(0);
    let scene = $state(PREVIEW_START);
    let boardW = $state(0);
    let boardH = $state(0);
    let duration = $state(0);

    const sections = $derived(exportSections(edition, view, { model, aspect: cardAspect, t }));
    const chosen = $derived(chosenSection(sections, pick));
    const isVideo = $derived(format === "video" && videoKind !== null);
    const encoding = $derived(video.state === "encoding");
    const stage = $derived(stageFor(isVideo ? "video" : "picture", chosen, cardAspect, videoAspect));
    const media = $derived(mediaBox({ w: stageW - STAGE_PAD * 2, h: stageH - STAGE_PAD }, stage.ratio, stage.frame));
    const fileName = $derived(
        shareFileName({ viewId: view.id, format, videoKind, section: chosen, cardAspect, videoAspect }),
    );
    const rows = $derived(
        contactSheet(
            sections.map((s) => ({ id: s.id, r: s.size.width / s.size.height })),
            sheetW,
            sheetH,
            SHEET_GAP,
            CAPTION,
        ),
    );
    const stills = $derived(
        contactSheet(
            STORYBOARD.map((at) => ({ id: String(at), r: stage.ratio })),
            boardW,
            boardH,
            SHEET_GAP,
            STILL_CAPTION,
            120,
        ),
    );
    const byId = $derived(new Map(sections.map((s) => [s.id, s])));
    const preview = $derived<PreviewState>(
        video.state === "encoding" ? { state: "encoding", progress: video.progress } : { state: video.state },
    );
    const shapes = SHAPES.map((s) => s.aspect);
    const tracks = MUSIC_TRACKS.map((m) => m.id);
    const formats: ShareFormat[] = ["picture", "video"];

    function clock(seconds: number): string {
        const s = Math.max(0, Math.floor(seconds));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    /** Arrow keys move the pick inside a radio group and take the focus with it, like the app's other radio groups. */
    function radioKeys<T>(values: readonly T[], current: T, set: (next: T) => void) {
        return (e: KeyboardEvent) => {
            const next = nextRadio(e.key, values, current);
            if (next === null) return;
            e.preventDefault();
            set(next);
            const group = e.currentTarget instanceof HTMLElement ? e.currentTarget.closest("[role=radiogroup]") : null;
            group?.querySelectorAll<HTMLElement>("[role=radio]")[values.indexOf(next)]?.focus();
        };
    }

    function pageCopy(live: Element | null): HTMLElement | null {
        if (!(live instanceof HTMLElement)) return null;
        const copy = live.cloneNode(true) as HTMLElement;
        inlineSvgStyles(live, copy);
        return copy;
    }

    let doneTimer = 0;
    async function run(action: ExportKind) {
        if (!node || busy) return;
        busy = action;
        clearTimeout(doneTimer);
        done = null;
        try {
            const source = node;
            const { width, height } = chosen.size;
            const card = chosen.card === true;
            const label = t("match_history.detail.export.made_with");
            const paper = card ? null : pageCopy(source.firstElementChild);
            const result = await runExport(action, fileName, {
                // A card draws its own footer inside its fixed frame; a page gets the shared one below it.
                render: () =>
                    paper instanceof HTMLElement
                        ? renderNodeToPng(paper, label, width)
                        : renderNodeToPng(source, label, width, { footer: false, height }),
                save: saveImage,
                copy: copyImage,
                hasFocus: documentHasFocus,
                waitForFocus: waitForWindowFocus,
            });
            if (result.status === "saved") toast.success(t("dispatch.export.saved"));
            else if (result.status === "copied") toast.success(t("dispatch.export.copied"));
            else if (result.status === "failed")
                toast.error(exportFailureText(action, result.error, "dispatch.export.render_failed"));
            if (result.status === "saved" || result.status === "copied") {
                done = action;
                doneTimer = window.setTimeout(() => (done = null), 1800);
            }
        } finally {
            busy = null;
        }
    }
</script>

<div class="share">
    <header class="head">
        <div class="min-w-0">
            <p class="kicker">{t("dispatch.share.kicker")}</p>
            <Dialog.Title class="title">{view.label}</Dialog.Title>
        </div>
        <Dialog.Close>
            {#snippet child({ props })}
                <IconButton {...props} label={t("dispatch.share.close")} variant="outline" class="size-9">
                    <X aria-hidden="true" />
                </IconButton>
            {/snippet}
        </Dialog.Close>
    </header>

    <div class="body">
        <div class="rail" inert={encoding}>
            {#if videoKind}
                <div class="formats" role="radiogroup" aria-label={t("dispatch.share.format")}>
                    {#each formats as option (option)}
                        {@const on = format === option}
                        <Button
                            variant="unstyled"
                            role="radio"
                            aria-checked={on}
                            tabindex={on ? 0 : -1}
                            class="fmt {on ? 'on' : ''}"
                            onclick={() => (format = option)}
                            onkeydown={radioKeys(formats, format, (next) => (format = next))}
                            data-format={option}
                        >
                            <span class="fmt-art">
                                {#if option === "picture"}
                                    {#if sections[0]}<PageShot section={sections[0]} w={92} h={66} />{/if}
                                {:else}
                                    <VideoFrame {view} kind={videoKind} {track} w={37} h={66} at={0.12} />
                                    <VideoFrame {view} kind={videoKind} {track} w={37} h={66} at={0.5} />
                                {/if}
                            </span>
                            <span class="fmt-name">
                                {#if option === "picture"}<Image aria-hidden="true" />{:else}<Film
                                        aria-hidden="true"
                                    />{/if}
                                {t(`dispatch.share.${option}`)}
                            </span>
                        </Button>
                    {/each}
                </div>
            {/if}

            {#if !isVideo}
                <p class="label" id="share-pages">{t("dispatch.share.pages")}</p>
                <div class="pages" bind:clientWidth={sheetW} bind:clientHeight={sheetH}>
                    <div class="contact" role="radiogroup" aria-labelledby="share-pages">
                        {#each rows as row, r (r)}
                            <div class="row" style="height: {row.h + CAPTION}px;">
                                {#each row.tiles as tile (tile.id)}
                                    {@const s = byId.get(tile.id)}
                                    {#if s}
                                        {@const on = chosen.id === s.id}
                                        <Button
                                            variant="unstyled"
                                            role="radio"
                                            aria-checked={on}
                                            aria-label={s.label}
                                            tabindex={on ? 0 : -1}
                                            class="tile {on ? 'on' : ''}"
                                            style="width: {tile.w}px;"
                                            onclick={() => (pick = s.id)}
                                            onkeydown={radioKeys(
                                                sections.map((x) => x.id),
                                                chosen.id,
                                                (next) => (pick = next),
                                            )}
                                            data-pick={s.id}
                                        >
                                            <span class="print" style="height: {row.h}px;">
                                                <PageShot section={s} w={tile.w} h={row.h} />
                                            </span>
                                            <span class="caption" aria-hidden="true">{s.label}</span>
                                        </Button>
                                    {/if}
                                {/each}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if isVideo || chosen.card}
                <p class="label" id="share-shape">{t("dispatch.share.made_for")}</p>
                <div class="shapes" role="radiogroup" aria-labelledby="share-shape">
                    {#each SHAPES as s (s.aspect)}
                        {@const current = isVideo ? videoAspect : cardAspect}
                        {@const on = current === s.aspect}
                        {@const set = (next: CardAspect) => (isVideo ? (videoAspect = next) : (cardAspect = next))}
                        <Button
                            variant="unstyled"
                            role="radio"
                            aria-checked={on}
                            tabindex={on ? 0 : -1}
                            class="shape {on ? 'on' : ''}"
                            onclick={() => set(s.aspect)}
                            onkeydown={radioKeys(shapes, current, set)}
                            data-shape={s.aspect}
                        >
                            <span class="shape-glyph"><ShapeGlyph aspect={s.aspect} size={22} /></span>
                            <span class="shape-where">{t(destinationKey(s.aspect))}</span>
                            <span class="shape-name tabular-nums">{t(shapeKey(s.aspect))} {s.aspect}</span>
                        </Button>
                    {/each}
                </div>
            {/if}

            {#if isVideo}
                <p class="label" id="share-music">{t("dispatch.video.music_pick")}</p>
                <div class="music" role="radiogroup" aria-labelledby="share-music">
                    {#each MUSIC_TRACKS as m (m.id)}
                        {@const on = track === m.id}
                        <Button
                            variant="unstyled"
                            role="radio"
                            aria-checked={on}
                            tabindex={on ? 0 : -1}
                            class="song {on ? 'on' : ''}"
                            onclick={() => (track = m.id)}
                            onkeydown={radioKeys(tracks, track, (next) => (track = next))}
                            data-track={m.id}
                        >
                            <Music aria-hidden="true" />
                            <span>{t(m.labelKey)}</span>
                        </Button>
                    {/each}
                </div>

                <p class="label" id="share-scenes">{t("dispatch.share.scenes")}</p>
                <div class="pages" bind:clientWidth={boardW} bind:clientHeight={boardH}>
                    <div class="contact" role="radiogroup" aria-labelledby="share-scenes">
                        {#each stills as row, r (r)}
                            <div class="row" style="height: {row.h + STILL_CAPTION}px;">
                                {#each row.tiles as tile (tile.id)}
                                    {@const at = Number(tile.id)}
                                    {@const on = scene === at}
                                    {@const stamp = clock(at * (duration || VIDEO_SECONDS))}
                                    <Button
                                        variant="unstyled"
                                        role="radio"
                                        aria-checked={on}
                                        aria-label={stamp}
                                        tabindex={on ? 0 : -1}
                                        class="tile {on ? 'on' : ''}"
                                        style="width: {tile.w}px;"
                                        onclick={() => (scene = at)}
                                        onkeydown={radioKeys(STORYBOARD, scene, (next) => (scene = next))}
                                        data-scene={at}
                                    >
                                        <span class="print" style="height: {row.h}px;">
                                            {#if videoKind}
                                                <VideoFrame {view} kind={videoKind} {track} w={tile.w} h={row.h} {at} />
                                            {/if}
                                        </span>
                                        <span class="caption tabular-nums" aria-hidden="true">{stamp}</span>
                                    </Button>
                                {/each}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <div class="main">
            <div
                class="stage"
                bind:clientWidth={stageW}
                bind:clientHeight={stageH}
                role="img"
                aria-label={isVideo ? t("dispatch.share.preview_video") : chosen.label}
                data-stage
            >
                {#if media.w > 0}
                    <ShareStage
                        frame={stage.frame}
                        {media}
                        played={duration > 0 ? time / duration : 0}
                        clock="{clock(time)} / {clock(duration || VIDEO_SECONDS)}"
                    >
                        {#if isVideo && videoKind}
                            <VideoFrame
                                {view}
                                kind={videoKind}
                                {track}
                                w={media.w}
                                h={media.h}
                                status={preview}
                                start={scene}
                                bind:time
                                bind:duration
                            />
                        {:else}
                            <PageShot section={chosen} w={media.w} h={media.h} bind:node />
                        {/if}
                    </ShareStage>
                {/if}
            </div>

            <div class="actions">
                {#if isVideo && videoKind}
                    <VideoPanel
                        {view}
                        kind={videoKind}
                        aspect={videoAspect}
                        {track}
                        {fileName}
                        seconds={duration || VIDEO_SECONDS}
                        bind:status={video}
                    />
                {:else}
                    <Button size="lg" class="big" onclick={() => run("copy")} disabled={busy !== null}>
                        {#if done === "copy"}<Check aria-hidden="true" />{:else}<ClipboardCopy
                                aria-hidden="true"
                            />{/if}
                        {busy === "copy"
                            ? t("match_history.detail.export.working")
                            : t("match_history.detail.export.copy")}
                    </Button>
                    <Button
                        size="lg"
                        variant="outline"
                        class="big"
                        onclick={() => run("save")}
                        disabled={busy !== null}
                    >
                        {#if done === "save"}<Check aria-hidden="true" />{:else}<Download aria-hidden="true" />{/if}
                        {busy === "save"
                            ? t("match_history.detail.export.working")
                            : t("match_history.detail.export.save")}
                    </Button>
                    <p class="file">{fileName}</p>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .share {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100%;
        min-height: 0;
    }

    .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 18px 14px 24px;
        /* A paper's masthead rules: a heavy line over a hairline. */
        border-bottom: 3px solid color-mix(in oklch, var(--foreground) 75%, transparent);
        box-shadow:
            0 3px 0 -1px var(--card),
            0 4px 0 -1px color-mix(in oklch, var(--foreground) 45%, transparent);
    }

    .kicker {
        font:
            700 11px/1 "Valve Pulp",
            sans-serif;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--primary);
    }

    .head :global(.title) {
        margin-top: 5px;
        overflow: hidden;
        font:
            400 24px/1.15 "Retail Demo",
            sans-serif;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .body {
        display: grid;
        grid-template-columns: 360px minmax(0, 1fr);
        min-height: 0;
        margin-top: 4px;
    }

    .rail {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
        padding: 18px 16px 16px 20px;
        overflow-y: auto;
        border-right: 1px solid var(--border);
    }

    .label {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 8px 0 4px;
        font:
            700 11px/1 "Valve Pulp",
            sans-serif;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted-foreground);
    }

    .label::after {
        content: "";
        flex: 1;
        height: 1px;
        background: var(--border);
    }

    .formats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }

    .rail :global(.fmt) {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 8px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--card);
        transition: border-color 120ms;
    }

    .rail :global(.fmt:hover) {
        border-color: color-mix(in oklch, var(--primary) 50%, var(--border));
    }

    .rail :global(.fmt.on) {
        border-color: var(--primary);
        box-shadow: inset 0 0 0 1px var(--primary);
    }

    .fmt-art {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 74px;
        border-radius: 6px;
        background: color-mix(in oklch, var(--muted) 70%, transparent);
    }

    .fmt-name {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 700;
    }

    .fmt-name :global(svg) {
        width: 16px;
    }

    .pages {
        flex: 1;
        min-height: 160px;
    }

    .contact {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .row {
        display: flex;
        gap: 12px;
    }

    .rail :global(.tile) {
        position: relative;
        display: flex;
        flex: none;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        border-radius: 4px;
    }

    .print {
        position: relative;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        width: 100%;
        box-shadow:
            0 1px 2px rgb(0 0 0 / 0.35),
            0 8px 18px -8px rgb(0 0 0 / 0.5);
        transition:
            transform 120ms,
            box-shadow 120ms;
    }

    .rail :global(.tile:hover .print) {
        transform: translateY(-2px);
    }

    /* The picked print gets a proof's crop marks at its corners. */
    .print::before,
    .print::after {
        content: "";
        position: absolute;
        inset: -6px;
        pointer-events: none;
        opacity: 0;
        background:
            linear-gradient(var(--primary), var(--primary)) left top / 12px 2px,
            linear-gradient(var(--primary), var(--primary)) left top / 2px 12px,
            linear-gradient(var(--primary), var(--primary)) right top / 12px 2px,
            linear-gradient(var(--primary), var(--primary)) right top / 2px 12px,
            linear-gradient(var(--primary), var(--primary)) left bottom / 12px 2px,
            linear-gradient(var(--primary), var(--primary)) left bottom / 2px 12px,
            linear-gradient(var(--primary), var(--primary)) right bottom / 12px 2px,
            linear-gradient(var(--primary), var(--primary)) right bottom / 2px 12px;
        background-repeat: no-repeat;
        transition: opacity 120ms;
    }

    .print::after {
        inset: -2px;
        background: none;
        border: 2px solid var(--primary);
        border-radius: 2px;
    }

    .rail :global(.tile.on .print::before),
    .rail :global(.tile.on .print::after) {
        opacity: 1;
    }

    .caption {
        display: -webkit-box;
        width: 100%;
        overflow: hidden;
        font-size: 12px;
        font-weight: 600;
        line-height: 13px;
        text-align: center;
        color: var(--muted-foreground);
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
    }

    .rail :global(.tile.on .caption) {
        color: var(--foreground);
    }

    .rail :global(.tile:focus-visible) {
        outline: none;
    }

    .rail :global(.tile:focus-visible .caption) {
        text-decoration: underline;
        text-decoration-color: var(--ring);
        text-decoration-thickness: 2px;
        text-underline-offset: 3px;
    }

    .shapes {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
    }

    .rail :global(.shape),
    .rail :global(.song) {
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--card);
        transition: border-color 120ms;
    }

    .rail :global(.shape) {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 10px 6px 8px;
        text-align: center;
    }

    .rail :global(.shape:hover),
    .rail :global(.song:hover) {
        border-color: color-mix(in oklch, var(--primary) 50%, var(--border));
    }

    .rail :global(.shape.on),
    .rail :global(.song.on) {
        border-color: var(--primary);
        background: color-mix(in oklch, var(--primary) 12%, var(--card));
    }

    .shape-glyph {
        display: grid;
        place-items: center;
        height: 24px;
        color: var(--muted-foreground);
    }

    .rail :global(.shape.on .shape-glyph) {
        color: var(--primary);
    }

    .shape-where {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
    }

    .shape-name {
        font-size: 11px;
        color: var(--muted-foreground);
    }

    .music {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    .rail :global(.song) {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        padding: 6px 10px;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
    }

    .rail :global(.song svg) {
        flex: none;
        width: 15px;
        color: var(--muted-foreground);
    }

    .main {
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
        min-width: 0;
        min-height: 0;
    }

    .stage {
        display: grid;
        place-items: center;
        min-height: 0;
        overflow: hidden;
        /* Newsprint halftone under a soft light. */
        background:
            radial-gradient(ellipse at 50% 42%, color-mix(in oklch, var(--primary) 9%, transparent), transparent 70%),
            radial-gradient(circle, color-mix(in oklch, var(--foreground) 9%, transparent) 1px, transparent 1.4px) 0 0 /
                9px 9px,
            var(--background);
    }

    .actions {
        display: flex;
        align-items: center;
        gap: 14px;
        min-height: 88px;
        padding: 16px 24px;
        border-top: 1px solid var(--border);
        background: var(--card);
    }

    .actions :global(.big) {
        height: 52px;
        padding: 0 28px;
        font-size: 16px;
    }

    .actions :global(.big svg) {
        width: 20px;
        height: 20px;
    }

    .file {
        min-width: 0;
        margin-left: 6px;
        font-size: 12px;
        color: var(--muted-foreground);
        overflow-wrap: anywhere;
    }
</style>
