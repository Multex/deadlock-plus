<script lang="ts">
    import Button from "@deadlock-plus/ui/button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import Flag from "$lib/components/flag.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import { Pencil, Plus, Trash2 } from "@lucide/svelte";
    import type { ServerGroup } from "../types";
    import { resolveBlockedIds, type Preset, type PresetMode } from "../presets";

    type Props = {
        open: boolean;
        presets: Preset[];
        regions: ServerGroup[];
        currentlyBlockedRegionIds: string[];
        onApply: (preset: Preset) => void;
        onSave: (preset: Preset) => void;
        onDelete: (id: string) => void;
    };

    let {
        open = $bindable(),
        presets,
        regions,
        currentlyBlockedRegionIds,
        onApply,
        onSave,
        onDelete,
    }: Props = $props();

    const modes: { mode: PresetMode; title: string; note: string }[] = $derived([
        {
            mode: "allow",
            title: t("server_picker.presets.mode_allow_title"),
            note: t("server_picker.presets.mode_allow_note"),
        },
        {
            mode: "block",
            title: t("server_picker.presets.mode_block_title"),
            note: t("server_picker.presets.mode_block_note"),
        },
    ]);

    let editing = $state<Preset | null>(null);
    let filter = $state("");

    const regionIds = $derived(regions.map((r) => r.id));
    const visibleRegions = $derived(regions.filter((r) => r.description.toLowerCase().includes(filter.toLowerCase())));
    const willBlock = $derived(editing ? resolveBlockedIds(editing, regionIds).length : 0);
    const isExisting = $derived(editing != null && presets.some((p) => p.id === editing!.id));

    $effect(() => {
        if (!open) {
            editing = null;
            filter = "";
        }
    });

    function startNew(fromCurrent: boolean) {
        editing = {
            id: crypto.randomUUID(),
            name: "",
            mode: fromCurrent ? "block" : "allow",
            regionIds: fromCurrent ? [...currentlyBlockedRegionIds] : [],
        };
    }

    function toggleRegion(id: string, checked: boolean) {
        if (!editing) return;
        const next = new Set(editing.regionIds);
        if (checked) next.add(id);
        else next.delete(id);
        editing = { ...editing, regionIds: [...next] };
    }

    function summary(p: Preset): string {
        const listed = p.regionIds.filter((id) => regionIds.includes(id)).length;
        const blocked = resolveBlockedIds(p, regionIds).length;
        return p.mode === "allow"
            ? t("server_picker.presets.summary_allow", { listed, blocked, total: regionIds.length })
            : t("server_picker.presets.summary_block", { listed, blocked, total: regionIds.length });
    }

    function save() {
        if (!editing || !editing.name.trim()) return;
        onSave({ ...editing, name: editing.name.trim() });
        editing = null;
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content>
        {#if editing}
            <Dialog.Title
                >{isExisting
                    ? t("server_picker.presets.edit_title")
                    : t("server_picker.presets.new_title")}</Dialog.Title
            >
            <Dialog.Description>
                {t("server_picker.presets.edit_description")}
            </Dialog.Description>

            <Input
                bind:value={editing.name}
                placeholder={t("server_picker.presets.name_placeholder")}
                aria-label={t("server_picker.presets.name_aria")}
            />

            <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("server_picker.presets.mode_aria")}>
                {#each modes as option, at (option.mode)}
                    <Button
                        variant="unstyled"
                        role="radio"
                        aria-checked={editing.mode === option.mode}
                        tabindex={editing.mode === option.mode ? 0 : -1}
                        onclick={() => editing && (editing = { ...editing, mode: option.mode })}
                        onkeydown={(e) => {
                            const next = radioTarget(e.key, at, modes.length);
                            if (next === null || !editing) return;
                            e.preventDefault();
                            editing = { ...editing, mode: modes[next].mode };
                            (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
                        }}
                        class="rounded-md border px-3 py-2 text-left transition-colors {editing.mode === option.mode
                            ? 'border-primary bg-accent'
                            : 'border-border hover:bg-accent/50'}"
                    >
                        <span class="block text-sm font-medium">{option.title}</span>
                        <span class="block text-xs text-muted-foreground">{option.note}</span>
                    </Button>
                {/each}
            </div>

            <Input
                bind:value={filter}
                placeholder={t("server_picker.presets.filter_placeholder")}
                aria-label={t("server_picker.presets.filter_aria")}
            />

            <div class="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                {#each visibleRegions as region (region.id)}
                    <label class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50">
                        <input
                            type="checkbox"
                            class="size-4"
                            checked={editing.regionIds.includes(region.id)}
                            onchange={(e) => toggleRegion(region.id, e.currentTarget.checked)}
                        />
                        <Flag code={region.countryCode} />
                        <span>{region.description}</span>
                    </label>
                {/each}
            </div>

            <p class="text-xs text-muted-foreground">
                {t("server_picker.presets.will_block", {
                    blocked: willBlock,
                    total: regionIds.length,
                    open: regionIds.length - willBlock,
                })}
            </p>

            <div class="flex justify-end gap-2">
                <Button variant="outline" onclick={() => (editing = null)}>{t("server_picker.presets.back")}</Button>
                <Button onclick={save} disabled={!editing.name.trim()}>{t("server_picker.presets.save")}</Button>
            </div>
        {:else}
            <Dialog.Title>{t("server_picker.presets.title")}</Dialog.Title>
            <Dialog.Description>
                {t("server_picker.presets.description")}
            </Dialog.Description>

            <div class="min-h-0 flex-1 overflow-y-auto">
                <div class="flex flex-col gap-2">
                    {#each presets as preset (preset.id)}
                        <div class="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                            <div class="min-w-0 flex-1">
                                <div class="truncate text-sm font-medium">{preset.name}</div>
                                <div class="text-xs text-muted-foreground">{summary(preset)}</div>
                            </div>
                            <Button
                                size="sm"
                                aria-label={t("server_picker.presets.apply_label", { name: preset.name })}
                                onclick={() => onApply(preset)}>{t("server_picker.presets.apply")}</Button
                            >
                            <IconButton
                                label={t("server_picker.presets.edit_label", { name: preset.name })}
                                onclick={() => (editing = { ...preset })}
                            >
                                <Pencil />
                            </IconButton>
                            <IconButton
                                label={t("server_picker.presets.delete_label", { name: preset.name })}
                                onclick={() => onDelete(preset.id)}
                            >
                                <Trash2 />
                            </IconButton>
                        </div>
                    {:else}
                        <EmptyState spacing="sm">{t("server_picker.presets.empty")}</EmptyState>
                    {/each}
                </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
                <Button
                    variant="outline"
                    onclick={() => startNew(true)}
                    disabled={currentlyBlockedRegionIds.length === 0}
                >
                    {t("server_picker.presets.save_current")}
                </Button>
                <Button onclick={() => startNew(false)}><Plus /> {t("server_picker.presets.new")}</Button>
            </div>
        {/if}
    </Dialog.Content>
</Dialog.Root>
