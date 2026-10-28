<script lang="ts">
    import { openLink } from "$lib/core/open-link";
    import { announcements } from "../announcements.svelte";
    import AnnouncementStack from "./announcement-stack.svelte";
</script>

<AnnouncementStack
    items={announcements.shown}
    ondismiss={(id) => void announcements.dismiss(id)}
    onopen={(url) => void openLink(url)}
/>
