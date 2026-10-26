<script lang="ts">
    import type { CoverArt } from "./art";
    import { fitText } from "./fit-text";
    import Inner from "./inner.svelte";
    import type { Magazine } from "./magazine";

    let { mag, art }: { mag: Magazine; art: CoverArt } = $props();

    const f = $derived(mag.feature);
</script>

<Inner {mag} side="right" folio={3} section={mag.sections.coverStory}>
    <div class="page">
        {#if f}
            <div class="feature">
                {#if art.backdrop}
                    <img class="collage" src={art.backdrop} alt="" />
                {/if}
                {#if art.card}
                    <img class="card" src={art.card} alt={f.name} />
                {/if}
                <div class="words">
                    <span class="kicker">{mag.sections.coverStory}</span>
                    <h2 {@attach fitText(64, 30)}>{f.title}</h2>
                    <p {@attach fitText(18, 13)}>{f.deck}</p>
                </div>
                <div class="share">
                    <b>
                        {#each f.share as part, i (i)}
                            {#if part.sign}<small>{part.value}</small>{:else}{part.value}{/if}
                        {/each}
                    </b>
                    <span {@attach fitText(15, 11)}>{f.shareLabel}</span>
                </div>
            </div>
        {/if}

        <div class="rotation">
            <div class="rot-head">
                <h3>{mag.rotation.title}</h3>
                <span>{mag.rotation.tried}</span>
            </div>
            <ol>
                {#each mag.heroes as h, i (h.id)}
                    <li>
                        <span class="pos">{i + 1}</span>
                        {#if h.icon}
                            <img src={h.icon} alt="" />
                        {:else}
                            <span class="noicon"></span>
                        {/if}
                        <div class="who">
                            <b>{h.name}</b>
                            <div class="bar"><i style="width: {h.bar * 100}%"></i></div>
                        </div>
                        <span class="num">{h.games}<small>{mag.rotation.games}</small></span>
                        <span class="num">{h.record}<small>{mag.rotation.record}</small></span>
                        <span class="num time">{h.playtime}<small>{mag.rotation.played}</small></span>
                    </li>
                {/each}
            </ol>
            {#if mag.asides.length > 0}
                <div class="asides">
                    {#each mag.asides as a (a.id)}
                        <div>
                            <span class="kicker">{a.kicker}</span>
                            <b {@attach fitText(17, 12)}>{a.headline}</b>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</Inner>

<style>
    .page {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .feature {
        position: relative;
        flex: none;
        height: 470px;
        overflow: hidden;
        color: var(--fg);
        background: radial-gradient(ellipse 55% 70% at 75% 60%, var(--glow), transparent 75%), var(--bg);
    }

    .collage {
        position: absolute;
        top: 0;
        left: -560px;
        height: 100%;
        width: auto;
        max-width: none;
        opacity: 0.85;
    }

    /* The 280x380 card at about 1.4x: no larger, so it stays sharp. */
    .card {
        position: absolute;
        right: -10px;
        bottom: 0;
        width: 380px;
        filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.35));
        /* Some cards crop the body flat at the left; fade that crop into the panel. */
        mask-image: linear-gradient(to right, transparent 0%, #000 14%);
    }

    .words {
        position: absolute;
        top: 40px;
        left: 64px;
        width: 330px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        text-shadow: 0 1px 10px rgb(0 0 0 / 0.3);
    }

    .kicker {
        color: var(--accent);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }

    .words h2 {
        max-height: 196px;
        padding-bottom: 0.14em;
        margin: 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: var(--fs, 64px);
        line-height: 0.98;
        letter-spacing: -0.02em;
        overflow-wrap: anywhere;
    }

    .words p {
        max-height: 70px;
        margin: 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-weight: 500;
        font-size: var(--fs, 18px);
        line-height: 1.25;
    }

    .share {
        position: absolute;
        left: 64px;
        bottom: 26px;
        display: flex;
        align-items: flex-end;
        gap: 10px;
        text-shadow: 0 1px 10px rgb(0 0 0 / 0.3);
    }

    .share b {
        color: var(--accent);
        font-family: "Valve Oracle", serif;
        font-weight: 100;
        font-size: 112px;
        line-height: 0.8;
        white-space: nowrap;
    }

    .share small {
        font-size: 50px;
    }

    .share span {
        width: 150px;
        max-height: 40px;
        overflow: hidden;
        padding-bottom: 4px;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: var(--fs, 15px);
        line-height: 1.1;
        text-transform: uppercase;
        box-sizing: content-box;
    }

    .rotation {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
        padding: 22px 48px 0 84px;
    }

    .rot-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 6px;
        border-bottom: 2px solid var(--page-text);
        white-space: nowrap;
    }

    .rot-head h3 {
        margin: 0;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 30px;
    }

    .rot-head span {
        overflow: hidden;
        color: var(--page-muted);
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-size: 15px;
        text-overflow: ellipsis;
    }

    ol {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    li {
        display: grid;
        grid-template-columns: 22px 40px minmax(0, 1fr) 54px 54px 84px;
        align-items: center;
        gap: 10px;
        padding: 7px 0;
        border-bottom: 1px solid #d8d2c6;
    }

    .pos {
        color: var(--ink);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 22px;
    }

    li img,
    .noicon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        background: #e2ddd2;
    }

    .who b {
        display: block;
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 16px;
        text-transform: uppercase;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .bar {
        height: 6px;
        margin-top: 4px;
        background: #e2ddd2;
    }

    .bar i {
        display: block;
        height: 100%;
        background: var(--ink);
    }

    .num {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 18px;
        line-height: 1.1;
        white-space: nowrap;
    }

    .num.time {
        font-size: 15px;
    }

    .num small {
        margin-top: 2px;
        overflow: hidden;
        color: var(--page-muted);
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        text-overflow: ellipsis;
    }

    .asides {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-top: auto;
        padding: 10px 0 8px;
    }

    .asides div {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .asides .kicker {
        color: var(--ink);
    }

    .asides b {
        max-height: 42px;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: var(--fs, 17px);
        line-height: 1.2;
    }
</style>
