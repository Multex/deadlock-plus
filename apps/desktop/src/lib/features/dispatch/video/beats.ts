import { copySeed, pickVariant } from "@deadlock-plus/stats/dispatch/copy";
import type { SignalId } from "@deadlock-plus/stats/dispatch/signals";
import type { VideoKind } from "./scene";

/**
 * One block of a video on the bar grid. `id` is unique across ALL kinds (prefix it with the kind's letter, e.g.
 * `m_contact_sheet`, `c_chase_card`, `y_envelope`), so no two videos can share a scene. `presents` names how each
 * stat is shown (e.g. `streak:coverline`, `rank:slab`); the same stat may appear in two kinds only under different
 * presentations. `signal` is the signal this beat spends: a later beat in the same video must not reuse it.
 */
export interface Beat<Id extends string = string> {
    id: Id;
    kind: VideoKind;
    bar: number;
    bars: number;
    presents: readonly string[];
    signal?: SignalId;
}

/** Variants every video copy slot carries, so a slot's count never drifts from its keys. */
export const VIDEO_VARIANTS = 5;

/**
 * The locale key for a video copy slot: `dispatch.video.<kind>.<beat>.<slot>_<n>`, with `n` picked per player and
 * edition so a keepsake never changes but two players read differently. Videos never read `dispatch.story.*`.
 */
export function videoCopyKey(
    accountId: number,
    editionId: string,
    kind: VideoKind,
    beat: string,
    slot: string,
    n = VIDEO_VARIANTS,
): string {
    const variant = pickVariant(copySeed(accountId, editionId), `video.${kind}.${beat}.${slot}`, n);
    return `dispatch.video.${kind}.${beat}.${slot}_${variant}`;
}
