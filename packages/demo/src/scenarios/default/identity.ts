import type { Identity } from "../../scenario";

/** Everything here is invented. No account ID, name or match ID belongs to a real player or match. */
export const IDENTITY: Identity = {
    accountId: 90000001,
    steamId64: "76561198050265729",
    persona: "Lantern",
    names: [
        "Brass Tack",
        "Mothlight",
        "Sable",
        "Quillon",
        "Vesper",
        "Tin Whistle",
        "Hollow Oak",
        "Marrow",
        "Copperhead",
        "Night Ferry",
        "Dovetail",
        "Ash and Ember",
        "Greywater",
        "Pennywise Pete",
        "Juniper",
        "Static Hymn",
        "Old Kestrel",
        "Saltmarsh",
        "Fennick",
        "Lowlight",
        "Wrenfield",
        "Cinderblock",
        "Harbor Rat",
        "Thistle",
    ],
};

export const NOW_MS = Date.UTC(2026, 9, 12, 19, 30, 0);
export const SEED = 20261012;

const MATCH_COUNT = 60;
const NEWEST_MATCH_ID = 990000060;

/** Newest first. Everything that describes a match (history rows, detail pages, replays) uses these IDs. */
export const MATCH_IDS: readonly number[] = Array.from({ length: MATCH_COUNT }, (_, i) => NEWEST_MATCH_ID - i);

export function fakeAccountId(identity: Identity, index: number): number {
    return identity.accountId + 1 + index;
}

export function fakeName(identity: Identity, index: number): string {
    return identity.names[index % identity.names.length]!;
}
