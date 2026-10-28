/** A hit's shake, `dt` seconds after it: a quick decaying wobble. */
export function shake(dt: number, amp: number, seed: number): [number, number] {
    if (dt < 0 || dt > 0.6) return [0, 0];
    const k = amp * Math.exp(-dt / 0.12);
    return [k * Math.sin(dt * 71 + seed), k * Math.cos(dt * 59 + seed * 1.7)];
}
