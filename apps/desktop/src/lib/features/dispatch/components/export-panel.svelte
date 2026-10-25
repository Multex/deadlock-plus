<script lang="ts">
    import { toast } from "svelte-sonner";
    import type { Component } from "svelte";
    import { Columns3, Copy, Hash, ImageDown, Megaphone, Newspaper, Swords, Trophy, Users } from "@lucide/svelte";

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
    import type { CardAspect, EditionView } from "../edition-view";
    import { EXPORT_ASPECTS, exportPicks, exportTarget, type ExportPick } from "../export-plan";
    import EditionPaper from "./edition-paper.svelte";
    import SectionCard from "./section-card.svelte";

    let { view }: { view: EditionView } = $props();

    const PREVIEW_MAX_HEIGHT = 520;
    const ICONS: Record<ExportPick, Component> = {
        front_page: Newspaper,
        front: Megaphone,
        stories: Columns3,
        numbers: Hash,
        best_game: Trophy,
        heroes: Swords,
        people: Users,
    };
    const ASPECT_NAMES: Record<CardAspect, string> = { "9:16": "tall", "1:1": "square", "16:9": "wide" };

    let pick = $state<ExportPick>("front_page");
    let aspect = $state<CardAspect>("9:16");
    let busy = $state<ExportKind | null>(null);
    let node = $state<HTMLElement | null>(null);
    let previewW = $state(0);

    const picks = $derived(exportPicks(view));
    const chosen = $derived(picks.includes(pick) ? pick : "front_page");
    const target = $derived(exportTarget(view, chosen, aspect));
    const items = $derived(picks.map((value) => ({ value, label: pickLabel(value) })));
    const scale = $derived(previewW > 0 ? Math.min(1, previewW / target.width, PREVIEW_MAX_HEIGHT / target.height) : 0);

    function pickLabel(value: ExportPick): string {
        if (value === "front_page") return t("dispatch.export.front_page");
        if (value === "front") return t("dispatch.export.lead_story");
        return view.titles[value];
    }

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

    async function run(kind: ExportKind) {
        if (!node || busy) return;
        busy = kind;
        try {
            const source = node;
            const { width, height, fileName } = target;
            const label = t("match_history.detail.export.made_with");
            const paper = chosen === "front_page" ? source.firstElementChild : null;
            const result = await runExport(kind, fileName, {
                // A card draws its own footer inside its fixed frame; the front page gets the shared one below it.
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
                bind:value={() => chosen, (next) => (pick = next as ExportPick)}
                aria-label={t("dispatch.export.pick")}
                class="w-full"
            >
                {#snippet leading(item)}
                    {@const Icon = ICONS[item.value as ExportPick]}
                    <Icon aria-hidden="true" />
                {/snippet}
            </SelectMenu>

            <div
                role="radiogroup"
                aria-label={t("dispatch.export.aspect.group")}
                class="grid grid-cols-3 gap-2 {chosen === 'front_page' ? 'invisible' : ''}"
                inert={chosen === "front_page"}
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
                <div class="frame" style="width: {target.width * scale}px; height: {target.height * scale}px;">
                    <div class="sheet" style="transform: scale({scale});">
                        <div bind:this={node} style="width: {target.width}px; height: {target.height}px;">
                            {#if chosen === "front_page"}
                                <EditionPaper {view} />
                            {:else}
                                <SectionCard {view} section={chosen} {aspect} />
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
</style>
