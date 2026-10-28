import { deadlockApi } from "$lib/core/deadlock-api";
import { failureText } from "$lib/core/errors";
import { i18n, t } from "$lib/core/i18n.svelte";
import { loadAbilityArt } from "$lib/features/gamedata/gamedata";
import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
import { playerNames } from "$lib/features/match-history/names";
import type { GameItem } from "@deadlock-plus/game-ui/item";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { QueuedSaveView } from "@deadlock-plus/ipc-types/QueuedSaveView";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import type { SaveResult } from "@deadlock-plus/ipc-types/SaveResult";
import { buildsDraftDelete, buildsDrafts, buildsFavourite, buildsLocal, buildsSave, buildsUnfavourite } from "./api";
import { chainCost, isInShop, loadShopCatalog, type ShopCatalog, type ShopItem } from "./catalog";
import { gameItem } from "./game-item";
import { loadLevelTable, netWorthFor, type Level } from "./levels";
import { LOCAL_ID_LIMIT, viewOfPublished, type MineStatus } from "./my-builds";

const ABILITY_POINTS = 1;
const ABILITY_UNLOCK = 2;
const ABILITY_SLOTS = 4;
const MAX_TIER = 3;

export type DetailSource = "public" | "local" | "draft";

export type DetailTarget = { source: "public" | "local"; id: number } | { source: "draft"; id: string };

export function parseTarget(params: URLSearchParams): DetailTarget | null {
    const source = params.get("source");
    const raw = params.get("id");
    if (source === "draft") return raw ? { source, id: raw } : null;
    if (source !== "public" && source !== "local") return null;
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? { source, id } : null;
}

const SECTION_ORDER: readonly LocalBuild["section"][] = ["Unpublished", "SavedLastUsed", "Favorites"];

/** A favourite of a build is a copy of it; the build's own section holds the one the player edits. */
export function pickLocal(builds: readonly LocalBuild[], id: number): LocalBuild | undefined {
    for (const section of SECTION_ORDER) {
        const found = builds.find((b) => b.section === section && b.build.heroBuildId === id);
        if (found) return found;
    }
    return undefined;
}

export type LocalStatus = Exclude<MineStatus, "draft">;

export function localStatus(
    local: Pick<LocalBuild, "section" | "build">,
    queue: readonly Pick<QueuedSaveView, "buildId">[],
): LocalStatus {
    const id = local.build.heroBuildId;
    if (queue.some((q) => q.buildId === id)) return "waiting";
    return local.section === "Unpublished" || id < LOCAL_ID_LIMIT ? "inGame" : "published";
}

const inShop = (item: ShopItem | undefined): item is ShopItem => !!item && isInShop(item);

/** Undefined for an item the shop no longer sells, which the grid flags as removed. */
export function chipFor(byId: ReadonlyMap<number, ShopItem>, abilityId: number): GameItem | undefined {
    const item = byId.get(abilityId);
    return inShop(item) ? gameItem(item) : undefined;
}

export interface CostLine {
    total: number;
    /** Items priced into `total`. */
    items: number;
    /** Items in any category that the shop no longer sells. */
    removed: number;
}

/** Quick Buy order: categories top to bottom, items left to right, optional categories left out. */
export function costLine(build: BuildView, byId: ReadonlyMap<number, ShopItem>): CostLine {
    let removed = 0;
    const order: number[] = [];
    for (const category of build.modCategories) {
        for (const mod of category.mods) {
            if (!inShop(byId.get(mod.abilityId))) removed++;
            else if (!category.optional) order.push(mod.abilityId);
        }
    }
    return { total: chainCost(byId, order).total, items: order.length, removed };
}

export interface AbilityStep {
    abilityId: number;
    kind: "unlock" | "upgrade";
    /** 0 for an unlock, 1-3 for an upgrade. */
    tier: number;
    /** Unlocks for an unlock, ability points for an upgrade. */
    cost: number;
    /** Net worth the hero has earned when this step is first affordable; null past the level table. */
    netWorth: number | null;
}

/**
 * Steps the game can take, in order. Many stored orders carry a leftover tail, often a second copy of
 * the order: from the first repeated or fifth unlock, or tier past 3, every step is left out, as the
 * backend's `leftover` warning reads it. Points on a locked ability are skipped.
 * Unlocks are read by currency, not delta: some builds store them with no points spent.
 */
