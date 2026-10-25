<script lang="ts">
    let {
        text,
        tone = "spot",
        angle = -9,
    }: {
        text: string;
        tone?: "spot" | "ink";
        /** Degrees. */
        angle?: number;
    } = $props();
</script>

<span class="stamp {tone}" style="transform: rotate({angle}deg);">{text}</span>

<style>
    .stamp {
        display: inline-block;
        padding: 2px 10px;
        border: 3px solid currentColor;
        border-radius: 4px;
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: 30px;
        line-height: 1;
        text-transform: uppercase;
        white-space: nowrap;
        mix-blend-mode: multiply;
        opacity: 0.88;
    }

    .spot {
        color: var(--fp-spot);
    }

    .ink {
        color: var(--fp-ink);
    }
</style>
