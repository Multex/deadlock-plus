<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Clapperboard, Music, X } from "@lucide/svelte";

    import { failureText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import ProgressBar from "$lib/features/match-history/components/recovery/progress-bar.svelte";
    import type { CardAspect, EditionView } from "../edition-view";
    import { EXPORT_ASPECTS } from "../export-plan";
    import { DEFAULT_TRACKS, exportVideo, videoSupport, type VideoSupport } from "./export-video";
    import { MUSIC_TRACKS, type MusicTrackId } from "./music";
    import { isVideoKind } from "./scene";

    let { view }: { view: EditionView } = $props();

    const ASPECT_NAMES: Record<CardAspect, string> = { "9:16": "tall", "1:1": "square", "16:9": "wide" };

    /** `undefined` while the probe runs. */
    let support = $state<VideoSupport | undefined>(undefined);
    let aspect = $state<CardAspect>("9:16");
    let picked = $state<MusicTrackId | null>(null);
    let progress = $state<number | null>(null);
    let controller: AbortController | null = null;

    const kind = $derived(isVideoKind(view.kind) ? view.kind : null);
    const track = $derived(picked ?? (kind ? DEFAULT_TRACKS[kind] : "postgame"));
    const tracks = $derived(MUSIC_TRACKS.map((m) => ({ value: m.id, label: t(m.labelKey) })));
    const busy = $derived(progress !== null);

    onMount(() => {
        void videoSupport().then((found) => (support = found));
    });
    onDestroy(() => controller?.abort());

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

    async function save() {
        if (!kind || !support || busy) return;
        const own = new AbortController();
        controller = own;
        progress = 0;
        try {
            const result = await exportVideo({
                view,
                kind,
                aspect,
                track,
                audioCodec: support.audioCodec,
                signal: own.signal,
                onProgress: (done) => (progress = done),
            });
            if (result.status === "saved")
                toast.success(t(result.silent ? "dispatch.video.saved_silent" : "dispatch.video.saved"));
            else if (result.status === "failed")
                toast.error(failureText(result.error, t("dispatch.video.save_failed")));
        } finally {
            if (controller === own) controller = null;
            progress = null;
        }
    }
</script>

{#if kind}
    <Card as="section" aria-label={t("dispatch.video.group")} class="flex flex-col gap-3">
        <h3 class="text-sm font-semibold">{t("dispatch.video.group")}</h3>
        {#if support === null}
            <p class="text-sm text-muted-foreground">{t("dispatch.video.unsupported")}</p>
        {:else}
            <div class="flex max-w-[15rem] flex-col gap-3">
                <div
                    role="radiogroup"
                    aria-label={t("dispatch.video.aspect")}
                    class="grid grid-cols-3 gap-2"
                    inert={busy}
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
                            <span class="text-xs font-semibold"
                                >{t(`dispatch.export.aspect.${ASPECT_NAMES[option]}`)}</span
                            >
                            <span class="text-[11px] text-muted-foreground tabular-nums">{option}</span>
                        </Button>
                    {/each}
                </div>

                <SelectMenu
                    items={tracks}
                    bind:value={() => track, (next) => (picked = next as MusicTrackId)}
                    aria-label={t("dispatch.video.music_pick")}
                    disabled={busy}
                    class="w-full"
                >
                    {#snippet leading()}
                        <Music aria-hidden="true" />
                    {/snippet}
                </SelectMenu>

                {#if progress === null}
                    <Button variant="outline" class="justify-start" onclick={save} disabled={support === undefined}>
                        <Clapperboard />
                        {t("dispatch.video.save")}
                    </Button>
                {:else}
                    <div class="flex flex-col gap-2">
                        <ProgressBar
                            done={Math.round(progress * 100)}
                            total={100}
                            label={t("dispatch.video.progress")}
                        />
                        <Button variant="outline" class="justify-start" onclick={() => controller?.abort()}>
                            <X />
                            {t("dispatch.video.cancel")}
                        </Button>
                    </div>
                {/if}
            </div>
        {/if}
    </Card>
{/if}
