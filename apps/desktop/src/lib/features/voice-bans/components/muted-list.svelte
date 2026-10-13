<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import type { Profile } from "../profiles";
    import MutedRow from "./muted-row.svelte";

    let {
        visible,
        profiles,
        selected,
        allSelected,
        filteredCount,
        totalCount,
        filter,
        disabled,
        ontoggleall,
        ontoggle,
        onopen,
        onunmute,
    }: {
        visible: string[];
        profiles: Record<string, Profile>;
        selected: Set<string>;
        allSelected: boolean;
        filteredCount: number;
        totalCount: number;
        filter: string;
        disabled: boolean;
        ontoggleall: (on: boolean) => void;
        ontoggle: (id: string, on: boolean) => void;
        onopen: (id: string) => void;
        onunmute: (id: string) => void;
    } = $props();
</script>

<div class="flex items-center gap-3 px-4 text-xs font-medium text-muted-foreground">
    <input
        type="checkbox"
        aria-label={t("voice_bans.list.select_page")}
        checked={allSelected}
        onchange={(e) => ontoggleall(e.currentTarget.checked)}
    />
    <span class="flex-1">{t("voice_bans.list.count", { filtered: filteredCount, total: totalCount })}</span>
</div>

<ul class="flex flex-col gap-1.5">
    {#each visible as id (id)}
        <MutedRow
            {id}
            profile={profiles[id]}
            selected={selected.has(id)}
            {disabled}
            ontoggle={(on) => ontoggle(id, on)}
            onopen={() => onopen(id)}
            onunmute={() => onunmute(id)}
        />
    {:else}
        <EmptyState as="li">
            {totalCount === 0 ? t("voice_bans.list.empty") : t("voice_bans.list.no_match", { filter })}
        </EmptyState>
    {/each}
</ul>
