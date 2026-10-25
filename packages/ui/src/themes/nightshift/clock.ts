/** Deadlock Night Shift goes live every Wednesday at 21:00 in Paris; the show is assumed to run three hours. */
const SHOW_DAY = "Wed";
const SHOW_START_HOUR = 21;
const SHOW_HOURS = 3;

const paris = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
});

export function onShift(date: Date): boolean {
    const parts = Object.fromEntries(paris.formatToParts(date).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour) + Number(parts.minute) / 60;
    return parts.weekday === SHOW_DAY && hour >= SHOW_START_HOUR && hour < SHOW_START_HOUR + SHOW_HOURS;
}

/** Clock hand angles in degrees clockwise from twelve, on the viewer's local time. */
export function hands(date: Date): { hour: number; minute: number } {
    const minutes = date.getMinutes();
    return { hour: ((date.getHours() % 12) + minutes / 60) * 30, minute: minutes * 6 };
}

/** The medallion's wheel steps four times a second: smooth to the eye at this speed, and no frame between steps. */
export const TURN_STEP_MS = 250;
const TURN_PERIOD_MS = 240_000;

export function turnAt(now: number): number {
    const step = Math.floor(now / TURN_STEP_MS) * TURN_STEP_MS;
    return ((step % TURN_PERIOD_MS) / TURN_PERIOD_MS) * 360;
}
