pub mod map_items;
pub mod minimap;

use std::path::PathBuf;
use std::sync::Arc;

use dp_gamedata::{ArtCache, HeroVdata, ShopVdata};
use tauri::{AppHandle, Emitter, Manager};

pub const ART_CHANGED_EVENT: &str = "game-art-changed";

/// The art store, emitting `ART_CHANGED_EVENT` when the game build changes during this run and when
/// background decoding of the shop UI art adds files, so pages already open pick them up.
pub fn art_cache(app: &AppHandle, root: PathBuf) -> ArtCache {
    let emit = |app: AppHandle| {
        move || {
            if let Err(e) = app.emit(ART_CHANGED_EVENT, ()) {
                log::warn!("could not emit {ART_CHANGED_EVENT}: {e}");
            }
        }
    };
    let cache = ArtCache::new(root).on_build_change(emit(app.clone()));
    // Warming only saves later decodes, so it gives the game its CPU and disk; art pages still decode on demand.
    let game = app.state::<crate::features::jobs::JobsState>().registry.game_flag();
    cache.warm_in_background(move || game.wait_while_running(), emit(app.clone()));
    cache
}

/// `heroes.vdata` and the shop, read from the installed game and kept until its build changes.
#[derive(Clone, Default)]
pub struct GameVdata {
    pub heroes: Arc<HeroVdata>,
    pub shop: Arc<ShopVdata>,
}

pub mod commands {
    use crate::command_panics::guarded;
    use std::sync::Arc;

    use dp_gamedata::{
        AbilityTooltip, AccoladeEntry, ArtCache, BuildTag, ClassArt, GameData, GameMapItems, GameUiStrings,
        HeroAbilities, HeroArt, HeroEntry, HeroImage, HeroProgression, HeroStatsData, ItemEntry, ItemImage, ItemStats,
        MapItemsPayload, MinimapIcon, MinimapIconArt, PopularItems, PropertyIconArt, RankArt, ShopItem, ShopUiArt,
    };
    use tauri::State;

    use super::map_items::ApiMapItems;
    use super::minimap::MinimapArtResult;
    use super::GameVdata;

    use crate::features::error::AppError;

    const RANK_TIERS: [u8; 12] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    #[tauri::command]
    pub async fn game_heroes(data: State<'_, GameData>, locale: String) -> Result<Vec<HeroEntry>, AppError> {
        guarded(async move {
            let data = data.inner().clone();
            let list =
                tauri::async_runtime::spawn_blocking(move || data.heroes(&locale)).await.map_err(AppError::internal)?;
            Ok(list.to_vec())
        })
        .await
    }

    #[tauri::command]
    pub async fn game_items(data: State<'_, GameData>, locale: String) -> Result<Vec<ItemEntry>, AppError> {
        guarded(async move {
            let data = data.inner().clone();
            let list =
                tauri::async_runtime::spawn_blocking(move || data.items(&locale)).await.map_err(AppError::internal)?;
            Ok(list.to_vec())
        })
        .await
    }

    #[tauri::command]
    pub async fn game_accolades(data: State<'_, GameData>, locale: String) -> Result<Vec<AccoladeEntry>, AppError> {
        guarded(async move {
            let data = data.inner().clone();
            let list = tauri::async_runtime::spawn_blocking(move || data.accolades(&locale))
                .await
                .map_err(AppError::internal)?;
            Ok(list.to_vec())
        })
        .await
    }

