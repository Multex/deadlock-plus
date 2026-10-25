<script lang="ts">
    let { text, size = "banner" }: { text: string; size?: "banner" | "story" } = $props();
</script>

<p class="deck {size}">{text}</p>

<style>
    .deck {
        margin: 0;
    }

    .banner {
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-style: italic;
        font-size: 18px;
        line-height: 1.15;
    }

    .story {
        font-family: "Radiance", sans-serif;
        font-size: 14px;
        line-height: 1.3;
    }
</style>
