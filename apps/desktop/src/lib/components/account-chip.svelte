<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { User } from "@lucide/svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";

    let { collapsed }: { collapsed: boolean } = $props();

    const account = $derived(steamAccount.account);
    const label = $derived(account?.personaName || t("account.default_name"));
</script>

{#if steamAccount.loaded}
    <Tooltip.Provider>
        <Tooltip.Root delayDuration={100} disabled={!collapsed}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    <div {...props} class="flex h-10 items-center gap-3 overflow-hidden rounded-md px-3">
                        {#if account?.avatarDataUrl}
                            <img src={account.avatarDataUrl} alt="" class="size-6 shrink-0 rounded-sm" />
                        {:else}
                            <User class="size-5 shrink-0 text-muted-foreground" />
                        {/if}
                        <div class="min-w-0 transition-opacity duration-200 {collapsed ? 'opacity-0' : 'opacity-100'}">
                            <p class="truncate font-heading text-sm font-semibold tracking-wide">
                                {account ? label : t("account.none")}
                            </p>
                            {#if account}
                                <p class="truncate text-xs text-muted-foreground">{account.steamId32}</p>
                            {/if}
                        </div>
                    </div>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="right"
                >{account
                    ? t("account.tooltip", { name: label, id: account.steamId32 })
                    : t("account.none_found")}</Tooltip.Content
            >
        </Tooltip.Root>
    </Tooltip.Provider>
{/if}
