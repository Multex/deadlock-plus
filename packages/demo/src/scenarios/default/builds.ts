import type { BuildBackup } from "@deadlock-plus/ipc-types/BuildBackup";
import type { BuildSection } from "@deadlock-plus/ipc-types/BuildSection";
import type { BuildVersionMeta } from "@deadlock-plus/ipc-types/BuildVersionMeta";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ConflictView } from "@deadlock-plus/ipc-types/ConflictView";
import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import type { ModEntryView } from "@deadlock-plus/ipc-types/ModEntryView";
import type { QueuedSaveView } from "@deadlock-plus/ipc-types/QueuedSaveView";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import type { SaveResult } from "@deadlock-plus/ipc-types/SaveResult";

import type { Handlers } from "../../backend";
import type { ApiRoute } from "../../fetch";
import type { Identity, Module } from "../../scenario";
import { fakeAccountId } from "./identity";

const LOCAL_ID_LIMIT = 1000;
const MAX_VERSIONS = 20;
const MAX_BACKUPS = 10;
const DAY_S = 86_400;
const SECTIONS: readonly BuildSection[] = ["Favorites", "Unpublished", "SavedLastUsed"];

/** `minWidthForColumns` of `@deadlock-plus/build-layout`, by column count: widths that keep their columns at every scale. */
const WIDTH_FOR_COLUMNS = [0, 94, 176, 258, 340];
/** A one-row category as the game's "Fit to items" stores it. */
const ONE_ROW_HEIGHT = 183.75;

const HERO_CLASSES = new Map(
    (
        "1:inferno 2:gigawatt 3:hornet 4:ghost 6:atlas 7:wraith 8:forge 10:chrono 11:dynamo 12:kelvin 13:haze " +
        "14:astro 15:bebop 16:nano 17:orion 18:krill 19:shiv 20:tengu 25:warden 27:yamato 31:lash 35:viscous " +
        "50:synth 52:mirage 58:viper 60:magician 63:vampirebat 64:drifter 65:priest 66:frank 67:bookworm " +
        "69:doorman 72:punkgoat 76:necro 77:fencer 79:familiar 80:werewolf 81:unicorn 84:ratking 85:chessmaster"
    )
        .split(" ")
        .map((pair): [number, string] => {
            const [id, name] = pair.split(":");
            return [Number(id), `hero_${name}`];
        }),
);

const INFERNUS = 1;
const ABRAMS = 6;
const KELVIN = 12;
const HAZE = 13;

/** Each hero's four ability slots, ultimate last. */
const ABILITIES: Record<number, readonly number[]> = {
    [INFERNUS]: [491391007, 3516947824, 1593133799, 1142270357],
    [ABRAMS]: [4072270083, 2824119765, 715762406, 509856396],
    [KELVIN]: [18921423, 1963397252, 2351041382, 3826390464],
    [HAZE]: [2948410412, 2414191464, 1080948381, 731943444],
};

const ITEM = {
    extendedMagazine: 1548066885,
    monsterRounds: 1009965641,
    highVelocityRounds: 3077079169,
    closeQuarters: 1342610602,
    headshotBooster: 2010028405,
    extraHealth: 3633614685,
    extraStamina: 4139877411,
    extraRegen: 2829638276,
    meleeLifesteal: 1437614329,
    healingRite: 1710079648,
    extraSpirit: 968099481,
    extraCharge: 3776945997,
    mysticRegeneration: 1439347412,
    spiritStrike: 465043967,
    swiftStriker: 4104549924,
    kineticDash: 3977876567,
    intensifyingMagazine: 2407033488,
    meleeCharge: 26002154,
    bulletLifesteal: 499683006,
    enduringSpeed: 2447176615,
    spiritShielding: 112198670,
    spiritLifesteal: 876563814,
    improvedSpirit: 7409189,
    mysticVulnerability: 2081037738,
    mysticSlow: 1102081447,
    durationExtender: 2951612397,
    compressCooldown: 380806748,
    toxicBullets: 3696726732,
    berserker: 1414319208,
    pointBlank: 2095565695,
    counterspell: 1414025773,
    metalSkin: 1378931225,
    fortitude: 3585132399,
    tankbuster: 2121044373,
    superiorCooldown: 3261353684,
    superiorDuration: 2717651715,
    ricochet: 2480592370,
    luckyShot: 1396247347,
    cripplingHeadshot: 3884003354,
    silencer: 1113837674,
    crushingFists: 800008313,
    leech: 865846625,
    unstoppable: 3357231760,
    phantomStrike: 1371725689,
    colossus: 2407781327,
    escalatingExposure: 3005970438,
    boundlessSpirit: 2519598785,
    etherealShift: 2533252781,
    mysticReverb: 3577481646,
    echoShard: 630839635,
    cursedRelic: 2617435668,
} as const;

type Slot = number | [number, Partial<ModEntryView>];

