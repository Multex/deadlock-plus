use std::future::Future;

use dp_gamedata::{table_from_assets_map, AssetsMap, MapItemTable, MapItemsPayload, Resolved, TableSource};
use tokio::sync::OnceCell;

/// The Deadlock API's map items, fetched at most once per app run. A failed fetch is kept too: the
/// replay then draws no markers until the next run.
#[derive(Default)]
pub struct ApiMapItems(OnceCell<Option<MapItemTable>>);

fn parse_table(body: &str) -> Option<MapItemTable> {
    let map: AssetsMap = serde_json::from_str(body).ok()?;
    Some(table_from_assets_map(&map)).filter(|t| !t.rows.is_empty())
}

async fn fetch(http: &reqwest::Client) -> Option<MapItemTable> {
    let body = super::minimap::get_bytes(http, super::minimap::MAP_URL).await;
    let table = body.and_then(|b| String::from_utf8(b).ok()).and_then(|b| parse_table(&b));
    match &table {
        Some(t) => log::info!("map items: {} rows from the Deadlock API", t.rows.len()),
        None => log::warn!("map items: the Deadlock API gave no usable map items; the map shows no markers"),
    }
    table
}

async fn payload_or_api<F, Fut>(resolved: &Resolved, api: &ApiMapItems, fetch: F) -> MapItemsPayload
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Option<MapItemTable>>,
{
    if !resolved.table.rows.is_empty() {
        return MapItemsPayload::from(resolved);
    }
    match api.0.get_or_init(fetch).await {
        Some(table) => MapItemsPayload::from(&Resolved { table: table.clone(), source: TableSource::Api }),
        None => MapItemsPayload::from(&Resolved { table: MapItemTable::empty(), source: TableSource::None }),
    }
}

/// The resolved table, or the API's when the game, the cache and any stale cache all came up empty.
pub async fn map_items(resolved: &Resolved, api: &ApiMapItems, http: &reqwest::Client) -> MapItemsPayload {
    payload_or_api(resolved, api, || fetch(http)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use dp_gamedata::{MapItemKind, MapItemsSource};

    const RESPONSE: &str = include_str!("fixtures/assets_map.json");
    const GAME_TABLE: &str = include_str!("../../../../../../crates/ring2/dp-gamedata/fixtures/map_items.tsv");

    fn game_table() -> MapItemTable {
        MapItemTable::from_tsv(GAME_TABLE).unwrap()
    }

    fn resolved(source: TableSource, table: MapItemTable) -> Resolved {
        Resolved { table, source }
    }

    #[test]
    fn a_trimmed_live_response_converts_to_rows_of_every_listed_kind() {
        let table = parse_table(RESPONSE).expect("table");
        let count = |kind: MapItemKind| table.rows.iter().filter(|r| r.kind == kind).count();
        let expected = [
            (MapItemKind::Guardian, 6),
            (MapItemKind::Walker, 6),
            (MapItemKind::Patron, 2),
            (MapItemKind::CampWeak, 2),
            (MapItemKind::CampMedium, 2),
            (MapItemKind::CampStrong, 2),
            (MapItemKind::CampVault, 2),
            (MapItemKind::BaseSentry, 2),
            (MapItemKind::Shop, 2),
            (MapItemKind::UrnReturn, 2),
            (MapItemKind::Teleporter, 2),
            (MapItemKind::BuffSpawner, 2),
        ];
        for (kind, n) in expected {
            assert_eq!(count(kind), n, "{kind:?}");
        }
        assert_eq!(table.rows.len(), 32);
        assert!(table.lanes.is_empty());
    }

    #[test]
    fn api_objectives_land_within_the_api_rounding_of_the_decoded_game_rows() {
        let api = parse_table(RESPONSE).expect("table");
        let game = game_table();
        let objectives = [MapItemKind::Guardian, MapItemKind::Walker, MapItemKind::Patron];
        for row in api.rows.iter().filter(|r| objectives.contains(&r.kind)) {
            let twin = game
                .rows
                .iter()
                .find(|g| (g.kind, g.team, g.lane_slot) == (row.kind, row.team, row.lane_slot))
                .unwrap_or_else(|| panic!("no game row for {row:?}"));
            assert_eq!(twin.objective_id, row.objective_id, "{row:?}");
            let off = (twin.x - row.x).hypot(twin.y - row.y);
            // Four decimals of a 21504-unit map are about two units.
            assert!(off < 2.2, "{:?} team {:?} slot {:?} is {off} units off", row.kind, row.team, row.lane_slot);
        }
    }

    #[test]
    fn api_world_positions_match_the_decoded_game_rows() {
        let api = parse_table(RESPONSE).expect("table");
        let game = game_table();
        let positioned = |r: &dp_gamedata::MapItem| (r.kind, r.team, r.x as i32, r.y as i32);
        for row in api.rows.iter().filter(|r| r.objective_id.is_none()) {
            assert!(game.rows.iter().any(|g| positioned(g) == positioned(row)), "no game row at {row:?}");
        }
    }

    #[test]
    fn a_malformed_or_empty_response_gives_no_table() {
        assert!(parse_table("not json").is_none());
        assert!(parse_table("{}").is_none());
        assert!(parse_table(r#"{"neutral_camps":[{"kind":"weak","position":"here"}]}"#).is_none());
        assert!(
            parse_table(r#"{"objective_positions":{"team0_core":{"left_relative":0.1,"top_relative":0.1}}}"#).is_none()
        );
    }

    fn counting(calls: &AtomicUsize, result: Option<MapItemTable>) -> impl Future<Output = Option<MapItemTable>> + '_ {
        calls.fetch_add(1, Ordering::SeqCst);
        std::future::ready(result)
    }

    #[test]
    fn a_resolved_table_with_rows_is_served_without_fetching() {
        let api = ApiMapItems::default();
        let calls = AtomicUsize::new(0);
        let stale = resolved(TableSource::StaleCache { installed_build: Some(7) }, game_table());
        let payload =
            tauri::async_runtime::block_on(payload_or_api(&stale, &api, || counting(&calls, Some(game_table()))));
        assert_eq!((payload.source, payload.installed_build), (MapItemsSource::StaleCache, Some(7)));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn an_empty_resolution_falls_back_to_the_api_once_per_run() {
        let api = ApiMapItems::default();
        let calls = AtomicUsize::new(0);
        let none = resolved(TableSource::None, MapItemTable::empty());
        let from_api = parse_table(RESPONSE);
        for _ in 0..2 {
            let payload =
                tauri::async_runtime::block_on(payload_or_api(&none, &api, || counting(&calls, from_api.clone())));
            assert_eq!((payload.source, payload.installed_build), (MapItemsSource::Api, None));
            assert_eq!(payload.table.rows.len(), 32);
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_failed_fetch_gives_the_empty_table_and_is_not_retried() {
        let api = ApiMapItems::default();
        let calls = AtomicUsize::new(0);
        let none = resolved(TableSource::None, MapItemTable::empty());
        for _ in 0..2 {
            let payload = tauri::async_runtime::block_on(payload_or_api(&none, &api, || counting(&calls, None)));
            assert_eq!(payload.source, MapItemsSource::None);
            assert!(payload.table.rows.is_empty());
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    #[ignore = "reaches the live API"]
    fn the_live_map_endpoint_yields_a_table() {
        let table = tauri::async_runtime::block_on(fetch(&reqwest::Client::new())).expect("table");
        assert!(table.rows.len() > 50);
    }
}
