/**
 * Shrinks `--fs` on the node in 1px steps from `max` until its content fits its box on both axes. Runs again once
 * the fonts land, since the fallback face measures differently.
 */
export function fitText(max: number, min: number) {
    return (node: HTMLElement) => {
        let live = true;
        const run = () => {
            if (!live) return;
            let size = max;
            node.style.setProperty("--fs", `${size}px`);
            while (
                size > min &&
                (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)
            ) {
                size -= 1;
                node.style.setProperty("--fs", `${size}px`);
            }
        };
        run();
        void document.fonts.ready.then(run);
        return () => {
            live = false;
        };
    };
}
