export type AccoladeCategory =
    "kills" | "assists" | "healing" | "damage" | "headshots" | "souls" | "farming" | "objects" | "defence" | "other";

const CATEGORY_BY_STAT: Readonly<Record<string, AccoladeCategory>> = {
    kills: "kills",
    killstreak_kills: "kills",
    closeup_kills: "kills",
    long_distance_kills: "kills",
    gun_kills: "kills",
    melee_kills: "kills",
    ability_kills: "kills",
    first_blood: "kills",
    assists: "assists",
    healing: "healing",
    player_damage: "damage",
    bullet_damage: "damage",
    melee_damage: "damage",
    ability_damage: "damage",
    weapon_damage: "damage",
    closeup_damage: "damage",
    long_distance_damage: "damage",
    headshots: "headshots",
    headshot_damage: "headshots",
    net_worth: "souls",
    secures: "souls",
    trooper_last_hits: "farming",
    neutral_last_hits: "farming",
    last_hits: "farming",
    denies: "farming",
    breakables_destroyed: "objects",
    pickups_collected_powerup: "objects",
    returned_idol: "objects",
    sinners_sacrifice_jackpot: "objects",
    damage_absorbed: "defence",
    damage_mitigated: "defence",
};

export function accoladeCategory(trackedStat: string | null | undefined): AccoladeCategory {
    return (trackedStat && CATEGORY_BY_STAT[trackedStat]) || "other";
}

/** The game sends a negative threshold for an accolade that has no tiers. */
export function accoladeTier(tier: number | null | undefined): number | null {
    return typeof tier === "number" && Number.isFinite(tier) && tier >= 0 ? tier : null;
}

/** Index of the `}` closing the `{` at `open`, or -1. */
function closingBrace(text: string, open: number): number {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) return i;
    }
    return -1;
}

function pluralOptions(body: string): Map<string, string> | null {
    const options = new Map<string, string>();
    let i = 0;
    while (i < body.length) {
        const open = body.indexOf("{", i);
        if (open < 0) return body.slice(i).trim() === "" ? options : null;
        const key = body.slice(i, open).trim();
        const close = closingBrace(body, open);
        if (!key || close < 0) return null;
        options.set(key, body.slice(open + 1, close));
        i = close + 1;
    }
    return options;
}

function render(text: string, value: number, locale: string, format: (n: number) => string): string | null {
    let out = "";
    let i = 0;
    while (i < text.length) {
        const open = text.indexOf("{", i);
        if (open < 0) return out + text.slice(i);
        out += text.slice(i, open);
        const close = closingBrace(text, open);
        if (close < 0) return null;
        const inner = text.slice(open + 1, close).trim();
        i = close + 1;

        if (inner === "stat_value" || inner === "g:citadel_thousands:stat_value") {
            out += format(value);
            continue;
        }
        const plural = /^stat_value\s*,\s*plural\s*,/.exec(inner);
        if (!plural) return null;
        const options = pluralOptions(inner.slice(plural[0].length));
        if (!options) return null;
        const chosen =
            options.get(`=${value}`) ?? options.get(new Intl.PluralRules(locale).select(value)) ?? options.get("other");
        if (chosen === undefined) return null;
        const rendered = render(chosen, value, locale, format);
        if (rendered === null) return null;
        out += rendered;
    }
    return out;
}

/**
 * The game's accolade description template with the earned value filled in, or null when it uses
 * something this does not understand.
 */
export function renderAccoladeDescription(
    template: string,
    value: number,
    locale: string,
    format: (n: number) => string,
): string | null {
    const plain = template.replace(/<[^>]*>/g, "");
    const text = render(plain, value, locale, format);
    return text === null ? null : text.replace(/\s+/g, " ").trim();
}
