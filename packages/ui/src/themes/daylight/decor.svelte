<!-- Afternoon sun through venetian blinds: soft slat shadows falling across the paper from the upper left. Still
     on purpose: a drift slow enough to look calm would still cost a frame on every display refresh. -->
<div class="daylight">
    <div class="window">
        <div class="slats"></div>
    </div>
</div>

<style>
    .daylight {
        position: absolute;
        inset: 0;
        container-type: size;
    }

    .window {
        position: absolute;
        top: -20cqh;
        left: -12cqw;
        width: 70cqw;
        height: 120cqh;
        transform: skewX(-18deg) rotate(-8deg);
        transform-origin: top left;
        mask: radial-gradient(70% 60% at 35% 35%, #000 30%, transparent 75%);
    }

    .slats {
        position: absolute;
        inset: -10% 0;
        background: repeating-linear-gradient(
            to bottom,
            transparent 0 30px,
            color-mix(in oklch, var(--brass) 9%, transparent) 30px 42px,
            transparent 42px 46px
        );
    }
</style>
