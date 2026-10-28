/** True from a tooltip's first open on, so its content mounts on demand and then keeps its close animation. */
export function openedOnce(): (open: boolean) => boolean {
    let opened = false;
    return (open) => (opened ||= open);
}
