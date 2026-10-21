pub mod map_items;
pub mod minimap;

use std::path::PathBuf;
use std::sync::Arc;

use dp_gamedata::{ArtCache, HeroVdata, ShopVdata};
use tauri::{AppHandle, Emitter};

pub const ART_CHANGED_EVENT: &str = "game-art-changed";

/// The art store, emitting `ART_CHANGED_EVENT` when the game build changes during this run.
pub fn art_cache(app: &AppHandle, root: PathBuf) -> ArtCache {
    let app = app.clone();
    ArtCache::new(root).on_build_change(move || {
        if let Err(e) = app.emit(ART_CHANGED_EVENT, ()) {
            log::warn!("could not emit {ART_CHANGED_EVENT}: {e}");
        }
    })
}

/// `heroes.vdata` and the shop, read from the installed game and kept until its build changes.
#[derive(Clone, Default)]
pub struct GameVdata {
    pub heroes: Arc<HeroVdata>,
    pub shop: Arc<ShopVdata>,
}

pub mod commands {
    use std::sync::Arc;

    use dp_gamedata::{
        AccoladeEntry, ArtCache, BuildTag, ClassArt, GameData, GameMapItems, HeroAbilities, HeroArt, HeroEntry,
        HeroProgression, ItemEntry, ItemImage, ItemStats, MapItemsPayload, MinimapIcon, MinimapIconArt, PopularItems,
        RankArt, ShopItem, ShopUiArt,
    };
    use tauri::State;

    use super::map_items::ApiMapItems;
    use super::minimap::MinimapArtResult;
    use super::GameVdata;

    use crate::features::error::AppError;

    const RANK_TIERS: [u8; 12] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    #[tauri::command]
    pub async fn game_heroes(data: State<'_, GameData>, locale: String) -> Result<Vec<HeroEntry>, AppError> {
        let data = data.inner().clone();
        let list =
            tauri::async_runtime::spawn_blocking(move || data.heroes(&locale)).await.map_err(AppError::internal)?;
        Ok(list.to_vec())
    }

    #[tauri::command]
    pub async fn game_items(data: State<'_, GameData>, locale: String) -> Result<Vec<ItemEntry>, AppError> {
        let data = data.inner().clone();
        let list =
            tauri::async_runtime::spawn_blocking(move || data.items(&locale)).await.map_err(AppError::internal)?;
        Ok(list.to_vec())
    }

    #[tauri::command]
    pub async fn game_accolades(data: State<'_, GameData>, locale: String) -> Result<Vec<AccoladeEntry>, AppError> {
        let data = data.inner().clone();
        let list =
            tauri::async_runtime::spawn_blocking(move || data.accolades(&locale)).await.map_err(AppError::internal)?;
        Ok(list.to_vec())
    }

    /// Empty while the installed game cannot be read. `icon` is a local SVG file when the game has one.
    #[tauri::command]
    pub async fn game_build_tags(
        data: State<'_, GameData>,
        art: State<'_, ArtCache>,
        locale: String,
    ) -> Result<Vec<BuildTag>, AppError> {
        let data = data.inner().clone();
        let art = art.inner().clone();
        tauri::async_runtime::spawn_blocking(move || art.build_tag_icons(&data.build_tags(&locale)))
            .await
            .map_err(AppError::internal)
    }

    #[tauri::command]
    pub async fn game_hero_art(data: State<'_, GameData>, art: State<'_, ArtCache>) -> Result<Vec<HeroArt>, AppError> {
        let data = data.inner().clone();
        let art = art.inner().clone();
        tauri::async_runtime::spawn_blocking(move || art.hero_art(&data.heroes("en"))).await.map_err(AppError::internal)
    }

    #[tauri::command]
    pub async fn game_rank_art(art: State<'_, ArtCache>) -> Result<Vec<RankArt>, AppError> {
        let art = art.inner().clone();
        tauri::async_runtime::spawn_blocking(move || art.rank_art(&RANK_TIERS)).await.map_err(AppError::internal)
    }

    #[tauri::command]
    pub async fn game_ability_art(art: State<'_, ArtCache>, names: Vec<String>) -> Result<Vec<ClassArt>, AppError> {
        let art = art.inner().clone();
        tauri::async_runtime::spawn_blocking(move || art.ability_art(&names)).await.map_err(AppError::internal)
    }

