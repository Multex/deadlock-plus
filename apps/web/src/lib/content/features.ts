export type GroupId = "match" | "progress" | "upkeep";

export interface Feature {
    id: string;
    group: GroupId;
    name: string;
    summary: string;
    points: string[];
    /** File name, without extension, of the page's screenshot in `static/screenshots`. */
    shot?: string;
    /** File name, without extension, of a portrait crop of that screenshot, sized for a phone. */
    detailShot?: string;
}

export const GROUPS: readonly { id: GroupId; name: string; blurb: string }[] = [
    {
        id: "match",
        name: "Around the match",
        blurb: "Show friends what you are playing, pick where you play and follow your match as it happens.",
    },
    { id: "progress", name: "Your progress", blurb: "See how you are doing, match by match and over time." },
    { id: "upkeep", name: "Upkeep", blurb: "The chores around the game, in one place." },
];

export const FEATURES: readonly Feature[] = [
    {
        id: "discord-presence",
        shot: "discord-presence",
        detailShot: "discord-presence-mobile",
        group: "match",
        name: "Discord Rich Presence",
        summary: "Show what you are playing on your Discord profile.",
        points: [
            "Detailed shows your hero, mode and match timer. Basic shows only that you are in Deadlock.",
            "Your hero icon is the big image, and your rank badge the small one in ranked matches.",
            "Change the text, images and timer Discord shows for each activity.",
            "Off until you turn it on in the Presence page, where you also pick which Discord apps show it.",
        ],
    },
    {
        id: "server-picker",
        shot: "server-picker",
        detailShot: "server-picker-mobile",
        group: "match",
        name: "Server Picker",
        summary: "Pick which server regions you play on.",
        points: [
            "Block the regions you do not want, and unblock them later.",
            "See your ping to every region before you choose.",
            "Bring over your blocked regions from ServerPickerX and CS2ServerPicker.",
        ],
    },
    {
        id: "live",
        shot: "live",
        detailShot: "live-mobile",
        group: "match",
        name: "Live",
        summary: "Both teams in your current match, with the server and your ping.",
        points: [
            "A scoreboard for both teams: rank, souls, kills, deaths, assists and damage.",
            "The server you are on and your ping while you play.",
            "Follows the game from queue to results, which land in your match history.",
        ],
    },
    {
        id: "match-history",
        shot: "match-history",
        detailShot: "match-history-mobile",
        group: "progress",
        name: "Match History",
        summary: "Every match on record for your account, grouped into play sessions.",
        points: [
            "Each session shows its verdict, record and rank change above its matches.",
            "Plain notes on when you play best.",
            "A break reminder notification after three losses in a row, if you turn it on.",
            "Filter by mode, hero, outcome and date.",
            "Open a match for the full scoreboard: both teams, items, ranks and bans.",
            "Souls and damage over time, when items were bought, objectives and accolades.",
        ],
    },
    {
        id: "stats",
        shot: "stats",
        detailShot: "stats-mobile",
        group: "progress",
        name: "Stats",
        summary: "Your rank, and your results over the last 7, 30 or 90 days or all time.",
        points: [
            "Progress to the next rank and your demotion shields.",
            "What your next win or loss is worth.",
            "An outlook: the winrate that holds your rank, next to your recent one.",
            "Your rank over time, with each promotion and demotion marked.",
            "Win rate, streaks, playtime and numbers for each hero.",
            "How close you are to qualifying for the leaderboard.",
        ],
    },
    {
        id: "mutes",
        shot: "mutes",
        group: "upkeep",
        name: "Mutes",
        summary: "Manage the players you have muted.",
        points: ["View, add, unmute, export and import muted players.", "A backup is made before every change."],
    },
    {
        id: "replays",
        shot: "replays",
        detailShot: "replays-mobile",
        group: "upkeep",
        name: "Replays",
        summary: "Keep the replays that matter.",
        points: ["Browse your saved replays.", "Pin the ones to keep and clean up the rest."],
    },
    {
        id: "storage",
        shot: "storage",
        detailShot: "storage-mobile",
        group: "upkeep",
        name: "Storage",
        summary: "See how much space the game takes on your drive.",
        points: ["How much space Deadlock and Deadlock+ each use.", "Clear files the game makes again on its own."],
    },
    {
        id: "performance",
        shot: "performance",
        detailShot: "performance-mobile",
        group: "upkeep",
        name: "Performance",
        summary: "Measure how smoothly the game runs, then compare.",
        points: [
            "Record a play session: FPS, your lowest dips and stutters.",
            "Check your installed mods for things that can slow the game down.",
            "Compare two recordings side by side.",
        ],
    },
    {
        id: "background",
        group: "upkeep",
        name: "Background options",
        summary: "Runs quietly until you need it.",
        points: [
            "Start with Windows and stay in the tray, by the clock.",
            "A reminder before Steam's weekly maintenance.",
            "Turn on alerts for patches and news.",
        ],
    },
];

/** The single-match page: the densest view the app has. */
export const HERO_SHOT = "match";
export const HERO_DETAIL_SHOT = "match-mobile";

export const HIGHLIGHTS = [
    "discord-presence",
    "live",
    "server-picker",
    "match-history",
    "stats",
    "performance",
] as const;

export function featuresIn(group: GroupId): Feature[] {
    return FEATURES.filter((feature) => feature.group === group);
}

export function highlights(): Feature[] {
    return HIGHLIGHTS.flatMap((id) => FEATURES.filter((feature) => feature.id === id));
}