export function abilitySteps(order: readonly CurrencyChangeView[], levels: readonly Level[]): AbilityStep[] {
    const tiers = new Map<number, number>();
    const steps: AbilityStep[] = [];
    let unlocks = 0;
    let points = 0;
    let floor = 0;
    let reachable = true;

    const netWorth = (reached: (level: Level) => boolean): number | null => {
        const level = reachable ? levels.find(reached) : undefined;
        if (!level) {
            reachable = false;
            return null;
        }
        floor = Math.max(floor, netWorthFor(level.souls));
        return floor;
    };

    for (const change of order) {
        const tier = tiers.get(change.abilityId);
        if (change.currencyType === ABILITY_UNLOCK) {
            if (tier !== undefined || unlocks >= ABILITY_SLOTS) break;
            unlocks++;
            tiers.set(change.abilityId, 0);
            const needed = unlocks;
            steps.push({
                abilityId: change.abilityId,
                kind: "unlock",
                tier: 0,
                cost: 1,
                netWorth: netWorth((l) => l.unlocks >= needed),
            });
        } else if (change.currencyType === ABILITY_POINTS) {
            if (tier === undefined) continue;
            if (tier >= MAX_TIER) break;
            const cost = Math.abs(change.delta);
            points += cost;
            tiers.set(change.abilityId, tier + 1);
            const needed = points;
            steps.push({
                abilityId: change.abilityId,
                kind: "upgrade",
                tier: tier + 1,
                cost,
                netWorth: netWorth((l) => l.ap >= needed),
            });
        }
    }
    return steps;
}

export const WARNING_CODES = ["unknown_ability", "free_unlock", "ultimate_early", "leftover", "invalid"] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

const isWarningCode = (code: string): code is WarningCode => (WARNING_CODES as readonly string[]).includes(code);

export function knownWarnings(codes: readonly string[]): WarningCode[] {
    return [...new Set(codes)].filter(isWarningCode);
}

export interface AbilityInfo {
    id: number;
    name: string;
    art?: string;
}

export interface HeroKit {
    abilities: ReadonlyMap<number, AbilityInfo>;
    ultimateId: number | null;
    levels: readonly Level[];
    /** Set when the kit could not be read: no abilities, and the ability order offers `retry`. */
    failed?: { retry: () => void };
}

/** Stands in for a kit that could not be read, so the ability order ends its loading state. */
export function failedKit(retry: () => void): HeroKit {
    return { abilities: new Map(), ultimateId: null, levels: [], failed: { retry } };
}

export async function loadKit(heroId: number): Promise<HeroKit> {
    const [heroes, items] = await Promise.all([deadlockApi.heroes(), deadlockApi.items()]);
    const hero = heroes.find((h) => h.id === heroId);
    const levels = await loadLevelTable(hero?.level_info);
    const slots = Array.from({ length: ABILITY_SLOTS }, (_, i) => hero?.items?.[`signature${i + 1}`]);
    const classes = slots.filter((c): c is string => !!c);
    const art = await loadAbilityArt(classes).catch((): Record<string, string> => ({}));
    const byClass = new Map(items.map((i) => [i.class_name, i]));
    const abilities = new Map<number, AbilityInfo>();
    for (const className of classes) {
        const row = byClass.get(className);
        if (row) abilities.set(row.id, { id: row.id, name: row.name, art: art[className] });
    }
    const ultimate = slots[ABILITY_SLOTS - 1];
    return {
        abilities,
        ultimateId: ultimate ? (byClass.get(ultimate)?.id ?? null) : null,
        levels: levels?.levels ?? [],
    };
}

export async function loadPublic(id: number): Promise<{ build: BuildView; favourites: number | null } | null> {
    const rows = await deadlockApi.builds({ buildId: id, onlyLatest: true });
    const newest = rows
        .filter((r) => r.hero_build.hero_build_id === id)
        .sort((a, b) => b.hero_build.version - a.hero_build.version)[0];
    return newest ? { build: viewOfPublished(newest), favourites: newest.num_favorites ?? null } : null;
}

const isFavourite = (builds: readonly LocalBuild[], id: number) =>
    builds.some((b) => b.section === "Favorites" && b.build.heroBuildId === id);

export type FavouriteState =
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "queued" }
    | { kind: "conflict" }
    | { kind: "failed"; message: string };

export type CopyState =
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "written"; buildId: number }
    | { kind: "queued" }
    | { kind: "conflict" }
    | { kind: "failed"; message: string };

