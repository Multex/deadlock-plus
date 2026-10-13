<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";

    type Props = {
        label: string;
        value: number;
        tone?: string;
    };

    let { label, value, tone = "" }: Props = $props();
</script>

<Card radius="md" padding="row">
    <p class="font-heading text-3xl font-semibold {tone}">{value}</p>
    <p class="text-xs text-muted-foreground">{label}</p>
</Card>
