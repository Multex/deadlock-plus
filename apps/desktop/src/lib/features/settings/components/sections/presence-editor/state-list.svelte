<script lang="ts">
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { effectiveSlot, isCustomised, isEnabled, setField, type Scope } from "$lib/features/presence/config";
    import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
    import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
    import type { PresenceStateInfo } from "@deadlock-plus/ipc-types/PresenceStateInfo";
    import type { PresenceVariantId } from "@deadlock-plus/ipc-types/PresenceVariantId";
    import { scopeFor } from "./editor";
    import { STATE_ICONS, STATE_LABELS, VARIANT_LABELS } from "./labels";

    let {
        layout,
        config,
        defaults,
        heroId,
        stateId,
        variant,
        pick,
        edit,
    }: {
        layout: PresenceStateInfo[];
        config: PresenceConfig;
        defaults: PresenceConfig;
        heroId: number | undefined;
        stateId: PresenceStateId;
        variant: PresenceVariantId | undefined;
        pick: (state: PresenceStateId, variant?: PresenceVariantId) => void;
        edit: (next: PresenceConfig) => void;
    } = $props();
</script>

{#snippet row(scope: Scope, name: string, selected: boolean, nested: boolean)}
    {@const on = isEnabled(config, defaults, scope)}
    {@const line = effectiveSlot(config, defaults, scope).details ?? ""}
    <div
        class="flex items-center gap-1 rounded-md border bg-card transition-colors {selected
            ? 'border-brass border-l-4 bg-accent'
            : 'border-transparent hover:bg-accent/60'}"
    >
        <button
            type="button"
            aria-current={selected ? "true" : undefined}
            class="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 {nested
                ? 'pl-3'
                : 'pl-4'} {on ? '' : 'opacity-60'}"
            onclick={() => pick(scope.state, scope.variant)}
        >
            {#if !nested}
                {@const Icon = STATE_ICONS[scope.state]}
                <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                    <Icon class="size-4" />
                </span>
            {/if}
            <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-medium">{name}</span>
                <span class="truncate text-xs text-muted-foreground">
                    {line === "" ? t("settings.discord_editor.no_top_line") : line}
                </span>
            </span>
            {#if isCustomised(config, scope)}
                <span class="size-2 shrink-0 rounded-full bg-brass" aria-hidden="true"></span>
                <span class="sr-only">{t("settings.discord_editor.customised")}</span>
            {/if}
        </button>
        <div class="pr-2.5">
            <Switch
                checked={on}
                aria-label={t("settings.discord_editor.row_enabled", { name })}
                onCheckedChange={(v) => edit(setField(config, scope, { enabled: v }))}
            />
        </div>
    </div>
{/snippet}

<nav aria-label={t("settings.discord_editor.states")} class="flex flex-col gap-1">
    {#each layout as s (s.id)}
        {@const active = stateId === s.id}
        {@render row(scopeFor(s, undefined, heroId), STATE_LABELS[s.id](), active && !variant, false)}
        {#if active && s.variants.length > 0}
            <div class="ml-5 flex flex-col gap-1 border-l pl-2">
                {#each s.variants as v (v)}
                    {@render row(scopeFor(s, v, heroId), VARIANT_LABELS[v](), variant === v, true)}
                {/each}
            </div>
        {/if}
    {/each}
</nav>