function category(name: string, columns: number, slots: readonly Slot[], extra: Partial<ModCategoryView> = {}) {
    const mods = slots.map((slot): ModEntryView => {
        const [abilityId, more] = typeof slot === "number" ? [slot, {}] : slot;
        const empty = { annotation: null, requiredFlexSlots: null, sellPriority: null, imbueTargetAbilityId: null };
        return { abilityId, ...empty, ...more };
    });
    const height = mods.length <= columns ? ONE_ROW_HEIGHT : null;
    return { name, description: "", width: WIDTH_FOR_COLUMNS[columns]!, height, optional: false, mods, ...extra };
}

/**
 * `steps` names ability slots 1-4: `u2` unlocks slot 2, a bare `2` buys its next tier. Tiers cost 1, 2 and 5
 * ability points, as the game charges them.
 */
function abilityOrder(heroId: number, steps: string): CurrencyChangeView[] {
    const abilities = ABILITIES[heroId]!;
    const tiers = [0, 0, 0, 0];
    return steps.split(" ").map((step) => {
        const unlock = step.startsWith("u");
        const slot = Number(unlock ? step.slice(1) : step) - 1;
        const abilityId = abilities[slot]!;
        if (unlock) return { abilityId, currencyType: 2, delta: -1, annotation: null };
        return { abilityId, currencyType: 1, delta: [-1, -2, -5][tiers[slot]!++]!, annotation: null };
    });
}

interface Template {
    heroId: number;
    modCategories: ModCategoryView[];
    abilityOrder: CurrencyChangeView[];
}

const SITUATIONAL = { optional: true, description: "Buy into what they build." };

const TEMPLATES = {
    spiritInfernus: {
        heroId: INFERNUS,
        modCategories: [
            category("Lane", 2, [
                ITEM.extraSpirit,
                [ITEM.extraCharge, { imbueTargetAbilityId: ABILITIES[INFERNUS]![1]! }],
                [ITEM.extraHealth, { sellPriority: 1 }],
                ITEM.mysticRegeneration,
            ]),
            category("Mid game", 4, [
                ITEM.improvedSpirit,
                [ITEM.mysticVulnerability, { annotation: "Rush it on a winning lane" }],
                ITEM.spiritLifesteal,
                ITEM.enduringSpeed,
            ]),
            category("Late game", 3, [
                ITEM.tankbuster,
                ITEM.superiorCooldown,
                ITEM.escalatingExposure,
                ITEM.boundlessSpirit,
                ITEM.leech,
            ]),
            category("Situational", 3, [ITEM.counterspell, ITEM.unstoppable, ITEM.etherealShift], SITUATIONAL),
        ],
        abilityOrder: abilityOrder(INFERNUS, "u3 u1 3 u2 1 u4 3 1 4 3 1 4 4 2 2 2"),
    },
    gunHaze: {
        heroId: HAZE,
        modCategories: [
            category("Lane", 2, [ITEM.highVelocityRounds, ITEM.headshotBooster, ITEM.extraStamina, ITEM.monsterRounds]),
            category("Mid game", 4, [
                ITEM.swiftStriker,
                ITEM.kineticDash,
                ITEM.bulletLifesteal,
                ITEM.intensifyingMagazine,
            ]),
            category("Late game", 3, [
                ITEM.toxicBullets,
                ITEM.berserker,
                ITEM.ricochet,
                ITEM.luckyShot,
                [ITEM.cripplingHeadshot, { annotation: "Before Bullet Dance fights" }],
                ITEM.silencer,
            ]),
            category("Situational", 3, [ITEM.counterspell, ITEM.metalSkin, ITEM.phantomStrike], SITUATIONAL),
        ],
        abilityOrder: abilityOrder(HAZE, "u1 u3 3 u2 3 u4 4 3 4 1 4 2 1 1 2 2"),
    },
    spiritHaze: {
        heroId: HAZE,
        modCategories: [
            category("Lane", 3, [ITEM.extraSpirit, ITEM.spiritStrike, ITEM.extraStamina]),
            category("Mid game", 4, [
                ITEM.improvedSpirit,
                ITEM.mysticSlow,
                ITEM.durationExtender,
                ITEM.compressCooldown,
            ]),
            category("Late game", 2, [ITEM.superiorDuration, ITEM.superiorCooldown, ITEM.mysticReverb, ITEM.echoShard]),
        ],
        abilityOrder: abilityOrder(HAZE, "u1 u2 1 u3 1 u4 1 2 4 2 4 3 4 2 3 3"),
    },
    spiritKelvin: {
        heroId: KELVIN,
        modCategories: [
            category("Lane", 3, [ITEM.extraSpirit, ITEM.extraCharge, ITEM.mysticRegeneration, ITEM.extraStamina]),
            category("Mid game", 4, [
                ITEM.improvedSpirit,
                ITEM.mysticSlow,
                [ITEM.compressCooldown, { annotation: "Before the first Ice Path fights" }],
                ITEM.spiritLifesteal,
            ]),
            category("Late game", 3, [
                ITEM.superiorCooldown,
                ITEM.superiorDuration,
                ITEM.escalatingExposure,
                ITEM.boundlessSpirit,
                ITEM.echoShard,
            ]),
            category("Situational", 3, [ITEM.counterspell, ITEM.unstoppable, ITEM.etherealShift], SITUATIONAL),
        ],
        abilityOrder: abilityOrder(KELVIN, "u1 u2 1 u3 1 u4 1 2 4 2 4 3 4 2 3 3"),
    },
    frostWallKelvin: {
        heroId: KELVIN,
        modCategories: [
            category("Lane", 2, [ITEM.extraHealth, ITEM.extraRegen, ITEM.healingRite, ITEM.extraSpirit]),
            category("Mid game", 4, [
                ITEM.enduringSpeed,
                ITEM.spiritShielding,
                ITEM.spiritLifesteal,
                ITEM.improvedSpirit,
            ]),
            category("Late game", 3, [ITEM.fortitude, ITEM.tankbuster, ITEM.leech, ITEM.superiorDuration]),
        ],
        abilityOrder: abilityOrder(KELVIN, "u2 u1 2 u3 2 u4 2 1 4 1 4 3 4 1 3 3"),
    },
    gunKelvin: {
        heroId: KELVIN,
        modCategories: [
            category("Lane", 2, [ITEM.extendedMagazine, ITEM.headshotBooster, ITEM.extraHealth, ITEM.extraStamina]),
            category("Mid game", 4, [
                ITEM.swiftStriker,
                ITEM.intensifyingMagazine,
                ITEM.bulletLifesteal,
                ITEM.kineticDash,
            ]),
            category("Late game", 3, [ITEM.toxicBullets, ITEM.berserker, ITEM.luckyShot, ITEM.ricochet, ITEM.silencer]),
            category("Situational", 2, [ITEM.metalSkin, ITEM.counterspell], SITUATIONAL),
        ],
        abilityOrder: abilityOrder(KELVIN, "u3 u1 3 u2 3 u4 3 1 4 1 4 2 4 1 2 2"),
    },
    brawlerAbrams: {
        heroId: ABRAMS,
        modCategories: [
            category("Lane", 3, [
                ITEM.extraHealth,
                ITEM.meleeLifesteal,
                ITEM.closeQuarters,
                ITEM.extraRegen,
                ITEM.healingRite,
            ]),
            category("Mid game", 4, [ITEM.enduringSpeed, ITEM.bulletLifesteal, ITEM.spiritShielding, ITEM.meleeCharge]),
            category("Late game", 3, [
                ITEM.pointBlank,
                ITEM.fortitude,
                [ITEM.crushingFists, { requiredFlexSlots: 1 }],
                ITEM.colossus,
                ITEM.leech,
                ITEM.unstoppable,
            ]),
        ],
        abilityOrder: abilityOrder(ABRAMS, "u2 u1 2 u3 1 u4 2 1 4 2 1 4 4 3 3 3"),
    },
} satisfies Record<string, Template>;