    #[tauri::command]
    pub async fn game_minimap_art(
        art: State<'_, ArtCache>,
        http: State<'_, crate::http::Http>,
    ) -> Result<MinimapArtResult, AppError> {
        Ok(super::minimap::minimap_art(art.inner().clone(), &http.0).await)
    }

    #[tauri::command]
    pub async fn game_minimap_icons(
        art: State<'_, ArtCache>,
        icons: Vec<MinimapIcon>,
    ) -> Result<Vec<MinimapIconArt>, AppError> {
        let art = art.inner().clone();
        tauri::async_runtime::spawn_blocking(move || art.minimap_icons(&icons)).await.map_err(AppError::internal)
    }

    /// Every shop UI image the installed game has, as local files; empty without an install.
    #[tauri::command]
    pub async fn game_shop_ui_art(art: State<'_, ArtCache>) -> Result<Vec<ShopUiArt>, AppError> {
        let art = art.inner().clone();
        tauri::async_runtime::spawn_blocking(move || art.shop_ui_art()).await.map_err(AppError::internal)
    }

    #[tauri::command]
    pub async fn game_map_items(
        items: State<'_, Arc<GameMapItems>>,
        api: State<'_, ApiMapItems>,
        http: State<'_, crate::http::Http>,
    ) -> Result<MapItemsPayload, AppError> {
        let items = Arc::clone(items.inner());
        let resolved =
            tauri::async_runtime::spawn_blocking(move || items.resolve()).await.map_err(AppError::internal)?;
        Ok(super::map_items::map_items(&resolved, api.inner(), &http.0).await)
    }

    #[tauri::command]
    pub async fn release_old_game_art(art: State<'_, ArtCache>) -> Result<(), AppError> {
        let art = art.inner().clone();
        tauri::async_runtime::spawn_blocking(move || art.release_old_builds()).await.map_err(AppError::internal)
    }

    #[tauri::command]
    pub async fn game_item_art(
        art: State<'_, ArtCache>,
        names: Vec<String>,
        kind: ItemImage,
    ) -> Result<Vec<ClassArt>, AppError> {
        let art = art.inner().clone();
        tauri::async_runtime::spawn_blocking(move || art.item_art(&names, kind)).await.map_err(AppError::internal)
    }

    /// Empty while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_shop_items(vdata: State<'_, GameVdata>) -> Result<Vec<ShopItem>, AppError> {
        let shop = Arc::clone(&vdata.shop);
        let items = tauri::async_runtime::spawn_blocking(move || shop.items()).await.map_err(AppError::internal)?;
        Ok(items.map(|i| i.to_vec()).unwrap_or_default())
    }

    /// Empty while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_item_stats(vdata: State<'_, GameVdata>, locale: String) -> Result<Vec<ItemStats>, AppError> {
        let shop = Arc::clone(&vdata.shop);
        let stats =
            tauri::async_runtime::spawn_blocking(move || shop.item_stats(&locale)).await.map_err(AppError::internal)?;
        Ok(stats.map(|s| s.to_vec()).unwrap_or_default())
    }

    /// No levels while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_hero_progression(vdata: State<'_, GameVdata>) -> Result<HeroProgression, AppError> {
        let heroes = Arc::clone(&vdata.heroes);
        let table = tauri::async_runtime::spawn_blocking(move || heroes.table()).await.map_err(AppError::internal)?;
        Ok(table.map(|t| t.progression.clone()).unwrap_or(HeroProgression { levels: Vec::new() }))
    }

    #[tauri::command]
    pub async fn game_hero_abilities(vdata: State<'_, GameVdata>) -> Result<Vec<HeroAbilities>, AppError> {
        let heroes = Arc::clone(&vdata.heroes);
        let table = tauri::async_runtime::spawn_blocking(move || heroes.table()).await.map_err(AppError::internal)?;
        Ok(table.map(|t| t.ability_list()).unwrap_or_default())
    }

    #[tauri::command]
    pub async fn game_popular_items(
        vdata: State<'_, GameVdata>,
        hero_id: u32,
    ) -> Result<Option<PopularItems>, AppError> {
        let heroes = Arc::clone(&vdata.heroes);
        let table = tauri::async_runtime::spawn_blocking(move || heroes.table()).await.map_err(AppError::internal)?;
        Ok(table.and_then(|t| t.popular_items.get(&hero_id).cloned()))
    }
}
