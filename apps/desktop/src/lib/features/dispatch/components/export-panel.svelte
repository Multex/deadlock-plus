<script lang="ts">
    import { toast } from "svelte-sonner";
    import { onMount, untrack, type Component } from "svelte";
    import {
        Award,
        BookOpen,
        Columns3,
        Copy,
        GalleryHorizontal,
        Hash,
        ImageDown,
        Megaphone,
        Newspaper,
        Star,
        Swords,
        TrendingUp,
        Trophy,
        Users,
    } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
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
    import { EXPORT_ASPECTS, exportFile, exportSections, type ExportModel } from "../export-plan";
    import { inlineSvgStyles } from "../front-export";
    import { collectorsAssets } from "../kinds/collectors/assets.svelte";
    import { collectorsView } from "../kinds/collectors/view";
    import { coverArt, type CoverArt } from "../kinds/monthly/art";
    import { magazineDeps } from "../kinds/monthly/deps";
    import { buildMagazine } from "../kinds/monthly/magazine";
    import { useYearEnd } from "../kinds/year_end/year-end-data.svelte";

    let { edition, view }: { edition: Edition; view: EditionView } = $props();

    const PREVIEW_MAX_HEIGHT = 520;
    const ICONS: Record<string, Component> = {
        front_page: Newspaper,
        front: Megaphone,
        stories: Columns3,
        numbers: Hash,
        best_game: Trophy,
        heroes: Swords,
        people: Users,
        cover_story: Swords,
        spread_1: BookOpen,
        spread_2: BookOpen,
        climb: TrendingUp,
        peak: Award,
        inside: BookOpen,
        poster: GalleryHorizontal,
        panel_numbers: Hash,
        panel_heroes: Swords,
        panel_highlights: Star,
    };
    const ASPECT_NAMES: Record<CardAspect, string> = { "9:16": "tall", "1:1": "square", "16:9": "wide" };

    // The dialog mounts this panel each time it opens, so the edition's kind holds for the panel's life, and each
    // kind loads only what its own pages are drawn from.
    const kind = untrack(() => edition.window.kind);
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

    let pick = $state("front_page");
    let aspect = $state<CardAspect>("9:16");
    let busy = $state<ExportKind | null>(null);
    let node = $state<HTMLElement | null>(null);
    let previewW = $state(0);

    const sections = $derived(exportSections(edition, view, { model, aspect, t }));
    const chosen = $derived(sections.find((s) => s.id === pick) ?? sections[0]);
    const items = $derived(sections.map((s) => ({ value: s.id, label: s.label })));
    const size = $derived(chosen.size);
    const offset = $derived(chosen.offset ?? { x: 0, y: 0 });
    const scale = $derived(previewW > 0 ? Math.min(1, previewW / size.width, PREVIEW_MAX_HEIGHT / size.height) : 0);

    function onAspectKeydown(e: KeyboardEvent) {
        const next = radioTarget(e.key, EXPORT_ASPECTS.indexOf(aspect), EXPORT_ASPECTS.length);
        if (next === null) return;
        e.preventDefault();
        aspect = EXPORT_ASPECTS[next];
        const radios =
            e.currentTarget instanceof HTMLElement
                ? (e.currentTarget.parentElement?.querySelectorAll("[role=radio]") ?? [])
                : [];
        (radios[next] as HTMLElement | undefined)?.focus();
    }

    function pageCopy(live: Element | null): HTMLElement | null {
        if (!(live instanceof HTMLElement)) return null;
        const copy = live.cloneNode(true) as HTMLElement;
        inlineSvgStyles(live, copy);
        return copy;
    }

    async function run(kind: ExportKind) {
        if (!node || busy) return;
        busy = kind;
        try {
            const source = node;
            const { width, height } = chosen.size;
            const card = chosen.card === true;
            const fileName = exportFile(view.id, chosen.id, card ? aspect : null);
            const label = t("match_history.detail.export.made_with");
            const paper = card ? null : pageCopy(source.firstElementChild);
            const result = await runExport(kind, fileName, {
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
                toast.error(exportFailureText(kind, result.error, "dispatch.export.render_failed"));
        } finally {
            busy = null;
        }
    }
</script>

<Card as="section" aria-label={t("dispatch.export.group")}>
    <div class="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div class="flex flex-col gap-3">
            <SelectMenu
                {items}
                bind:value={() => chosen.id, (next) => (pick = next)}
                aria-label={t("dispatch.export.pick")}
                class="w-full"
            >
                {#snippet leading(item)}
                    {@const Icon = ICONS[item.value] ?? Newspaper}
                    <Icon aria-hidden="true" />
                {/snippet}
            </SelectMenu>

            <div
                role="radiogroup"
                aria-label={t("dispatch.export.aspect.group")}
                class="grid grid-cols-3 gap-2 {chosen.card ? '' : 'invisible'}"
                inert={!chosen.card}
            >
                {#each EXPORT_ASPECTS as option (option)}
                    {@const selected = aspect === option}
                    <Button
                        variant="unstyled"
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabindex={selected ? 0 : -1}
                        onkeydown={onAspectKeydown}
                        onclick={() => (aspect = option)}
                        class="flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 {selected
                            ? 'border-brass bg-accent'
                            : ''}"
                    >
                        <span
                            class="block rounded-[2px] border-2 border-current opacity-70"
                            style="aspect-ratio: {option.replace(':', ' / ')}; height: 22px;"
                            aria-hidden="true"
                        ></span>
                        <span class="text-xs font-semibold">{t(`dispatch.export.aspect.${ASPECT_NAMES[option]}`)}</span>
                        <span class="text-[11px] text-muted-foreground tabular-nums">{option}</span>
                    </Button>
                {/each}
            </div>

            <div class="flex flex-col gap-2">
                <Button variant="outline" class="justify-start" onclick={() => run("save")} disabled={busy !== null}>
                    <ImageDown />
                    {busy === "save" ? t("match_history.detail.export.working") : t("match_history.detail.export.save")}
                </Button>
                <Button variant="outline" class="justify-start" onclick={() => run("copy")} disabled={busy !== null}>
                    <Copy />
                    {busy === "copy" ? t("match_history.detail.export.working") : t("match_history.detail.export.copy")}
                </Button>
            </div>
        </div>

        <div class="preview" bind:clientWidth={previewW}>
            {#if scale > 0}
                <div class="frame" style="width: {size.width * scale}px; height: {size.height * scale}px;">
                    <div class="sheet" style="transform: scale({scale});">
                        <div bind:this={node} style="width: {size.width}px; height: {size.height}px;">
                            {#if chosen.card}
                                <chosen.component {...chosen.props} />
                            {:else}
                                <!-- The image is drawn from this wrapper, not the sheet: the renderer paints its
                                     background over the root it is given and appends the footer inside it. -->
                                <div>
                                    <div class="shot" style="width: {size.width}px; height: {size.height}px;">
                                        <div
                                            class="at"
                                            style="left: {-offset.x}px; top: {-offset.y}px; width: {size.width +
                                                offset.x}px; height: {size.height + offset.y}px;"
                                        >
                                            <chosen.component {...chosen.props} />
                                            {#if chosen.facing}
                                                <chosen.facing.component {...chosen.facing.props} />
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</Card>

<style>
    .preview {
        display: flex;
        justify-content: center;
        min-width: 0;
    }

    .frame {
        flex: none;
        overflow: hidden;
        box-shadow: 0 8px 28px rgb(0 0 0 / 0.35);
    }

    .sheet {
        transform-origin: 0 0;
    }

    .shot {
        position: relative;
        overflow: hidden;
    }

    .at {
        position: absolute;
        display: flex;
    }
</style>
