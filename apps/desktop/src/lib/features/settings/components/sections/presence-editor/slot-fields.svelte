<script lang="ts">
    import { tick, type Component } from "svelte";
    import { Hourglass, Swords, Timer, TimerOff } from "@lucide/svelte";
    import SelectMenu from "$lib/ui/select-menu.svelte";
    import Switch from "$lib/ui/switch.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { effectiveSlot, getSlot, resetField, setField, type Scope } from "$lib/features/presence/config";
    import type { PresenceConfig } from "$lib/generated/types/PresenceConfig";
    import type { PresencePlaceholder } from "$lib/generated/types/PresencePlaceholder";
    import type { PresencePartialSlot } from "$lib/generated/types/PresencePartialSlot";
    import type { PresenceTimer } from "$lib/generated/types/PresenceTimer";
    import FieldFrame from "./field-frame.svelte";
    import ImageField from "./image-field.svelte";
    import TextField from "./text-field.svelte";
    import VariablesMenu from "./variables-menu.svelte";
    import { insertPlaceholder } from "./editor";
    import { TIMER_LABELS } from "./labels";
    import { timerItems, type SourceArt } from "./select-items";

    let {
        scope,
        config,
        defaults,
        placeholders,
        art,
        edit,
    }: {
        scope: Scope;
        config: PresenceConfig;
        defaults: PresenceConfig;
        placeholders: PresencePlaceholder[];
        art: SourceArt;
        edit: (next: PresenceConfig) => void;
    } = $props();

    const TIMER_ICONS: Record<PresenceTimer, Component> = {
        none: TimerOff,
        elapsedInState: Timer,
        matchTime: Swords,
        queueTime: Hourglass,
    };
    const timers = $derived(timerItems((timer) => TIMER_LABELS[timer]()));

    const own = $derived(getSlot(config, scope));
    const shown = $derived(effectiveSlot(config, defaults, scope));
    const idBase = $derived(`pe-${scope.state}-${scope.variant ?? "base"}-${scope.heroId ?? "all"}`);

    const set = (patch: PresencePartialSlot) => edit(setField(config, scope, patch));
    const reset = (field: keyof PresencePartialSlot) => edit(resetField(config, scope, field));

    type TextKey = "details" | "state" | "largeText" | "smallText";
    const TEXT_IDS: Record<TextKey, string> = {
        details: "details",
        state: "state",
        largeText: "large-text",
        smallText: "small-text",
    };
    const TEXT_LABELS: Record<TextKey, () => string> = {
        details: () => t("settings.discord_editor.field_details"),
        state: () => t("settings.discord_editor.field_state"),
        largeText: () => t("settings.discord_editor.field_large_text"),
        smallText: () => t("settings.discord_editor.field_small_text"),
    };
    let activeField = $state<TextKey>("details");

    async function insertVariable(name: string) {
        const key = activeField;
        const input = document.getElementById(`${idBase}-${TEXT_IDS[key]}`) as HTMLInputElement | null;
        if (!input) return;
        const next = insertPlaceholder(shown[key] ?? "", input.selectionStart, input.selectionEnd, name);
        set({ [key]: next.text });
        await tick();
        input.focus();
        input.setSelectionRange(next.caret, next.caret);
    }
</script>

<div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted-foreground">{t("settings.discord_editor.variables_hint")}</p>
        <VariablesMenu {placeholders} target={TEXT_LABELS[activeField]()} insert={insertVariable} />
    </div>

    <TextField
        id={`${idBase}-details`}
        label={t("settings.discord_editor.field_details")}
        value={shown.details ?? ""}
        custom={own.details !== undefined}
        onchange={(v) => set({ details: v })}
        onfocus={() => (activeField = "details")}
        onreset={() => reset("details")}
    />
    <TextField
        id={`${idBase}-state`}
        label={t("settings.discord_editor.field_state")}
        value={shown.state ?? ""}
        custom={own.state !== undefined}
        onchange={(v) => set({ state: v })}
        onfocus={() => (activeField = "state")}
        onreset={() => reset("state")}
    />

    <ImageField
        id={`${idBase}-large-image`}
        label={t("settings.discord_editor.field_large_image")}
        value={shown.largeImage ?? {}}
        custom={own.largeImage !== undefined}
        {art}
        onchange={(patch) => set({ largeImage: patch })}
        onreset={() => reset("largeImage")}
    />
    <TextField
        id={`${idBase}-large-text`}
        label={t("settings.discord_editor.field_large_text")}
        value={shown.largeText ?? ""}
        custom={own.largeText !== undefined}
        onchange={(v) => set({ largeText: v })}
        onfocus={() => (activeField = "largeText")}
        onreset={() => reset("largeText")}
    />

    <ImageField
        id={`${idBase}-small-image`}
        label={t("settings.discord_editor.field_small_image")}
        value={shown.smallImage ?? {}}
        custom={own.smallImage !== undefined}
        {art}
        onchange={(patch) => set({ smallImage: patch })}
        onreset={() => reset("smallImage")}
    />
    <TextField
        id={`${idBase}-small-text`}
        label={t("settings.discord_editor.field_small_text")}
        value={shown.smallText ?? ""}
        custom={own.smallText !== undefined}
        onchange={(v) => set({ smallText: v })}
        onfocus={() => (activeField = "smallText")}
        onreset={() => reset("smallText")}
    />

    <FieldFrame
        id={`${idBase}-party-size`}
        label={t("settings.discord_editor.field_party_size")}
        custom={own.partySize !== undefined}
        onreset={() => reset("partySize")}
    >
        <div class="flex items-center gap-3">
            <Switch
                id={`${idBase}-party-size`}
                checked={shown.partySize ?? true}
                onCheckedChange={(v) => set({ partySize: v })}
            />
            <span class="text-xs text-muted-foreground">{t("settings.discord_editor.party_size_hint")}</span>
        </div>
    </FieldFrame>

    <FieldFrame
        id={`${idBase}-timer`}
        label={t("settings.discord_editor.field_timer")}
        custom={own.timer !== undefined}
        onreset={() => reset("timer")}
    >
        <SelectMenu
            id={`${idBase}-timer`}
            class="w-52 max-w-full"
            items={timers}
            value={shown.timer ?? "none"}
            onValueChange={(v) => set({ timer: v as PresenceTimer })}
        >
            {#snippet leading(item)}
                {@const Icon = TIMER_ICONS[item.timer]}
                <Icon aria-hidden="true" />
            {/snippet}
        </SelectMenu>
    </FieldFrame>
</div>
