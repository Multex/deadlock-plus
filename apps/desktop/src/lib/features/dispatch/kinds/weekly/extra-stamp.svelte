<script lang="ts">
    import { fitFontSize } from "$lib/features/front-page/paper/fit";
    import { PAPER_TOKENS } from "$lib/features/front-page/paper/tokens";
    import { DISPATCH_PAPER } from "../../edition-view";
    import { STAMP_ANGLE } from "./arrival";
    import { stampCenter, stampWordWidth, type Rect } from "./stamp-spot";

    let { text }: { text: string } = $props();

    const SIZE = { max: 84, min: 34 };

    const id = $props.id();
    const ink = `${id}-ink`;

    /** Offsets up to the cover, which the sheet's tilt and the fit's scale leave untouched. */
    function rectIn(el: HTMLElement, root: HTMLElement): Rect {
        let left = 0;
        let top = 0;
        for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) {
            left += n.offsetLeft;
            top += n.offsetTop;
        }
        return { left, top, width: el.offsetWidth, height: el.offsetHeight };
    }

    /**
     * Lays the stamp across the lead photo, wherever the banner's length put it, sized to the photo; a longer word
     * (German "Extrablatt!") shrinks to fit instead of running out of its frame.
     */
    function place(stamp: HTMLElement) {
        void text;
        const cover = stamp.closest<HTMLElement>("[data-weekly-cover]");
        const anchor = cover?.querySelector<HTMLElement>(".lead .frame") ?? cover?.querySelector<HTMLElement>(".lead");
        const word = stamp.querySelector<HTMLElement>(".word");
        if (!cover || !anchor || !word) return;
        const run = () => {
            const photo = rectIn(anchor, cover);
            word.style.width = `${stampWordWidth(photo.width)}px`;
            const fits = (size: number) => {
                word.style.fontSize = `${size}px`;
                return word.scrollWidth <= word.clientWidth + 1;
            };
            word.style.fontSize = `${fitFontSize({ ...SIZE, fits })}px`;
            const size = { width: stamp.offsetWidth, height: stamp.offsetHeight };
            const c = stampCenter(photo, size, DISPATCH_PAPER, STAMP_ANGLE);
            stamp.style.left = `${c.x}px`;
            stamp.style.top = `${c.y}px`;
        };
        const observer = new ResizeObserver(run);
        observer.observe(anchor);
        run();
        void document.fonts?.ready.then(run);
        return () => observer.disconnect();
    }
</script>

<div class="extra" data-extra style="color: {PAPER_TOKENS.spot}; transform: rotate({STAMP_ANGLE}deg);" {@attach place}>
    <svg class="defs" aria-hidden="true">
        <!-- Rubber ink: speckled gaps where the stamp did not take, and a slightly ragged edge. -->
        <filter id={ink} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="11" result="noise" />
            <feColorMatrix
                in="noise"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  7 0 0 0 -1.3"
                result="speck"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" result="ragged" />
            <feComposite in="ragged" in2="speck" operator="in" />
        </filter>
    </svg>
    <div class="face" style="filter: url(#{ink});">
        <span class="word">{text}</span>
    </div>
</div>

<style>
    .extra {
        position: absolute;
        top: 0;
        left: 0;
        translate: -50% -50%;
        transform-origin: 50% 50%;
        pointer-events: none;
    }

    .defs {
        position: absolute;
        width: 0;
        height: 0;
    }

    .face {
        padding: 6px 18px 2px;
        border: 6px solid currentColor;
        border-radius: 8px;
        outline: 2.5px solid currentColor;
        outline-offset: -13px;
        opacity: 0.93;
    }

    .word {
        display: block;
        padding: 4px 6px 0;
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        line-height: 1.1;
        text-align: center;
        text-transform: uppercase;
        white-space: nowrap;
        letter-spacing: 0.02em;
    }
</style>
