<script lang="ts">
    import { Flag, Gamepad2, LoaderCircle, Power, Search, Swords, Trophy, Users } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import type { LiveQueue } from "@deadlock-plus/ipc-types/LiveQueue";
    import { formatClock, type StateIcon, type StateLine } from "../live";

    let { line, queue = null }: { line: StateLine; queue?: LiveQueue | null } = $props();

    const ICONS = {
        power: Power,
        menu: Gamepad2,
        search: Search,
        flag: Flag,
        swords: Swords,
        trophy: Trophy,
        loader: LoaderCircle,
    } satisfies Record<StateIcon, unknown>;

    const Icon = $derived(ICONS[line.icon]);
    const active = $derived(line.icon !== "power" && line.icon !== "menu");
    const time = $derived(queue ? formatClock(queue.queuedSecs) : null);
</script>

<div class="flex items-center gap-3.5 rounded-lg border border-border bg-card px-4 py-3.5" role="status">
    <span
        class={[
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
            active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        ]}
    >
        <Icon
            class={["size-5", (line.icon === "loader" || line.icon === "search") && "motion-safe:animate-pulse"]}
            aria-hidden="true"
        />
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <p class="text-sm font-medium">{t(line.key)}</p>
        <p class="text-[13px] text-muted-foreground">{t(line.hint)}</p>
    </div>
    {#if queue}
        <div class="flex shrink-0 items-center gap-3.5 text-sm text-muted-foreground tabular-nums">
            {#if time}<span>{time}</span>{/if}
            <span class="inline-flex items-center gap-1" title={t("live.queue.party")}>
                <Users class="size-3.5" aria-hidden="true" />
                {queue.partySize}
            </span>
        </div>
    {/if}
</div>