export class BuildDetail {
    status = $state<"loading" | "missing" | "failed" | "ready">("loading");
    error = $state<string | null>(null);
    build = $state.raw<BuildView | null>(null);
    local = $state.raw<LocalBuild | null>(null);
    localStatus = $state<LocalStatus | null>(null);
    draft = $state.raw<DraftView | null>(null);
    /** Whether the build file holds this build in `Favorites`. */
    favourited = $state(false);
    favourite = $state.raw<FavouriteState>({ kind: "idle" });
    favourites = $state<number | null>(null);
    catalog = $state.raw<ShopCatalog | null>(null);
    catalogFailed = $state(false);
    hero = $state.raw<Hero | null>(null);
    kit = $state.raw<HeroKit | null>(null);
    author = $state<string | null>(null);
    copy = $state.raw<CopyState>({ kind: "idle" });

    constructor(readonly target: DetailTarget) {}

    get badge(): MineStatus | null {
        return this.draft ? "draft" : this.localStatus;
    }

    /** Only a published build: the game's favourite of a local build is a copy of it. */
    get canFavourite(): boolean {
        return !this.draft && !!this.build && this.build.heroBuildId >= LOCAL_ID_LIMIT;
    }

    async load(): Promise<void> {
        try {
            const target = this.target;
            if (target.source === "draft") {
                const draft = (await buildsDrafts()).find((d) => d.id === target.id);
                if (draft) {
                    this.draft = draft;
                    this.build = draft.build;
                }
            } else if (target.source === "public") {
                // The file only says whether the build is a favourite, so a failed read leaves it shown as not one.
                const [found, listed] = await Promise.all([loadPublic(target.id), buildsLocal().catch(() => null)]);
                if (found) {
                    this.build = found.build;
                    this.favourites = found.favourites;
                    this.favourited = !!listed && isFavourite(listed.builds, target.id);
                }
            } else {
                const listed = await buildsLocal();
                const local = pickLocal(listed.builds, target.id);
                if (local) {
                    this.local = local;
                    this.build = local.build;
                    this.localStatus = localStatus(local, listed.queue);
                    this.favourited = isFavourite(listed.builds, target.id);
                }
            }
        } catch (e) {
            this.error = failureText(e, t("builds.view.load_failed"));
            this.status = "failed";
            return;
        }
        const build = this.build;
        if (!build) {
            this.status = "missing";
            return;
        }
        this.status = "ready";

        void loadShopCatalog(i18n.locale).then(
            (catalog) => (this.catalog = catalog),
            () => (this.catalogFailed = true),
        );
        void loadHeroes([build.heroId]).then(
            (heroes) => (this.hero = heroes[build.heroId] ?? null),
            () => {},
        );
        this.loadHeroKit(build.heroId);
        void playerNames.resolve([build.authorAccountId]).then(
            (names) => (this.author = names.get(build.authorAccountId) ?? null),
            () => {},
        );
    }

    private loadHeroKit(heroId: number): void {
        this.kit = null;
        void loadKit(heroId).then(
            (kit) => (this.kit = kit),
            () => (this.kit = failedKit(() => this.loadHeroKit(heroId))),
        );
    }

    async copyAsNew(): Promise<void> {
        const build = this.build;
        if (!build || this.copy.kind === "saving") return;
        const copy = { ...build, name: t("builds.mine.copy_name", { name: build.name }) };
        const source = this.draft?.source;
        const base = this.local?.base ?? (source?.kind === "local" ? source.base : null);
        const request: SaveRequest =
            base !== null ? { kind: "copy", source: base, build: copy } : { kind: "copyView", build: copy };
        this.copy = { kind: "saving" };
        try {
            const result = await buildsSave(request);
            if (result.kind === "written" || result.kind === "unchanged") {
                this.copy = { kind: "written", buildId: result.buildId };
            } else if (result.kind === "queued") {
                this.copy = { kind: "queued" };
            } else {
                this.copy = { kind: "conflict" };
            }
        } catch (e) {
            this.copy = { kind: "failed", message: failureText(e, t("builds.view.copy_failed")) };
        }
    }

    async toggleFavourite(): Promise<void> {
        const build = this.build;
        if (!build || !this.canFavourite || this.favourite.kind === "saving") return;
        const adding = !this.favourited;
        this.favourite = { kind: "saving" };
        try {
            let result: SaveResult;
            if (!adding) result = await buildsUnfavourite(build.heroBuildId);
            else result = await buildsFavourite(this.local ? { base: this.local.base } : { view: build });
            if (result.kind === "written" || result.kind === "unchanged") {
                this.favourited = adding;
                this.favourite = { kind: "idle" };
            } else {
                this.favourite = { kind: result.kind };
            }
        } catch (e) {
            this.favourite = { kind: "failed", message: failureText(e, t("builds.mine.action_failed")) };
        }
    }

    async discardDraft(): Promise<void> {
        if (this.draft) await buildsDraftDelete(this.draft.id);
    }
}
