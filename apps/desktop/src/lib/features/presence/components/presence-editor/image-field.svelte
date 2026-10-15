<script lang="ts">
    import type { Component } from "svelte";
    import { Gamepad2, Image, Link, Medal, SquareUser } from "@lucide/svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { PresencePartialImage } from "@deadlock-plus/ipc-types/PresencePartialImage";
    import FieldFrame from "./field-frame.svelte";
    import { sourceFromKind, sourceKind, sourceUrl, type SourceKind } from "./editor";
    import { SOURCE_LABELS } from "./labels";
    import { sourceItems, sourceThumb, type SourceArt } from "./select-items";

    let {
        id,
        label,
        value,
        custom,
        art,
        onchange,
        onreset,
    }: {
        id: string;
        label: string;
        value: PresencePartialImage;
        custom: boolean;
        art: SourceArt;
        onchange: (patch: PresencePartialImage) => void;
        onreset: () => void;
    } = $props();

    const SOURCE_ICONS: Record<SourceKind, Component> = {
        heroPortrait: Image,
        heroIcon: SquareUser,
        rankBadge: Medal,
        modeIcon: Gamepad2,
        customUrl: Link,
    };

    const kind = $derived(sourceKind(value.source) ?? "heroPortrait");
    const url = $derived(sourceUrl(value.source));
    const enabled = $derived(value.enabled ?? false);
    const items = $derived(sourceItems(kind, (k) => SOURCE_LABELS[k]()));
</script>

<FieldFrame {id} {label} {custom} {onreset}>
    <div class="flex flex-wrap items-center gap-3">
        <Switch
            id={`${id}-enabled`}
            checked={enabled}
            aria-label={t("settings.discord_editor.image_enabled", { image: label })}
            onCheckedChange={(v) => onchange({ enabled: v })}
        />
        <SelectMenu
            {id}
            {items}
            value={kind}
            disabled={!enabled}
            aria-label={t("settings.discord_editor.image_source", { image: label })}
            onValueChange={(v) => onchange({ source: sourceFromKind(v as SourceKind, url) })}
            class="w-48"
        >
            {#snippet leading(item)}
                {@const thumb = sourceThumb(item.kind, art)}
                {#if thumb}
                    <img src={thumb} alt="" class="object-top" />
                {:else}
                    {@const Icon = SOURCE_ICONS[item.kind]}
                    <Icon aria-hidden="true" />
                {/if}
            {/snippet}
        </SelectMenu>
    </div>
    {#if enabled && kind === "customUrl"}
        <Input
            value={url}
            type="url"
            placeholder="https://"
            aria-label={t("settings.discord_editor.image_url", { image: label })}
            oninput={(e) => onchange({ source: { customUrl: e.currentTarget.value } })}
        />
    {/if}
</FieldFrame>
