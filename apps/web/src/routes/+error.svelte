<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { page } from "$app/state";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
</script>

<Seo title="{page.status === 404 ? 'Page not found' : 'Something went wrong'} | Deadlock+" noindex />

<Page class="items-center justify-center text-center">
    <p class="text-sm font-semibold tracking-widest text-brass">{page.status}</p>
    <h1 class="text-3xl">{page.status === 404 ? "This page does not exist" : "Something went wrong"}</h1>
    <a href="/" class={buttonVariants()}>Back to the home page</a>
</Page>