function view(template: Template, fields: Partial<BuildView> & Pick<BuildView, "heroBuildId" | "name">): BuildView {
    return {
        heroId: template.heroId,
        authorAccountId: 0,
        lastUpdatedTimestamp: null,
        description: "",
        language: 0,
        version: 0,
        originBuildId: null,
        modCategories: template.modCategories,
        abilityOrder: template.abilityOrder,
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
        ...fields,
    };
}

/** A row of the Deadlock API's `/v1/builds`, as `@deadlock-plus/deadlock-api` reads it. */
interface ApiBuild {
    hero_build: {
        hero_id: number;
        hero_build_id: number;
        author_account_id: number;
        name: string;
        language: number;
        version: number;
        origin_build_id: number;
        details: {
            ability_order: {
                currency_changes: {
                    ability_id: number;
                    currency_type: number;
                    delta: number;
                    annotation: string | null;
                }[];
            };
            mod_categories: {
                name: string;
                description: string;
                width: number | null;
                height: number | null;
                optional: boolean;
                mods: {
                    ability_id: number;
                    annotation: string | null;
                    imbue_target_ability_id: number | null;
                    required_flex_slots: number | null;
                    sell_priority: number | null;
                }[];
            }[];
        };
        description: string;
        development_build: boolean;
        last_updated_timestamp: number | null;
        publish_timestamp: number | null;
        tags: number[];
    };
    num_favorites: number;
    num_ignores: number;
    num_reports: number;
    num_weekly_favorites: number;
    rollup_category: number;
}

interface Counts {
    favorites: number;
    weekly: number;
    ignores: number;
    reports: number;
}