    /// Empty while the installed game cannot be read. `icon` is a local SVG file when the game has one.
    #[tauri::command]
    pub async fn game_build_tags(
        data: State<'_, GameData>,
        art: State<'_, ArtCache>,
        locale: String,
    ) -> Result<Vec<BuildTag>, AppError> {
        guarded(async move {
            let data = data.inner().clone();
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.build_tag_icons(&data.build_tags(&locale)))
                .await
                .map_err(AppError::internal)
        })
        .await
    }

    /// The game's own strings for the game-ui labels, by token. Empty while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_ui_strings(data: State<'_, GameData>, locale: String) -> Result<GameUiStrings, AppError> {
        guarded(async move {
            let data = data.inner().clone();
            let strings = tauri::async_runtime::spawn_blocking(move || data.ui_strings(&locale))
                .await
                .map_err(AppError::internal)?;
            Ok(strings.as_ref().clone())
        })
        .await
    }

    #[tauri::command]
    pub async fn game_hero_art(data: State<'_, GameData>, art: State<'_, ArtCache>) -> Result<Vec<HeroArt>, AppError> {
        guarded(async move {
            let data = data.inner().clone();
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.hero_art(&data.heroes("en")))
                .await
                .map_err(AppError::internal)
        })
        .await
    }

    /// The hero's backdrop PNG, decoded on the first ask. Null when the game cannot be read or has none for the hero.
    #[tauri::command]
    pub async fn game_hero_backdrop(
        data: State<'_, GameData>,
        art: State<'_, ArtCache>,
        hero_id: u32,
    ) -> Result<Option<String>, AppError> {
        guarded(async move {
            let data = data.inner().clone();
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let heroes = data.heroes("en");
                heroes.iter().find(|h| h.id == hero_id).and_then(|hero| art.hero_backdrop(hero))
            })
            .await
            .map_err(AppError::internal)
        })
        .await
    }

    #[derive(Debug, Clone, Copy, serde::Deserialize)]
    #[serde(rename_all = "lowercase")]
    pub enum HeroMood {
        Gloat,
        Critical,
    }

    /// The hero's smug or battered card PNG, decoded on the first ask. Null when the game cannot be read or has
    /// none for the hero.
    #[tauri::command]
    pub async fn game_hero_mood(
        data: State<'_, GameData>,
        art: State<'_, ArtCache>,
        hero_id: u32,
        mood: HeroMood,
    ) -> Result<Option<String>, AppError> {
        guarded(async move {
            let image = match mood {
                HeroMood::Gloat => HeroImage::CardGloat,
                HeroMood::Critical => HeroImage::CardCritical,
            };
            let data = data.inner().clone();
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let heroes = data.heroes("en");
                heroes.iter().find(|h| h.id == hero_id).and_then(|hero| art.hero_image(hero, image))
            })
            .await
            .map_err(AppError::internal)
        })
        .await
    }

    #[tauri::command]
    pub async fn game_rank_art(art: State<'_, ArtCache>) -> Result<Vec<RankArt>, AppError> {
        guarded(async move {
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.rank_art(&RANK_TIERS)).await.map_err(AppError::internal)
        })
        .await
    }

    #[tauri::command]
    pub async fn game_ability_art(art: State<'_, ArtCache>, names: Vec<String>) -> Result<Vec<ClassArt>, AppError> {
        guarded(async move {
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.ability_art(&names)).await.map_err(AppError::internal)
        })
        .await
    }

    #[tauri::command]
    pub async fn game_minimap_art(
        art: State<'_, ArtCache>,
        http: State<'_, crate::http::Http>,
    ) -> Result<MinimapArtResult, AppError> {
        guarded(async move { Ok(super::minimap::minimap_art(art.inner().clone(), &http.0).await) }).await
    }

    #[tauri::command]
    pub async fn game_minimap_icons(
        art: State<'_, ArtCache>,
        icons: Vec<MinimapIcon>,
    ) -> Result<Vec<MinimapIconArt>, AppError> {
        guarded(async move {
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.minimap_icons(&icons)).await.map_err(AppError::internal)
        })
        .await
    }

    /// Every shop UI image the installed game has, as local files; empty without an install.
    #[tauri::command]
    pub async fn game_shop_ui_art(art: State<'_, ArtCache>) -> Result<Vec<ShopUiArt>, AppError> {
        guarded(async move {
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.shop_ui_art()).await.map_err(AppError::internal)
        })
        .await
    }

    /// The icons the game's tooltips draw beside properties, status cells and description keywords, by icon
    /// class or keyword, as local files; empty without an install.
    #[tauri::command]
    pub async fn game_property_icon_art(art: State<'_, ArtCache>) -> Result<Vec<PropertyIconArt>, AppError> {
        guarded(async move {
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.property_icon_art()).await.map_err(AppError::internal)
        })
        .await
    }

    #[tauri::command]
    pub async fn game_map_items(
        items: State<'_, Arc<GameMapItems>>,
        api: State<'_, ApiMapItems>,
        http: State<'_, crate::http::Http>,
    ) -> Result<MapItemsPayload, AppError> {
        guarded(async move {
            let items = Arc::clone(items.inner());
            let resolved =
                tauri::async_runtime::spawn_blocking(move || items.resolve()).await.map_err(AppError::internal)?;
            Ok(super::map_items::map_items(&resolved, api.inner(), &http.0).await)
        })
        .await
    }

    #[tauri::command]
    pub async fn release_old_game_art(art: State<'_, ArtCache>) -> Result<(), AppError> {
        guarded(async move {
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.release_old_builds()).await.map_err(AppError::internal)
        })
        .await
    }

    #[tauri::command]
    pub async fn game_item_art(
        art: State<'_, ArtCache>,
        names: Vec<String>,
        kind: ItemImage,
    ) -> Result<Vec<ClassArt>, AppError> {
        guarded(async move {
            let art = art.inner().clone();
            tauri::async_runtime::spawn_blocking(move || art.item_art(&names, kind)).await.map_err(AppError::internal)
        })
        .await
    }

    /// Empty while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_shop_items(vdata: State<'_, GameVdata>) -> Result<Vec<ShopItem>, AppError> {
        guarded(async move {
            let shop = Arc::clone(&vdata.shop);
            let items = tauri::async_runtime::spawn_blocking(move || shop.items()).await.map_err(AppError::internal)?;
            Ok(items.map(|i| i.to_vec()).unwrap_or_default())
        })
        .await
    }

    /// Empty while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_item_stats(vdata: State<'_, GameVdata>, locale: String) -> Result<Vec<ItemStats>, AppError> {
        guarded(async move {
            let shop = Arc::clone(&vdata.shop);
            let stats = tauri::async_runtime::spawn_blocking(move || shop.item_stats(&locale))
                .await
                .map_err(AppError::internal)?;
            Ok(stats.map(|s| s.to_vec()).unwrap_or_default())
        })
        .await
    }

    /// What each hero ability's tooltip shows, by ability id. Empty while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_ability_tooltips(
        vdata: State<'_, GameVdata>,
        locale: String,
    ) -> Result<Vec<AbilityTooltip>, AppError> {
        guarded(async move {
            let shop = Arc::clone(&vdata.shop);
            let list = tauri::async_runtime::spawn_blocking(move || shop.ability_tooltips(&locale))
                .await
                .map_err(AppError::internal)?;
            Ok(list.map(|l| l.to_vec()).unwrap_or_default())
        })
        .await
    }

    /// No levels while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_hero_progression(vdata: State<'_, GameVdata>) -> Result<HeroProgression, AppError> {
        guarded(async move {
            let heroes = Arc::clone(&vdata.heroes);
            let table =
                tauri::async_runtime::spawn_blocking(move || heroes.table()).await.map_err(AppError::internal)?;
            Ok(table.map(|t| t.progression.clone()).unwrap_or(HeroProgression { levels: Vec::new() }))
        })
        .await
    }

    #[tauri::command]
    pub async fn game_hero_abilities(vdata: State<'_, GameVdata>) -> Result<Vec<HeroAbilities>, AppError> {
        guarded(async move {
            let heroes = Arc::clone(&vdata.heroes);
            let table =
                tauri::async_runtime::spawn_blocking(move || heroes.table()).await.map_err(AppError::internal)?;
            Ok(table.map(|t| t.ability_list()).unwrap_or_default())
        })
        .await
    }

    #[tauri::command]
    pub async fn game_popular_items(
        vdata: State<'_, GameVdata>,
        hero_id: u32,
    ) -> Result<Option<PopularItems>, AppError> {
        guarded(async move {
            let heroes = Arc::clone(&vdata.heroes);
            let table =
                tauri::async_runtime::spawn_blocking(move || heroes.table()).await.map_err(AppError::internal)?;
            Ok(table.and_then(|t| t.popular_items.get(&hero_id).cloned()))
        })
        .await
    }

    /// None for an unknown hero or while the installed game cannot be read.
    #[tauri::command]
    pub async fn game_hero_stats(vdata: State<'_, GameVdata>, hero_id: u32) -> Result<Option<HeroStatsData>, AppError> {
        guarded(async move {
            let heroes = Arc::clone(&vdata.heroes);
            let table =
                tauri::async_runtime::spawn_blocking(move || heroes.table()).await.map_err(AppError::internal)?;
            Ok(table.and_then(|t| t.stats.get(&hero_id).cloned()))
        })
        .await
    }

    /// One layer of a Dispatch video music track as MP3 bytes, read from the user's own install. The body is
    /// empty when the game or the file is missing, so the export goes silent.
    #[tauri::command]
    pub async fn dispatch_music_track(id: String, layer: usize) -> Result<tauri::ipc::Response, String> {
        guarded(async move {
            use dp_gamedata::{Install, SteamInstall};
            let bytes = tauri::async_runtime::spawn_blocking(move || {
                dp_gamedata::read_music_layer(SteamInstall.citadel_dir().as_deref(), &id, layer)
            })
            .await
            .map_err(|e| e.to_string())??;
            Ok(tauri::ipc::Response::new(bytes.unwrap_or_default()))
        })
        .await
    }

    /// The asked Dispatch video sound cues as MP3 bytes from the user's own install, in one body: per cue in
    /// order, a little-endian `u32` length then the bytes, 0 for a cue the game is missing. One call opens the
    /// archive once for every cue a video uses.
    #[tauri::command]
    pub async fn dispatch_sfx(cues: Vec<String>) -> Result<tauri::ipc::Response, String> {
        guarded(async move {
            use dp_gamedata::{Install, SteamInstall};
            let read = tauri::async_runtime::spawn_blocking(move || {
                dp_gamedata::read_sfx(SteamInstall.citadel_dir().as_deref(), &cues)
            })
            .await
            .map_err(|e| e.to_string())??;
            Ok(tauri::ipc::Response::new(dp_gamedata::sfx_body(&read)))
        })
        .await
    }
}
