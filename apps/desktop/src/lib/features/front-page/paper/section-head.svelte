<script lang="ts">
    let { text }: { text: string } = $props();
</script>

<h4>{text}</h4>

<style>
    h4 {
        margin: 0 0 4px;
        color: var(--fp-spot);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 16px;
        text-transform: uppercase;
    }
</style>