function apiRow(build: BuildView, counts: Counts): ApiBuild {
    return {
        hero_build: {
            hero_id: build.heroId,
            hero_build_id: build.heroBuildId,
            author_account_id: build.authorAccountId,
            name: build.name,
            language: build.language,
            version: build.version,
            origin_build_id: build.originBuildId ?? 0,
            details: {
                ability_order: {
                    currency_changes: build.abilityOrder.map((step) => ({
                        ability_id: step.abilityId,
                        currency_type: step.currencyType,
                        delta: step.delta,
                        annotation: step.annotation,
                    })),
                },
                mod_categories: build.modCategories.map((c) => ({
                    name: c.name,
                    description: c.description,
                    width: c.width,
                    height: c.height,
                    optional: c.optional,
                    mods: c.mods.map((m) => ({
                        ability_id: m.abilityId,
                        annotation: m.annotation,
                        imbue_target_ability_id: m.imbueTargetAbilityId,
                        required_flex_slots: m.requiredFlexSlots,
                        sell_priority: m.sellPriority,
                    })),
                })),
            },
            description: build.description,
            development_build: build.developmentBuild,
            last_updated_timestamp: build.lastUpdatedTimestamp,
            publish_timestamp: build.publishTimestamp,
            tags: build.tags,
        },
        num_favorites: counts.favorites,
        num_ignores: counts.ignores,
        num_reports: counts.reports,
        num_weekly_favorites: counts.weekly,
        rollup_category: 0,
    };
}

const FAVOURITED_ID = 381204;
const OWN_PUBLISHED_ID = 402117;

interface Published {
    build: BuildView;
    counts: Counts;
}

/** Published builds of four heroes; one is the player's own. Languages use Steam's numbers (0 English, 1 German, 8 Russian). */
function publishedBuilds(identity: Identity, nowS: number): Published[] {
    const ago = (days: number) => nowS - days * DAY_S;
    const by = (index: number) => fakeAccountId(identity, index);
    const published = (
        template: Template,
        id: number,
        name: string,
        author: number,
        [version, publishedDays, updatedDays]: [number, number, number],
        counts: Counts,
        fields: Partial<BuildView> = {},
    ): Published => ({
        build: view(template, {
            heroBuildId: id,
            name,
            authorAccountId: author,
            version,
            publishTimestamp: ago(publishedDays),
            lastUpdatedTimestamp: ago(updatedDays),
            ...fields,
        }),
        counts,
    });
    return [
        published(TEMPLATES.gunHaze, FAVOURITED_ID, "Bullet Dance Crit", by(0), [14, 61, 3], {
            favorites: 9812,
            weekly: 412,
            ignores: 210,
            reports: 3,
        }),
        published(TEMPLATES.spiritHaze, 377455, "Sleepy Spirit Haze", by(3), [6, 120, 9], {
            favorites: 2304,
            weekly: 96,
            ignores: 88,
            reports: 1,
        }),
        published(
            TEMPLATES.gunHaze,
            390718,
            "Хейз через пушку",
            by(7),
            [3, 40, 12],
            { favorites: 811, weekly: 140, ignores: 19, reports: 0 },
            { language: 8, originBuildId: FAVOURITED_ID },
        ),
        published(
            TEMPLATES.spiritInfernus,
            OWN_PUBLISHED_ID,
            "Afterburn all day",
            identity.accountId,
            [4, 25, 6],
            { favorites: 37, weekly: 5, ignores: 2, reports: 0 },
            { description: "Spirit Infernus that lives on Afterburn uptime." },
        ),
        published(
            TEMPLATES.spiritInfernus,
            365990,
            "Burn Everything",
            by(1),
            [22, 160, 2],
            { favorites: 15420, weekly: 655, ignores: 402, reports: 6 },
            { description: "Stack spirit, keep Afterburn on everyone, never stop moving." },
        ),
        published(
            TEMPLATES.spiritInfernus,
            399301,
            "Infernus Flammenwerfer",
            by(9),
            [2, 30, 30],
            { favorites: 190, weekly: 21, ignores: 7, reports: 0 },
            { language: 1, originBuildId: 365990 },
        ),
        published(
            TEMPLATES.spiritKelvin,
            372846,
            "Absolute Zero",
            by(4),
            [11, 75, 5],
            { favorites: 7340, weekly: 318, ignores: 176, reports: 2 },
            { description: "Slow everything, then Ice Dome the fight you want." },
        ),
        published(TEMPLATES.frostWallKelvin, 384019, "Frost Wall", by(6), [7, 55, 8], {
            favorites: 2180,
            weekly: 87,
            ignores: 54,
            reports: 1,
        }),
        published(TEMPLATES.gunKelvin, 392266, "Kelvin Cold Bullets", by(8), [4, 35, 14], {
            favorites: 640,
            weekly: 73,
            ignores: 12,
            reports: 0,
        }),
        published(
            TEMPLATES.spiritKelvin,
            397745,
            "Kelvin lane bully",
            by(10),
            [2, 18, 1],
            { favorites: 96, weekly: 31, ignores: 3, reports: 0 },
            { originBuildId: 372846 },
        ),
        published(TEMPLATES.brawlerAbrams, 371112, "Brawler Abrams", by(2), [9, 90, 4], {
            favorites: 6022,
            weekly: 233,
            ignores: 150,
            reports: 2,
        }),
        published(TEMPLATES.brawlerAbrams, 394580, "Tank Abrams", by(5), [5, 50, 20], {
            favorites: 1400,
            weekly: 60,
            ignores: 31,
            reports: 0,
        }),
    ];
}

