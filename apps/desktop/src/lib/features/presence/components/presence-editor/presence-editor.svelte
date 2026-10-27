<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { CircleHelp, Copy, RotateCcw, Upload, Users } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";
    import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { errorText } from "$lib/core/errors";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { presencePreview } from "$lib/features/presence/api";
    import { showsDeadlockPlusLogo } from "$lib/features/presence/presence";
    import { loadRankTiers, rankNames as namesOf } from "$lib/features/ranks/ranks";
    import { keepGameArt } from "$lib/features/gamedata/art-refresh";
    import { isCustomised, resetScope, type Scope } from "$lib/features/presence/config";
    import { presenceConfigStore as store } from "$lib/features/presence/config.svelte";
    import type { PresenceCard } from "@deadlock-plus/ipc-types/PresenceCard";
    import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
    import type { PresenceVariantId } from "@deadlock-plus/ipc-types/PresenceVariantId";
    import CardPreview from "./card-preview.svelte";
    import SlotFields from "./slot-fields.svelte";
    import StateList from "./state-list.svelte";
    import { SAMPLE_RANK_TIER, heroOptions, previewSample, scopeFor } from "./editor";
    import { STATE_LABELS, VARIANT_LABELS } from "./labels";
    import { heroIdFromValue, heroItems, type SourceArt } from "./select-items";

    const PREVIEW_DELAY_MS = 250;

    let heroes = $state<Hero[]>([]);
    let rankNames = $state<Record<number, string>>({});
    let rankBadge = $state<string | null>(null);
    let stateId = $state<PresenceStateId>("playing");
    let variant = $state<PresenceVariantId | undefined>();
    let heroId = $state<number | undefined>();
    let importText = $state("");
    let importError = $state("");
    let confirmReset = $state(false);
    let card = $state<PresenceCard | null>(null);
    let previewFailed = $state(false);

    const info = $derived(store.layout.find((s) => s.id === stateId));
    const scope = $derived<Scope>(info ? scopeFor(info, variant, heroId) : { state: stateId, variant });
    const hero = $derived(heroes.find((h) => h.id === heroId));
    const scopeTitle = $derived(
        variant ? `${STATE_LABELS[stateId]()}: ${VARIANT_LABELS[variant]()}` : STATE_LABELS[stateId](),
    );
    const scopeCustom = $derived(isCustomised(store.config, scope));
    const heroChoices = $derived(heroItems(heroes, t("settings.discord_editor.all_heroes")));
    const sample = $derived(previewSample(heroes, heroId, t("settings.discord_editor.sample_hero"), rankNames));
    const art = $derived<SourceArt>({
        heroPortrait: sample.heroPortrait,
        heroIcon: sample.heroIcon,
        rankBadge,
    });

    onMount(() => {
        void store.load();
        void loadHeroes().then((all) => (heroes = heroOptions(all)));
        const stopArt = keepGameArt(() =>
            loadRankTiers().then((tiers) => {
                rankNames = namesOf(tiers);
                rankBadge = tiers.find((tier) => tier.tier === SAMPLE_RANK_TIER)?.image ?? null;
            }),
        );
        const stopHeroes = onHeroesRefreshed((all) => (heroes = heroOptions(all)));
        return () => {
            stopArt();
            stopHeroes();
        };
    });

    $effect(() => {
        if (store.status !== "ready") return;
        const config = store.config;
        const { state, variant: v, heroId: h } = scope;
        const shown = sample;
        let stale = false;
        const timer = setTimeout(() => {
            presencePreview(config, state, v ?? null, h ?? null, shown).then(
                (next) => {
                    if (stale) return;
                    card = next;
                    previewFailed = false;
                },
                () => {
                    if (!stale) previewFailed = true;
                },
            );
        }, PREVIEW_DELAY_MS);
        return () => {
            stale = true;
            clearTimeout(timer);
        };
    });

    function pick(state: PresenceStateId, next?: PresenceVariantId) {
        stateId = state;
        variant = next;
    }

    async function exportConfig() {
        try {
            await navigator.clipboard.writeText(await store.exportText());
            toast.success(t("settings.discord_editor.exported"));
        } catch {
            toast.error(t("settings.discord_editor.export_failed"));
        }
    }

    async function runImport(text: string) {
        importError = "";
        try {
            await store.importText(text);
            importText = "";
            toast.success(t("settings.discord_editor.imported"));
        } catch (e) {
            importError = errorText(e);
        }
    }

    async function onFile(e: Event & { currentTarget: HTMLInputElement }) {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = "";
        if (file) await runImport(await file.text());
    }
</script>

