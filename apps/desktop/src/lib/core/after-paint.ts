/**
 * Runs `run` once the next frame has painted: a frame callback runs before the paint, a task queued from it
 * runs after. Returns a cancel.
 */
export function afterNextPaint(run: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => (timer = setTimeout(run, 0)));
    return () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
    };
}