const LANGUAGES: Record<string, number> = { English: 0, German: 1, Russian: 8 };

const SORT_KEYS: Record<string, (row: ApiBuild) => number> = {
    weekly_favorites: (row) => row.num_weekly_favorites,
    favorites: (row) => row.num_favorites,
    ignores: (row) => row.num_ignores,
    reports: (row) => row.num_reports,
    updated_at: (row) => row.hero_build.last_updated_timestamp ?? 0,
    published_at: (row) => row.hero_build.publish_timestamp ?? 0,
    version: (row) => row.hero_build.version,
};

function buildsRoute(rows: readonly ApiBuild[]): ApiRoute {
    return [
        /^\/v1\/builds$/,
        (url) => {
            const q = url.searchParams;
            const number = (key: string) => (q.has(key) ? Number(q.get(key)) : undefined);
            const name = q.get("build_language");
            const language = name === null ? number("language") : (LANGUAGES[name] ?? -1);
            const filters: [number | undefined, (row: ApiBuild) => boolean][] = [
                [number("hero_id"), (row) => row.hero_build.hero_id === number("hero_id")],
                [number("author_id"), (row) => row.hero_build.author_account_id === number("author_id")],
                [number("build_id"), (row) => row.hero_build.hero_build_id === number("build_id")],
                [number("tag"), (row) => row.hero_build.tags.includes(number("tag")!)],
                [language, (row) => row.hero_build.language === language],
            ];
            const search = q.get("search_name")?.toLowerCase();
            if (search) filters.push([0, (row) => row.hero_build.name.toLowerCase().includes(search)]);
            const key = SORT_KEYS[q.get("sort_by") ?? "favorites"] ?? SORT_KEYS.favorites!;
            const direction = q.get("sort_direction") === "asc" ? 1 : -1;
            const start = number("start") ?? 0;
            return rows
                .filter((row) => filters.every(([value, test]) => value === undefined || test(row)))
                .sort((a, b) => direction * (key(a) - key(b)))
                .slice(start, start + (number("limit") ?? 100));
        },
    ];
}

/** FNV-1a: the demo's stand-in for a build's blob, so equal builds share a base and any change makes a new one. */
function hexHash(text: string): string {
    let out = "";
    for (const seed of [0x811c9dc5, 0x01000193, 0x5bd1e995, 0x27d4eb2f]) {
        let hash = seed >>> 0;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
        out += hash.toString(16).padStart(8, "0");
    }
    return out;
}

type Op =
    | { kind: "upsert"; section: BuildSection; build: BuildView; guard: BuildView | null; heroClass: string }
    | { kind: "delete"; section: BuildSection; id: number; guard: BuildView | null }
    | { kind: "favourite"; build: BuildView }
    | { kind: "unfavourite"; id: number };

interface Planned {
    label: string;
    buildId: number;
    ops: Op[];
}

interface Queued extends Planned {
    id: string;
    queuedAt: number;
}

interface StoredVersion {
    meta: BuildVersionMeta;
    build: BuildView;
}

function fail(code: string): never {
    throw { code: `builds.${code}`, params: {} };
}

export interface BuildsOptions {
    /** Deadlock is running, so every save waits in the queue. */
    gameRunning?: boolean;
    /** No build file yet, and the player has published nothing. */
    empty?: boolean;
}

/**
 * The player's `cached_hero_builds.kv3` and the app's queue, history and backups around it, plus the Deadlock
 * API's public builds. Saves change later answers within one install, as the real file would.
 */
