<script lang="ts">
    import { t, tn } from "$lib/core/i18n.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Flag from "$lib/components/flag.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { ChevronRight, Info, Loader2 } from "@lucide/svelte";
    import type { ServerGroup } from "../types";
    import { pingLabel, pingVariant } from "../ping";

    type Props = {
        group: ServerGroup;
        nested?: boolean;
        expandable?: boolean;
        expanded?: boolean;
        blocked: boolean;
        lockedBy?: string | null;
        blockedMembers?: number;
        memberCount?: number;
        busy: boolean;
        external: boolean;
        externalLabel: string;
        pending: boolean;
        ping: number | null | undefined;
        allSiblingsBlocked?: boolean;
        siblingNames?: string[];
        onToggle: (checked: boolean) => void;
        onExpand?: () => void;
        onBlockSiblings?: () => void;
    };

    let {
        group,
        nested = false,
        expandable = false,
        expanded = false,
        blocked,
        lockedBy = null,
        blockedMembers = 0,
        memberCount = 0,
        busy,
        external,
        externalLabel,
        pending,
        ping,
        allSiblingsBlocked = true,
        siblingNames = [],
        onToggle,
        onExpand,
        onBlockSiblings,
    }: Props = $props();

    const isBlocked = $derived(blocked || external);
    const partial = $derived(!isBlocked && blockedMembers > 0);
</script>

<Card
    padding="row"
    role="listitem"
    aria-label={group.description}
    class="flex items-center gap-3 {nested ? 'border-border/60 bg-card/50 py-2.5' : ''}"
>
    {#if expandable}
        <button
            type="button"
            onclick={onExpand}
            aria-label={expanded
                ? t("server_picker.row.collapse_aria", { name: group.description })
                : t("server_picker.row.expand_aria", { name: group.description })}
            aria-expanded={expanded}
            class="-ml-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
            <ChevronRight class="size-4 transition-transform {expanded ? 'rotate-90' : ''}" />
        </button>
    {:else if !nested}
        <span class="-ml-1 size-5 shrink-0"></span>
    {/if}

    <Flag code={group.countryCode} />

    <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{group.description}</span>
            {#if group.isCluster}
                <Badge variant="secondary">{tn("server_picker.row.relay_groups", memberCount)}</Badge>
            {:else}
                <Badge variant="outline">{tn("server_picker.row.relays", group.relayIps.length)}</Badge>
            {/if}
            {#if partial}
                <Badge variant="warning"
                    >{t("server_picker.row.partial", { blocked: blockedMembers, total: memberCount })}</Badge
                >
            {/if}
            {#if external}
                <Badge variant="warning">{externalLabel}</Badge>
            {/if}
            {#if group.routingNote}
                <Tooltip.Provider>
                    <Tooltip.Root delayDuration={150}>
                        <Tooltip.Trigger aria-label={t("server_picker.row.routing_aria", { name: group.description })}>
                            <Info class="size-3.5 text-muted-foreground" aria-hidden="true" />
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                            {group.routingNote.note}
                            {#if group.routingNote.unblockableMatches.length > 0}
                                <span class="mt-1 block text-muted-foreground">
                                    {t("server_picker.row.unblockable", {
                                        names: group.routingNote.unblockableMatches.join(", "),
                                    })}
                                </span>
                            {/if}
                        </Tooltip.Content>
                    </Tooltip.Root>
                </Tooltip.Provider>
            {/if}
        </div>

        {#if group.routingNote && blocked && !allSiblingsBlocked && onBlockSiblings}
            <button
                type="button"
                onclick={onBlockSiblings}
                class="mt-1 text-left text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
                {t("server_picker.row.block_siblings", { names: siblingNames.join(", ") })}
            </button>
        {/if}
    </div>

    <div class="flex w-20 justify-center">
        <Tooltip.Provider>
            <Tooltip.Root delayDuration={150}>
                <Tooltip.Trigger
                    aria-label={t("server_picker.row.ping_aria", {
                        name: group.description,
                        ping: pingLabel(ping, pending),
                    })}
                >
                    <Badge variant={pingVariant(ping)} class="min-w-16 justify-center">{pingLabel(ping, pending)}</Badge
                    >
                </Tooltip.Trigger>
                <Tooltip.Content>
                    {#if ping === null}
                        {t("server_picker.row.no_reply_hint")}
                    {:else}
                        {group.isCluster ? t("server_picker.row.ping_region") : t("server_picker.row.ping_relay")}
                    {/if}
                </Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    </div>

    <div class="flex w-28 items-center justify-end gap-2">
        {#if busy}
            <Loader2
                class="size-4 animate-spin text-muted-foreground"
                role="status"
                aria-label={t("server_picker.row.applying")}
            />
        {:else}
            <span class="text-xs leading-none font-medium {isBlocked ? 'text-destructive' : 'text-muted-foreground'}">
                {isBlocked ? t("server_picker.row.blocked") : t("server_picker.row.open")}
            </span>
        {/if}
        <Tooltip.Provider>
            <Tooltip.Root delayDuration={150}>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Switch
                            {...props}
                            bind:checked={() => isBlocked, onToggle}
                            disabled={busy || external || lockedBy != null}
                            aria-label={t("server_picker.row.block_aria", { name: group.description })}
                            class="data-[state=checked]:bg-destructive"
                        />
                    {/snippet}
                </Tooltip.Trigger>
                {#if lockedBy}
                    <Tooltip.Content>{t("server_picker.row.locked", { region: lockedBy })}</Tooltip.Content>
                {/if}
            </Tooltip.Root>
        </Tooltip.Provider>
    </div>
</Card>
