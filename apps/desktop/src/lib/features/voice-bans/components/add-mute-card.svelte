<script lang="ts">
    import { ExternalLink, Plus } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import { parseSteamId } from "$lib/core/player-links";
    import type { Profile } from "../profiles";

    let {
        value = $bindable(),
        results,
        mutedSet,
        busy,
        locked,
        searching,
        onsubmit,
        onmute,
        onopen,
    }: {
        value: string;
        results: Profile[] | null;
        mutedSet: Set<string>;
        busy: boolean;
        locked: boolean;
        searching: boolean;
        onsubmit: () => void;
        onmute: (id: string) => void;
        onopen: (id: string) => void;
    } = $props();
</script>

<Card radius="md" padding="sm" class="flex flex-col gap-2">
    <div class="flex gap-2">
        <Input
            bind:value
            placeholder={t("voice_bans.add.placeholder")}
            aria-label={t("voice_bans.add.aria")}
            onkeydown={(e) => e.key === "Enter" && onsubmit()}
        />
        <Button onclick={onsubmit} disabled={busy || locked || searching || !value.trim()}>
            <Plus />
            {parseSteamId(value) ? t("voice_bans.add.mute") : t("voice_bans.add.search")}
        </Button>
    </div>
    {#if results}
        {#if results.length === 0}
            <p class="text-sm text-muted-foreground">{t("voice_bans.add.none_found")}</p>
        {:else}
            <ul class="flex flex-col gap-1">
                {#each results as p (p.steamid64)}
                    <li class="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/40">
                        {#if p.avatar}<img src={p.avatar} alt="" class="size-8 rounded-sm" />{/if}
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{p.name}</p>
                            <p class="text-xs text-muted-foreground">{p.steamid64}</p>
                        </div>
                        <IconButton
                            size="sm"
                            label={t("voice_bans.row.open_aria")}
                            title={t("voice_bans.row.open_title")}
                            onclick={() => onopen(p.steamid64)}
                        >
                            <ExternalLink />
                        </IconButton>
                        {#if mutedSet.has(p.steamid64)}
                            <Badge variant="secondary">{t("voice_bans.add.muted")}</Badge>
                        {:else}
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || locked}
                                aria-label={t("voice_bans.add.mute_named", { name: p.name })}
                                onclick={() => onmute(p.steamid64)}>{t("voice_bans.add.mute")}</Button
                            >
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    {/if}
</Card>