export function builds({ gameRunning = false, empty = false }: BuildsOptions = {}): Module {
    return {
        name: "builds",
        create({ identity, now }) {
            const account = identity.accountId;
            const nowS = Math.floor(now / 1000);
            const clock = () => Math.floor(Date.now() / 1000);
            const backupDir = `C:\\Users\\${identity.persona}\\AppData\\Roaming\\app.deadlockplus\\builds\\backups\\${account}`;

            const published = publishedBuilds(identity, nowS).filter(
                (p) => !empty || p.build.authorAccountId !== account,
            );
            const publicBuild = (id: number) => published.find((p) => p.build.heroBuildId === id)?.build;

            const known = new Map<string, BuildView>();
            const baseOf = (build: BuildView): string => {
                const base = hexHash(JSON.stringify(build));
                known.set(base, build);
                return base;
            };
            const decode = (base: string): BuildView => known.get(base) ?? fail("bad_base");
            published.forEach((p) => baseOf(p.build));

            const entries: Record<BuildSection, BuildView[]> = { Favorites: [], Unpublished: [], SavedLastUsed: [] };
            const lastUsed = new Map<string, number>();
            const history = new Map<number, StoredVersion[]>();
            let backups: BuildBackup[] = [];
            let queue: Queued[] = [];
            let exists = !empty;
            // Oldest first, as the drafts file keeps them; listed newest first.
            let drafts: DraftView[] = [];
            let draftSeq = 0;
            const storeDraft = (draft: DraftView, at: number): DraftView => {
                const stored = {
                    ...draft,
                    id: draft.id || `draft-${++draftSeq}`,
                    updatedAt: at,
                    heroId: draft.build.heroId,
                };
                drafts = [...drafts.filter((d) => d.id !== stored.id), stored];
                return stored;
            };
            const dropDrafts = (gone: (draft: DraftView) => boolean): number => {
                const before = drafts.length;
                drafts = drafts.filter((d) => !gone(d));
                return before - drafts.length;
            };

            const recordVersion = (build: BuildView, savedAt: number) => {
                const versions = history.get(build.heroBuildId) ?? [];
                const seq = versions.filter((v) => v.meta.savedAt === savedAt).length;
                versions.push({ meta: { id: `${savedAt}-${seq}`, savedAt, name: build.name, note: null }, build });
                history.set(build.heroBuildId, versions.slice(-MAX_VERSIONS));
            };

            if (!empty) {
                const draft = (template: Template, id: number, name: string, days: number, fields = {}) =>
                    view(template, {
                        heroBuildId: id,
                        name,
                        authorAccountId: account,
                        lastUpdatedTimestamp: nowS - Math.round(days * DAY_S),
                        ...fields,
                    });
                const favourite = publicBuild(FAVOURITED_ID)!;
                const own = publicBuild(OWN_PUBLISHED_ID)!;
                const firstTry = draft(TEMPLATES.spiritInfernus, 3, "Infernus spirit", 4);
                entries.Unpublished = [
                    draft(TEMPLATES.spiritInfernus, 3, "Infernus test", 2),
                    draft(TEMPLATES.gunHaze, 5, "Bullet Dance Crit (copy)", 5, {
                        originBuildId: FAVOURITED_ID,
                        publishTimestamp: favourite.publishTimestamp,
                    }),
                    draft(TEMPLATES.brawlerAbrams, 7, "Abrams practice", 1 / 24),
                ];
                entries.Favorites = [{ ...favourite, favorited: true }];
                entries.SavedLastUsed = [
                    {
                        ...own,
                        lastUpdatedTimestamp: nowS - DAY_S,
                        modCategories: own.modCategories.map((c) => ({
                            ...c,
                            mods: c.mods.map((m) =>
                                m.abilityId === ITEM.leech ? { ...m, abilityId: ITEM.cursedRelic } : m,
                            ),
                        })),
                    },
                ];
                lastUsed.set("hero_inferno", OWN_PUBLISHED_ID).set("hero_haze", 5).set("hero_atlas", 7);
                recordVersion(firstTry, firstTry.lastUpdatedTimestamp!);
                recordVersion(entries.Unpublished[0]!, entries.Unpublished[0]!.lastUpdatedTimestamp!);
                const edited = entries.Unpublished[0]!;
                storeDraft(
                    {
                        id: "",
                        updatedAt: 0,
                        heroId: 0,
                        source: {
                            kind: "local",
                            section: "Unpublished",
                            buildId: edited.heroBuildId,
                            base: baseOf(edited),
                        },
                        build: { ...edited, name: "Infernus burst" },
                    },
                    nowS - 3600,
                );
                backups = [1, 3, 8].map((days) => {
                    const timestamp = nowS - days * DAY_S;
                    return { path: `${backupDir}\\cached_hero_builds-${timestamp}.kv3`, timestamp };
                });
            }

            const get = (section: BuildSection, id: number) => entries[section].find((b) => b.heroBuildId === id);
            const put = (section: BuildSection, build: BuildView) => {
                const rest = entries[section].filter((b) => b.heroBuildId !== build.heroBuildId);
                entries[section] = [...rest, build].sort((a, b) => a.heroBuildId - b.heroBuildId);
            };
            const remove = (section: BuildSection, id: number) => {
                entries[section] = entries[section].filter((b) => b.heroBuildId !== id);
            };

            const nextLocalId = (): number | null => {
                const local = (id: number) => id < LOCAL_ID_LIMIT;
                const fromFile = [...entries.Unpublished, ...entries.Favorites].map((b) => b.heroBuildId).filter(local);
                const queued = queue.flatMap((s) =>
                    s.ops.flatMap((op) =>
                        op.kind === "upsert" || op.kind === "favourite" ? [op.build.heroBuildId] : [],
                    ),
                );
                const next = Math.max(0, ...fromFile, ...queued.filter(local)) + 1;
                return next < LOCAL_ID_LIMIT ? next : null;
            };

            const heroClass = (heroId: number) => HERO_CLASSES.get(heroId) ?? fail("unknown_hero");

            const upsert = (section: BuildSection, guard: BuildView | null, build: BuildView): Planned => {
                const ops: Op[] = [];
                if (section === "SavedLastUsed") {
                    // The game keeps one `SavedLastUsed` entry per hero.
                    for (const other of entries.SavedLastUsed) {
                        if (other.heroBuildId !== build.heroBuildId && other.heroId === build.heroId) {
                            ops.push({ kind: "delete", section, id: other.heroBuildId, guard: other });
                        }
                    }
                }
                ops.push({ kind: "upsert", section, build, guard, heroClass: heroClass(build.heroId) });
                return { label: build.name, buildId: build.heroBuildId, ops };
            };

            const created = (fresh: Partial<BuildView>, build: BuildView): Planned => {
                const id = nextLocalId() ?? fail("no_local_id");
                const made: BuildView = {
                    ...build,
                    heroBuildId: id,
                    authorAccountId: account,
                    version: 0,
                    originBuildId: null,
                    publishTimestamp: null,
                    lastUpdatedTimestamp: clock(),
                    favorited: false,
                    ...fresh,
                };
                return upsert("Unpublished", null, made);
            };

            const planSave = (request: SaveRequest): Planned => {
                if (request.kind === "new") return created({}, request.build);
                if (request.kind === "copy" || request.kind === "copyView") {
                    const source = request.kind === "copy" ? decode(request.source) : request.build;
                    const originBuildId =
                        source.heroBuildId >= LOCAL_ID_LIMIT ? source.heroBuildId : source.originBuildId;
                    return created({ originBuildId, publishTimestamp: source.publishTimestamp }, request.build);
                }
                const base = decode(request.base);
                const build = { ...request.build, heroBuildId: base.heroBuildId, lastUpdatedTimestamp: clock() };
                // Published builds are edited through `SavedLastUsed`, the only place the game keeps local edits of them.
                const target = build.heroBuildId >= LOCAL_ID_LIMIT ? "SavedLastUsed" : request.section;
                const guard = target === request.section ? base : (get(target, build.heroBuildId) ?? null);
                return upsert(target, guard, build);
            };

            const conflictOf = (op: Op, saveId: string | null): ConflictView | null => {
                if (op.kind !== "upsert" && op.kind !== "delete") return null;
                const id = op.kind === "upsert" ? op.build.heroBuildId : op.id;
                const ours = op.kind === "upsert" ? op.build : null;
                const conflict = (section: BuildSection, game: BuildView | null): ConflictView => ({
                    saveId,
                    id,
                    section,
                    ours,
                    game,
                    base: op.guard,
                    gameBlob: game ? baseOf(game) : null,
                });
                const current = get(op.section, id) ?? null;
                const same = (a: BuildView | null, b: BuildView | null) =>
                    (a ? baseOf(a) : null) === (b ? baseOf(b) : null);
                if (!same(current, op.guard)) return same(current, ours) ? null : conflict(op.section, current);
                if (!op.guard && id < LOCAL_ID_LIMIT) {
                    for (const other of ["Unpublished", "Favorites"] as const) {
                        const taken = get(other, id);
                        if (taken) return conflict(other, taken);
                    }
                }
                return null;
            };

            const applyOps = (planned: Planned) => {
                for (const op of planned.ops) {
                    if (op.kind === "upsert") {
                        put(op.section, op.build);
                        lastUsed.set(op.heroClass, op.build.heroBuildId);
                    } else if (op.kind === "delete") remove(op.section, op.id);
                    else if (op.kind === "favourite") put("Favorites", op.build);
                    else remove("Favorites", op.id);
                }
            };

            const write = (planned: Planned, saveId: string | null = null): SaveResult => {
                const conflicts = planned.ops.flatMap((op) => conflictOf(op, saveId) ?? []);
                if (conflicts.length > 0) return { kind: "conflict", conflicts };
                const before = JSON.stringify([entries, [...lastUsed]]);
                applyOps(planned);
                if (exists && JSON.stringify([entries, [...lastUsed]]) === before) {
                    return { kind: "unchanged", buildId: planned.buildId };
                }
                const at = clock();
                let backup: string | null = null;
                if (exists) {
                    const taken = backups.filter((b) => b.timestamp === at).length;
                    backup = `${backupDir}\\cached_hero_builds-${at}${taken ? `-${taken}` : ""}.kv3`;
                    backups = [{ path: backup, timestamp: at }, ...backups].slice(0, MAX_BACKUPS);
                }
                exists = true;
                for (const op of planned.ops) {
                    if (op.kind === "upsert") recordVersion(op.build, at);
                    if (op.kind === "delete") history.delete(op.id);
                }
                return { kind: "written", buildId: planned.buildId, backup };
            };

            const submit = (planned: Planned): SaveResult => {
                if (!gameRunning) return write(planned);
                const queuedAt = clock();
                let n = 0;
                while (queue.some((s) => s.id === `${queuedAt}-${n}`)) n++;
                const id = `${queuedAt}-${n}`;
                queue.push({ ...planned, id, queuedAt });
                return { kind: "queued", id, buildId: planned.buildId };
            };

            const flush = (): FlushView => {
                if (gameRunning) return { kind: "gameRunning" };
                const buildIds: number[] = [];
                while (queue.length > 0) {
                    const save = queue[0]!;
                    const result = write(save, save.id);
                    if (result.kind === "conflict") return { kind: "conflict", conflicts: result.conflicts };
                    queue = queue.slice(1);
                    buildIds.push(save.buildId);
                }
                return { kind: "saved", buildIds };
            };

            if (gameRunning && !empty) {
                const practice = get("Unpublished", 7)!;
                queue.push({
                    ...upsert("Unpublished", practice, {
                        ...practice,
                        name: "Abrams practice 2",
                        lastUpdatedTimestamp: nowS - 600,
                    }),
                    id: `${nowS - 600}-0`,
                    queuedAt: nowS - 600,
                });
            }

            const listed = (): LocalBuilds => ({
                accountId: account,
                exists,
                gameRunning,
                builds: SECTIONS.flatMap((section) =>
                    entries[section].map((build): LocalBuild => ({
                        section,
                        build,
                        base: baseOf(build),
                        warnings: [],
                    })),
                ),
                lastUsed: [...HERO_CLASSES.values()].flatMap((heroClass) => {
                    const buildId = lastUsed.get(heroClass);
                    return buildId === undefined ? [] : [{ heroClass, buildId }];
                }),
                queue: queue.map(({ id, queuedAt, label, buildId }): QueuedSaveView => ({
                    id,
                    queuedAt,
                    label,
                    buildId,
                })),
                nextLocalId: nextLocalId(),
            });

            const handlers: Handlers = {
                builds_local: listed,
                builds_save: ({ request, draftId }) => {
                    const result = submit(planSave(request as SaveRequest));
                    if (result.kind === "written" || result.kind === "queued") {
                        dropDrafts(
                            (d) =>
                                d.id === draftId || (d.source.kind === "local" && d.source.buildId === result.buildId),
                        );
                    }
                    return result;
                },
                builds_drafts: (): DraftView[] => [...drafts].reverse(),
                builds_draft_save: ({ draft }) => storeDraft(draft as DraftView, clock()),
                builds_draft_delete: ({ id }) => dropDrafts((d) => d.id === id) > 0,
                builds_delete: ({ section, id, base }) => {
                    if (Number(id) >= LOCAL_ID_LIMIT) fail("published_delete_in_game");
                    const build = decode(String(base));
                    if (build.heroBuildId !== Number(id)) fail("bad_base");
                    const op: Op = { kind: "delete", section: section as BuildSection, id: Number(id), guard: build };
                    return submit({ label: build.name, buildId: build.heroBuildId, ops: [op] });
                },
                builds_favourite: ({ base, id, view }) => {
                    const published = view as BuildView | null | undefined;
                    if (typeof base !== "string" && published && published.heroBuildId < LOCAL_ID_LIMIT) {
                        fail("bad_base");
                    }
                    const source =
                        typeof base === "string"
                            ? decode(base)
                            : (published ??
                              (["Unpublished", "SavedLastUsed", "Favorites"] as const)
                                  .map((section) => get(section, Number(id)))
                                  .find(Boolean));
                    if (!source) fail("build_not_found");
                    const build = { ...source, favorited: true };
                    return submit({
                        label: build.name,
                        buildId: build.heroBuildId,
                        ops: [{ kind: "favourite", build }],
                    });
                },
                builds_unfavourite: ({ id }) => {
                    const label = get("Favorites", Number(id))?.name ?? "";
                    return submit({ label, buildId: Number(id), ops: [{ kind: "unfavourite", id: Number(id) }] });
                },
                builds_queue_cancel: ({ id }) => {
                    const left = queue.filter((s) => s.id !== id);
                    const found = left.length < queue.length;
                    queue = left;
                    return found;
                },
                builds_queue_resolve: ({ id, choice }) => {
                    const save = queue.find((s) => s.id === id);
                    if (save && choice === "game") queue = queue.filter((s) => s !== save);
                    if (save && choice === "ours") {
                        save.ops = save.ops.map((op): Op => {
                            if (op.kind === "upsert")
                                return { ...op, guard: get(op.section, op.build.heroBuildId) ?? null };
                            if (op.kind === "delete") return { ...op, guard: get(op.section, op.id) ?? null };
                            return op;
                        });
                    }
                    return flush();
                },
                builds_flush: flush,
                builds_history: ({ buildId }): BuildVersionMeta[] =>
                    (history.get(Number(buildId)) ?? []).map((v) => v.meta).reverse(),
                builds_history_get: ({ buildId, versionId }): BuildView =>
                    history.get(Number(buildId))?.find((v) => v.meta.id === versionId)?.build ??
                    fail("version_not_found"),
                builds_backups: (): BuildBackup[] => backups,
            };

            return { handlers, routes: [buildsRoute(published.map((p) => apiRow(p.build, p.counts)))] };
        },
    };
}

/** The default scenario's builds: the game is closed and the player has a few builds of three heroes. */
export const buildsModule: Module = builds();
