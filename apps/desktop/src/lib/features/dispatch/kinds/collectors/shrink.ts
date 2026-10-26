import type { Attachment } from "svelte/attachments";

/**
 * Steps a no-wrap line's font size down from `max` until it fits its box, never under `min`. Runs again once the
 * fonts load, since the fallback face measures differently. `content` is the line's text: a new one fits again.
 */
export function shrink(max: number, min: number, content: string): Attachment<HTMLElement> {
    void content;
    return (el) => {
        const fit = () => {
            let size = max;
            el.style.fontSize = `${size}px`;
            while (el.scrollWidth > el.clientWidth && size > min) {
                size -= 1;
                el.style.fontSize = `${size}px`;
            }
        };
        fit();
        void document.fonts?.ready.then(fit);
    };
}
