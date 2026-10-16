pub mod minimap;

use std::path::PathBuf;

use dp_gamedata::ArtCache;
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

pub mod commands {
    use std::sync::Arc;

    use dp_gamedata::{
        AccoladeEntry, ArtCache, ClassArt, GameData, GameMapItems, HeroArt, HeroEntry, ItemEntry, ItemImage,
        MapItemsPayload, MinimapIcon, MinimapIconArt, RankArt,
    };
    use tauri::State;

    use super::minimap::MinimapArtResult;

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

    #[tauri::command]
    pub async fn game_map_items(items: State<'_, Arc<GameMapItems>>) -> Result<MapItemsPayload, AppError> {
        let items = Arc::clone(items.inner());
        tauri::async_runtime::spawn_blocking(move || MapItemsPayload::from(&*items.resolve()))
            .await
            .map_err(AppError::internal)
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
}
