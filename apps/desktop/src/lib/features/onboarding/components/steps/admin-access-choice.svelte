<script lang="ts">
    import { CircleCheck, Clock, Info, ShieldCheck, TriangleAlert } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { adminAccess } from "$lib/features/admin-access/admin-access.svelte";
    import { afterAlways, choiceView, type AdminChoice, type CardState } from "./admin-choice";

    let choice = $state<AdminChoice>({ kind: "none" });

    const afterMatch = $derived(adminAccess.buttons.kind === "prompt" && adminAccess.buttons.disabled !== null);
    const view = $derived(
        choiceView(choice, {
            alwaysOn: adminAccess.buttons.kind === "remove",
            afterMatch,
            appliedText: t("onboarding.permissions.always_on"),
        }),
    );

    async function always() {
        if (view.always.pressed || adminAccess.busy) return;
        choice = { kind: "waiting" };
        choice = afterAlways(await adminAccess.allow(true));
    }

    function later() {
        choice = { kind: "later" };
    }
</script>

{#snippet option(Icon: typeof ShieldCheck, title: string, note: string, card: CardState, onclick: () => void)}
    <Button
        variant="toggle"
        aria-pressed={card.pressed}
        disabled={card.disabled}
        {onclick}
        class="h-auto flex-col items-start justify-start gap-1 whitespace-normal p-4 text-left disabled:opacity-40"
    >
        <span class="flex items-center gap-2 font-heading text-sm font-semibold tracking-wide text-foreground">
            <Icon class="size-4" />{title}
        </span>
        <span class="text-xs font-normal text-muted-foreground">{note}</span>
    </Button>
{/snippet}

<h1 class="font-heading text-2xl font-bold tracking-wide">{t("onboarding.permissions.admin_title")}</h1>
<p class="text-muted-foreground">{t("onboarding.permissions.admin_body")}</p>
{#if afterMatch && !view.always.pressed}
    <p class="text-sm text-muted-foreground">{t("admin_access.after_match")}</p>
{/if}
<div class="grid grid-cols-2 gap-3">
    {@render option(
        ShieldCheck,
        t("admin_access.always_allow"),
        t("onboarding.permissions.always_note"),
        view.always,
        always,
    )}
    {@render option(
        Clock,
        t("onboarding.permissions.later"),
        t("onboarding.permissions.later_note"),
        view.later,
        later,
    )}
</div>
{#if view.notice?.tone === "success"}
    <div
        role="status"
        class="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
    >
        <CircleCheck class="size-4 shrink-0" />
        <p>
            {view.notice.text}
            <span class="text-muted-foreground">{t("onboarding.permissions.always_on_hint")}</span>
        </p>
    </div>
{:else if view.notice?.tone === "neutral"}
    <div role="status" class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
        <Info class="size-4 shrink-0 text-muted-foreground" />{view.notice.text}
    </div>
{:else if view.notice}
    <div
        role="alert"
        class="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
    >
        <TriangleAlert class="size-4 shrink-0" />{view.notice.text}
    </div>
{/if}
