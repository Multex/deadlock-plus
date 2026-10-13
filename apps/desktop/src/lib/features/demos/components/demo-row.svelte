<script lang="ts">
    import { CircleHelp, Ellipsis, ExternalLink, FolderOpen, Pin, Trash2 } from "@lucide/svelte";

    import { formatDate, t } from "$lib/core/i18n.svelte";
    import Badge, { type BadgeVariant } from "@deadlock-plus/ui/badge.svelte";
    import Button, { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import {
        formatBytes,
        formatDuration,
        matchResult,
        myPlayer,
        statusInfo,
        type Demo,
        type DemoStatus,
        type MetaResult,
    } from "$lib/features/demos/demos";
    import { demoTitle } from "$lib/features/demos/list";
    import type { Hero } from "$lib/features/heroes/heroes";

    const BADGE: Record<DemoStatus, BadgeVariant> = {
        complete: "success",
        partial: "destructive",
        outdated: "warning",
        unknown: "secondary",
    };

    let {
        demo: d,
        meta: m,
        heroes,
        accountIds,
        pinned: isPinned,
        selected,
        deleting,
        onselect,
        onpin,
        onstatlocker,
        onreveal,
        ondelete,
    }: {
        demo: Demo;
        meta: MetaResult | undefined;
        heroes: Record<number, Hero>;
        accountIds: number[];
        pinned: boolean;
        selected: boolean;
        deleting: boolean;
        onselect: (on: boolean) => void;
        onpin: (on: boolean) => void;
        onstatlocker: () => void;
        onreveal: () => void;
        ondelete: () => void;
    } = $props();

    const info = $derived(statusInfo(d.status));
    const summary = $derived(m?.state === "ok" ? m.summary : null);
    const me = $derived(summary ? myPlayer(summary, accountIds) : null);
    const result = $derived(summary ? matchResult(summary, accountIds) : null);
    const hero = $derived(me ? heroes[me.heroId] : undefined);

    const date = (ms: number) => formatDate(ms, { year: "numeric", month: "short", day: "numeric" });

    const details = $derived(
        [
            t("demos.match_id", { id: d.matchId }),
            date(summary ? summary.startTime * 1000 : d.modifiedMs),
            summary ? formatDuration(summary.durationS) : null,
            formatBytes(d.size),
            d.buildNum ? t("demos.row.build", { build: d.buildNum }) : null,
            m?.state === "missing" ? t("demos.row.not_in_api") : null,
            m?.state === "error" ? t("demos.row.details_unavailable") : null,
        ]
            .filter((part) => part !== null)
            .join(" · "),
    );
</script>

<Card as="li" radius="md" padding="none" class="flex items-center gap-3 px-4 py-2">
    <input
        type="checkbox"
        aria-label={t("demos.row.select", { id: d.matchId })}
        checked={selected}
        disabled={isPinned}
        onchange={(e) => onselect(e.currentTarget.checked)}
    />
    <div class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {#if hero?.icon}
            <img src={hero.icon} alt={hero.name} class="size-full object-cover" />
        {:else}
            <CircleHelp class="size-5 text-muted-foreground" aria-label={t("demos.row.unknown_hero")} />
        {/if}
    </div>
    <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">
            {demoTitle(hero?.name, me, d.matchId)}
            {#if me}<span class="font-normal text-muted-foreground"> · {me.kills}/{me.deaths}/{me.assists}</span>{/if}
        </p>
        <p class="text-xs text-muted-foreground">
            {details}
        </p>
    </div>
    {#if result}
        <Badge variant={result === "win" ? "success" : "destructive"}
            >{result === "win" ? t("demos.row.win") : t("demos.row.loss")}</Badge
        >
    {/if}
    <Badge variant={BADGE[d.status]} title={info.hint}>{info.label}</Badge>
    <Button
        size="sm"
        variant="ghost"
        aria-label={t("demos.row.pin_match", { id: d.matchId })}
        aria-pressed={isPinned}
        title={isPinned ? t("demos.row.pinned_hint") : t("demos.row.unpinned_hint")}
        class={isPinned ? "text-primary" : ""}
        onclick={() => onpin(!isPinned)}
    >
        <Pin class={isPinned ? "fill-current" : ""} />
    </Button>
    <DropdownMenu.Root>
        <DropdownMenu.Trigger
            class={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label={t("demos.row.more_actions_match", { id: d.matchId })}
            title={t("demos.row.more_actions")}
        >
            <Ellipsis />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
            {#if d.status !== "partial"}
                <DropdownMenu.Item onSelect={onstatlocker}>
                    <ExternalLink />
                    {t("demos.row.open_statlocker")}
                </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Item onSelect={onreveal}>
                <FolderOpen />
                {t("demos.row.show_in_folder")}
            </DropdownMenu.Item>
            <DropdownMenu.Item
                class="text-destructive data-[highlighted]:text-destructive"
                disabled={deleting || isPinned}
                onSelect={ondelete}
            >
                <Trash2 />
                {isPinned ? t("demos.row.delete_unpin_first") : t("demos.row.delete")}
            </DropdownMenu.Item>
        </DropdownMenu.Content>
    </DropdownMenu.Root>
</Card>