<div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
        <h3 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.discord_editor")}</h3>
        <p class="text-sm text-muted-foreground">{t("settings.discord_editor.description")}</p>
        {#if settings.presence.level !== "detailed"}
            <p class="text-sm text-warning">{t("settings.discord_editor.detailed_only")}</p>
        {/if}
    </div>

    {#if store.error}
        <p role="alert" class="rounded-md border border-destructive/50 p-2 text-sm text-destructive">
            {store.error}
        </p>
    {/if}

    {#if store.status === "error"}
        <RegionError
            name="presence-editor"
            title={t("settings.discord_editor.load_error")}
            body={t("region.error_body")}
            retryLabel={t("region.retry")}
            onretry={() => void store.load()}
        />
    {:else if store.status === "loading"}
        <p class="text-sm text-muted-foreground">{t("settings.discord_editor.loading")}</p>
    {:else}
        <div class="flex flex-col gap-1.5">
            <label for="pe-hero" class="text-sm font-medium">{t("settings.discord_editor.editing")}</label>
            <SelectMenu
                id="pe-hero"
                class="w-64 max-w-full"
                items={heroChoices}
                value={heroId === undefined ? "" : String(heroId)}
                onValueChange={(v) => (heroId = heroIdFromValue(v))}
            >
                {#snippet leading(item)}
                    {#if item.icon}
                        <img src={item.icon} alt="" />
                    {:else if item.all}
                        <Users aria-hidden="true" />
                    {:else}
                        <CircleHelp aria-hidden="true" />
                    {/if}
                {/snippet}
            </SelectMenu>
            <p class="text-xs text-muted-foreground">
                {hero
                    ? t("settings.discord_editor.editing_hero_hint", { hero: hero.name })
                    : t("settings.discord_editor.editing_default_hint")}
            </p>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-[18rem_1fr]">
            <StateList
                layout={store.layout}
                config={store.config}
                defaults={store.defaults}
                {heroId}
                {stateId}
                {variant}
                {pick}
                edit={(c) => store.edit(c)}
            />

            <div class="flex min-w-0 flex-col gap-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <h4 class="font-heading text-sm font-semibold">{scopeTitle}</h4>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!scopeCustom}
                        onclick={() => store.edit(resetScope(store.config, scope))}
                    >
                        <RotateCcw aria-hidden="true" />
                        {t("settings.discord_editor.reset_scope")}
                    </Button>
                </div>

                {#if heroId !== undefined && !info?.heroScope}
                    <p class="text-xs text-muted-foreground">{t("settings.discord_editor.no_hero_layer")}</p>
                {/if}

                <CardPreview
                    {card}
                    failed={previewFailed}
                    supportButton={settings.presence.supportButton}
                    deadlockPlusLogo={showsDeadlockPlusLogo(settings.presence)}
                />
                {#key `${scope.state}/${scope.variant}/${scope.heroId}`}
                    <SlotFields
                        {scope}
                        config={store.config}
                        defaults={store.defaults}
                        placeholders={store.placeholders}
                        {art}
                        edit={(c) => store.edit(c)}
                    />
                {/key}
            </div>
        </div>
    {/if}

    <div class="flex flex-col gap-2 border-t pt-4">
        <h4 class="font-heading text-sm font-semibold">{t("settings.discord_editor.share")}</h4>
        <p class="text-xs text-muted-foreground">{t("settings.discord_editor.share_description")}</p>
        <label for="pe-import" class="text-sm font-medium">{t("settings.discord_editor.import_label")}</label>
        <textarea
            id="pe-import"
            rows="4"
            bind:value={importText}
            spellcheck="false"
            class="w-full rounded-md border border-input bg-transparent p-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        ></textarea>
        {#if importError}
            <p role="alert" class="text-sm text-destructive">{importError}</p>
        {/if}
        <div class="flex flex-wrap gap-2">
            <Button size="sm" disabled={importText.trim() === ""} onclick={() => runImport(importText)}>
                <Upload aria-hidden="true" />
                {t("settings.discord_editor.import")}
            </Button>
            <Button variant="outline" size="sm" onclick={() => document.getElementById("pe-import-file")?.click()}>
                {t("settings.discord_editor.import_file")}
            </Button>
            <input
                id="pe-import-file"
                type="file"
                accept=".json,application/json"
                class="sr-only"
                tabindex="-1"
                aria-hidden="true"
                onchange={onFile}
            />
            <Button variant="outline" size="sm" onclick={exportConfig}>
                <Copy aria-hidden="true" />
                {t("settings.discord_editor.export")}
            </Button>
            <Button variant="outline" size="sm" onclick={() => (confirmReset = true)}>
                {t("settings.discord_editor.reset_all")}
            </Button>
        </div>
    </div>
</div>

<ConfirmDialog
    bind:open={confirmReset}
    destructive
    title={t("settings.discord_editor.reset_all_title")}
    description={t("settings.discord_editor.reset_all_description")}
    confirmLabel={t("settings.discord_editor.reset_all")}
    onconfirm={() => store.resetAll()}
/>
