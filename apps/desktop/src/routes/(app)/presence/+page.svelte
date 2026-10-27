<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";

    import { presenceConfigStore } from "$lib/features/presence/config.svelte";
    import DiscordApps from "$lib/features/presence/components/discord-apps.svelte";
    import PresenceHeader from "$lib/features/presence/components/presence-header.svelte";
    import PresenceEditor from "$lib/features/presence/components/presence-editor/presence-editor.svelte";
    import SyntaxCard from "$lib/features/presence/components/presence-editor/syntax-card.svelte";
</script>

<Page>
    <PageHeader title={t("settings.items.discord_presence")} subtitle={t("settings.discord.presence_description")} />

    <PresenceHeader />

    <Card as="section">
        <PresenceEditor />
    </Card>
    <Card as="section" id="pe-syntax" class="scroll-mt-4">
        <SyntaxCard
            placeholders={presenceConfigStore.placeholders}
            status={presenceConfigStore.status}
            onretry={() => void presenceConfigStore.load()}
        />
    </Card>

    <DiscordApps />
</Page>
