import { untrack } from "svelte";
import { i18n, t } from "$lib/core/i18n.svelte";
import { loadBuildTags } from "$lib/features/gamedata/vdata";
import type { GameItem } from "@deadlock-plus/game-ui/item";
import type { BuildTag } from "@deadlock-plus/ipc-types/BuildTag";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import { chipFor, failedKit, loadKit, type HeroKit } from "./build-detail.svelte";
import { coreItems } from "./build-list";
import { isInShop, loadShopCatalog, type ShopCatalog } from "./catalog";
import { describeTag, selectedTags, standardTags, type StandardTag, type TagInfo } from "./editor/details";

const kits = new Map<number, Promise<HeroKit>>();

/** One kit request per hero for the session; a failed one is forgotten so a later call asks again. */
function kitFor(heroId: number): Promise<HeroKit> {
    let pending = kits.get(heroId);
    if (!pending) {
        pending = loadKit(heroId);
        kits.set(heroId, pending);
        pending.catch(() => kits.delete(heroId));
    }
    return pending;
}

/** The shop catalog, tag names and hero kits the Builds page's lists and detail pane share. */
export class BuildLookups {
    gameTags = $state.raw<BuildTag[]>([]);
    standard = $state.raw<StandardTag[]>(standardTags([]));
    catalog = $state.raw<ShopCatalog | null>(null);
    catalogFailed = $state(false);
    kits = $state.raw<ReadonlyMap<number, HeroKit>>(new Map());

    start(): void {
        void loadBuildTags(i18n.locale).then((tags) => {
            this.gameTags = tags;
            this.standard = standardTags(tags);
        });
        void loadShopCatalog(i18n.locale).then(
            (catalog) => (this.catalog = catalog),
            () => (this.catalogFailed = true),
        );
    }

    /** Call from an effect; a hero's ability tags and ability order need its kit. */
    loadKits(heroIds: readonly (number | null)[]): void {
        untrack(() => {
            for (const id of new Set(heroIds)) {
                if (id === null || this.kits.has(id)) continue;
                void kitFor(id).then(
                    (kit) => (this.kits = new Map([...this.kits, [id, kit]])),
                    () => (this.kits = new Map([...this.kits, [id, failedKit(() => this.retryKit(id))]])),
                );
            }
        });
    }

    private retryKit(heroId: number): void {
        const kits = new Map(this.kits);
        kits.delete(heroId);
        this.kits = kits;
        this.loadKits([heroId]);
    }

    chip = (abilityId: number): GameItem | undefined =>
        this.catalog ? chipFor(this.catalog.byId, abilityId) : undefined;

    core(build: BuildView | null): GameItem[] {
        const byId = this.catalog?.byId;
        if (!build || !byId) return [];
        const cost = (id: number) => {
            const item = byId.get(id);
            return item && isInShop(item) ? item.cost : undefined;
        };
        return coreItems(build, cost).flatMap((id) => this.chip(id) ?? []);
    }

    tags(build: BuildView | null): TagInfo[] {
        if (!build) return [];
        const items = this.catalog?.byId;
        const abilities = this.kits.get(build.heroId)?.abilities;
        return selectedTags(build.tags).map((id) => describeTag(id, { standard: this.standard, items, abilities }));
    }
}

export function tagLabel(tag: TagInfo): string {
    switch (tag.kind) {
        case "standard":
            return tag.name ?? t(`builds.editor.details.tag_${tag.key}`);
        case "ability":
        case "item":
            return tag.name;
        case "unknown":
            return t("builds.editor.details.tag_unknown", { id: tag.id });
    }
}
