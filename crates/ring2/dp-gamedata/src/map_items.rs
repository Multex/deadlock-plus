use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::art::MINIMAP_RADIUS;
use crate::catalog::{Install, SteamInstall};

pub const MAP_ITEMS_SCHEMA: u32 = 2;

const CACHE_FILE: &str = "map-items.tsv";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum MapItemKind {
    Guardian,
    Walker,
    Patron,
    Shrine,
    BaseGuardian,
    BaseSentry,
    MidBoss,
    CampWeak,
    CampMedium,
    CampStrong,
    CampVault,
    Shop,
    SoulsDealer,
    UrnReturn,
    Teleporter,
    BuffSpawner,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MapItem {
    pub kind: MapItemKind,
    /// 0 is The Hidden King, 1 is The Archmother, `None` is neutral.
    pub team: Option<u8>,
    /// Objective lane slot as the match API numbers it: 1, 3 or 4.
    pub lane_slot: Option<u8>,
    /// `ECitadelTeamObjective` where one exists.
    pub objective_id: Option<u8>,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub class_name: String,
    pub subclass: Option<String>,
    pub name: Option<String>,
    pub has_icon: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MapItemTable {
    pub schema: u32,
    pub build_id: Option<u64>,
    pub vents_crc: u32,
    pub rows: Vec<MapItem>,
    pub lanes: Vec<LaneLine>,
}

/// One `lane_marker_path` spline, base to base. Four of them (marker slots 0 to 3) lie side by side
/// in each lane.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LaneLine {
    /// Player lane id: 1 Yellow, 4 Blue, 6 Green.
    pub lane_num: u8,
    /// Objective lane slot as the match API numbers it: 1, 3 or 4.
    pub lane_slot: u8,
    /// The map's `LaneSlot` of the marker, 0 to 3.
    pub marker_slot: u8,
    /// The team whose base the first node is in (0 Hidden King, 1 Archmother); the last node is in
    /// the other team's base. `None` when the table holds no patron to compare against.
    pub start_team: Option<u8>,
    /// Node index at half the path's length in the ground plane. Nodes up to and including it belong
    /// to `start_team`'s half, the rest to the other team's.
    pub mid_index: u32,
    /// World positions, base to base.
    pub nodes: Vec<[f32; 3]>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TableSource {
    Game,
    Cache,
    /// The game files could not be read; the rows were decoded from an earlier build, or from an
    /// install that is no longer found (`installed_build` is then `None`).
    StaleCache {
        installed_build: Option<u64>,
    },
    /// Converted from the Deadlock API's map assets. Set by the caller that fetched them.
    Api,
    /// Nothing usable: the table is empty.
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum MapItemsSource {
    Game,
    Cache,
    StaleCache,
    Api,
    None,
}

/// What the frontend receives: the table plus where it came from.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MapItemsPayload {
    pub source: MapItemsSource,
    /// Set with `StaleCache`: the installed build the cached rows do not match.
    pub installed_build: Option<u64>,
    pub table: MapItemTable,
}

impl From<&Resolved> for MapItemsPayload {
    fn from(resolved: &Resolved) -> Self {
        let (source, installed_build) = match resolved.source {
            TableSource::Game => (MapItemsSource::Game, None),
            TableSource::Cache => (MapItemsSource::Cache, None),
            TableSource::StaleCache { installed_build } => (MapItemsSource::StaleCache, installed_build),
            TableSource::Api => (MapItemsSource::Api, None),
            TableSource::None => (MapItemsSource::None, None),
        };
        Self { source, installed_build, table: resolved.table.clone() }
    }
}

#[derive(Debug, Clone)]
pub struct Resolved {
    pub table: MapItemTable,
    pub source: TableSource,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawEntity {
    fields: BTreeMap<String, String>,
}

impl RawEntity {
    pub fn new<K: Into<String>, V: Into<String>>(fields: impl IntoIterator<Item = (K, V)>) -> Self {
        Self { fields: fields.into_iter().map(|(k, v)| (k.into(), v.into())).collect() }
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.fields.get(key).map(String::as_str)
    }
}

pub struct ExtractedVents {
    pub crc: u32,
    pub entities: Vec<RawEntity>,
}

pub trait VentsSource: Send + Sync + 'static {
    fn extract(&self, citadel_dir: &Path) -> Result<ExtractedVents, String>;
}

pub struct NoExtractor;

impl VentsSource for NoExtractor {
    fn extract(&self, _citadel_dir: &Path) -> Result<ExtractedVents, String> {
        Err("reading map files is not available in this build".into())
    }
}

const MAP_ARCHIVE: &str = "maps/dl_midtown.vpk";
const MAP_ENTITIES_ENTRY: &str = "maps/dl_midtown/entities/default_ents.vents_c";

/// Reads the entity lump of the Midtown map out of the installed game.
pub struct VpkVentsSource;

impl VentsSource for VpkVentsSource {
    fn extract(&self, citadel_dir: &Path) -> Result<ExtractedVents, String> {
        deadlock_data::map::entities(citadel_dir, MAP_ARCHIVE, MAP_ENTITIES_ENTRY)
            .map(extracted_from_map)
            .map_err(|e| e.to_string())
    }
}

fn extracted_from_map(map: deadlock_data::map::MapEntities) -> ExtractedVents {
    // The archive keeps the map compiler's key case (`LaneNum`, `BossName`); the mapping rules key on
    // lowercase names.
    let entities = map
        .entities
        .into_iter()
        .map(|fields| RawEntity::new(fields.into_iter().map(|(k, v)| (k.to_ascii_lowercase(), v))))
        .collect();
    ExtractedVents { crc: map.crc, entities }
}

pub fn map_entities<'a>(entities: impl IntoIterator<Item = &'a RawEntity>) -> Vec<MapItem> {
    let mut rows: Vec<MapItem> = entities.into_iter().filter_map(map_entity).collect();
    sort_rows(&mut rows);
    rows
}

fn sort_rows(rows: &mut [MapItem]) {
    rows.sort_by(|a, b| {
        (a.kind, a.team, a.lane_slot)
            .cmp(&(b.kind, b.team, b.lane_slot))
            .then(a.x.total_cmp(&b.x))
            .then(a.y.total_cmp(&b.y))
            .then(a.z.total_cmp(&b.z))
    });
}

/// The parts of the Deadlock API's `GET /v1/assets/map` that carry map item positions. Every field
/// is optional so that a change elsewhere in the response does not cost the rows that still parse.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct AssetsMap {
    pub radius: Option<f32>,
    pub objective_positions: BTreeMap<String, AssetsRelativePosition>,
    pub neutral_camps: Vec<AssetsCamp>,
    pub entities: AssetsEntities,
}

/// Fractions of the minimap image, from its left and top edges.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct AssetsRelativePosition {
    pub left_relative: f32,
    pub top_relative: f32,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AssetsCamp {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    /// World position.
    pub position: [f32; 3],
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(default)]
pub struct AssetsEntities {
    pub base_sentries: Vec<AssetsEntity>,
    pub teleporters: Vec<AssetsEntity>,
    pub soul_urn_pads: Vec<AssetsEntity>,
    pub shops: Vec<AssetsEntity>,
    pub bridge_buffs: Vec<AssetsEntity>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AssetsEntity {
    /// World position.
    pub position: [f32; 3],
    #[serde(default)]
    pub team: Option<i64>,
    #[serde(default)]
    pub kind: Option<String>,
}

/// The map items the API knows about, as a table. It has no lane lines and lacks the kinds the API
/// does not list (base guardians, shrines, the mid boss, souls dealers); unknown kinds are skipped.
pub fn table_from_assets_map(map: &AssetsMap) -> MapItemTable {
    let radius = map.radius.filter(|r| r.is_finite() && *r > 0.0).unwrap_or(MINIMAP_RADIUS);
    let mut rows: Vec<MapItem> =
        map.objective_positions.iter().filter_map(|(key, pos)| objective_row(key, *pos, radius)).collect();
    rows.extend(map.neutral_camps.iter().filter_map(camp_row));

    let entities = &map.entities;
    let neutral = |kind: MapItemKind, class: &str, list: &[AssetsEntity]| -> Vec<MapItem> {
        list.iter().filter_map(|e| api_row(kind, class, e.position)).collect()
    };
    rows.extend(entities.base_sentries.iter().filter_map(|e| {
        Some(MapItem {
            team: api_team(e.team),
            ..api_row(MapItemKind::BaseSentry, "npc_base_defense_sentry", e.position)?
        })
    }));
    rows.extend(entities.shops.iter().filter_map(|e| {
        // Base shops are not map markers, as with the game's own entities.
        let team = match e.kind.as_deref()? {
            "lane" | "secret" => api_team(e.team),
            _ => return None,
        };
        Some(MapItem { team, ..api_row(MapItemKind::Shop, "trigger_item_shop", e.position)? })
    }));
    rows.extend(neutral(MapItemKind::UrnReturn, "citadel_trigger_idol_return", &entities.soul_urn_pads));
    rows.extend(neutral(MapItemKind::Teleporter, "citadel_trigger_teleport", &entities.teleporters));
    rows.extend(neutral(MapItemKind::BuffSpawner, "citadel_item_powerup_spawner", &entities.bridge_buffs));

    sort_rows(&mut rows);
    MapItemTable { rows, ..MapItemTable::empty() }
}

/// The API places each objective by the top-left corner of a marker box a tenth of the map wide, so
/// the objective itself sits half a box further right and down. Measured against the game's own
/// positions: every guardian, walker and patron lands within the API's four-decimal rounding of them.
const OBJECTIVE_BOX_HALF: f32 = 0.05;

fn objective_row(key: &str, pos: AssetsRelativePosition, radius: f32) -> Option<MapItem> {
    let (team, rest) = key.strip_prefix("team")?.split_once('_')?;
    let team = match team {
        "0" => 0,
        "1" => 1,
        _ => return None,
    };
    let slot = |s: &str| match s {
        "1" => Some(1),
        "3" => Some(3),
        "4" => Some(4),
        _ => None,
    };
    // `core` is skipped: its two positions are not mirror images like the rest of the map, and match
    // no entity the game files hold.
    let (kind, class, lane_slot, objective_id) = match rest.split_once('_') {
        None if rest == "titan" => (MapItemKind::Patron, "npc_boss_tier3", 3, 9),
        Some(("tier1", s)) => (MapItemKind::Guardian, "info_super_trooper_spawn", slot(s)?, slot(s)?),
        Some(("tier2", s)) => (MapItemKind::Walker, "npc_boss_tier2", slot(s)?, slot(s)? + 4),
        _ => return None,
    };
    let x = (pos.left_relative + OBJECTIVE_BOX_HALF) * 2.0 * radius - radius;
    let y = radius - (pos.top_relative + OBJECTIVE_BOX_HALF) * 2.0 * radius;
    Some(MapItem {
        team: Some(team),
        lane_slot: Some(lane_slot),
        objective_id: Some(objective_id),
        ..api_row(kind, class, [x, y, 0.0])?
    })
}

fn camp_row(camp: &AssetsCamp) -> Option<MapItem> {
    let (kind, subclass) = match camp.kind.as_deref()? {
        "weak" => (MapItemKind::CampWeak, "neutral_camp_weak"),
        "medium" => (MapItemKind::CampMedium, "neutral_camp_medium"),
        "strong" => (MapItemKind::CampStrong, "neutral_camp_strong"),
        "vault" => (MapItemKind::CampVault, "neutral_camp_vaults"),
        _ => return None,
    };
    Some(MapItem {
        subclass: Some(subclass.to_owned()),
        name: camp.name.clone().filter(|n| !n.is_empty()),
        ..api_row(kind, "info_neutral_trooper_camp", camp.position)?
    })
}

/// A neutral row with the game's class name for its kind, so API rows read like decoded ones.
fn api_row(kind: MapItemKind, class: &str, [x, y, z]: [f32; 3]) -> Option<MapItem> {
    if !(x.is_finite() && y.is_finite() && z.is_finite()) {
        return None;
    }
    let round = |v: f32| (v * 10.0).round() / 10.0;
    Some(MapItem {
        kind,
        team: None,
        lane_slot: None,
        objective_id: None,
        x: round(x),
        y: round(y),
        z: round(z),
        class_name: class.to_owned(),
        subclass: None,
        name: None,
        has_icon: kind != MapItemKind::BaseSentry,
    })
}

fn api_team(team: Option<i64>) -> Option<u8> {
    match team {
        Some(0) => Some(0),
        Some(1) => Some(1),
        _ => None,
    }
}

fn map_entity(raw: &RawEntity) -> Option<MapItem> {
    let class = raw.get("classname")?;
    let team = match raw.get("teamnumber") {
        Some("2") => Some(0),
        Some("3") => Some(1),
        _ => None,
    };
    // LaneNum is the player lane id; objectives number lanes by slot instead.
    let lane_slot = match raw.get("lanenum") {
        Some("1") => Some(1),
        Some("4") => Some(3),
        Some("6") => Some(4),
        _ => None,
    };
    let subclass = raw.get("subclass_name").filter(|s| !s.is_empty());

    let (kind, lane_slot, objective_id) = match class {
        "info_super_trooper_spawn" => {
            // Blank boss names are the base player spawn points, not guardians.
            if raw.get("bossname").is_none_or(str::is_empty) {
                return None;
            }
            (MapItemKind::Guardian, lane_slot, lane_slot)
        }
        "npc_boss_tier2" => (MapItemKind::Walker, lane_slot, lane_slot.map(|s| s + 4)),
        "npc_barrack_boss" => (MapItemKind::BaseGuardian, lane_slot, lane_slot.map(|s| s + 11)),
        "npc_boss_tier3" => (MapItemKind::Patron, Some(3), Some(9)),
        "destroyable_building" => {
            let is_shrine = raw.get("targetname").is_some_and(|n| n.contains("generator"))
                || raw.get("model").is_some_and(|m| m.contains("shrine"));
            if !is_shrine {
                return None;
            }
            (MapItemKind::Shrine, lane_slot, None)
        }
        "npc_base_defense_sentry" => (MapItemKind::BaseSentry, None, None),
        "info_neutral_trooper_camp" => {
            let kind = match subclass? {
                "neutral_camp_weak" => MapItemKind::CampWeak,
                "neutral_camp_medium" => MapItemKind::CampMedium,
                "neutral_camp_strong" => MapItemKind::CampStrong,
                "neutral_camp_vaults" => MapItemKind::CampVault,
                "neutral_camp_midboss" => MapItemKind::MidBoss,
                _ => return None,
            };
            (kind, None, None)
        }
        "trigger_item_shop" => {
            // A shop that belongs to a team but sits in no lane is the team's base shop, which is not
            // a map marker.
            if team.is_some() && lane_slot.is_none() {
                return None;
            }
            (MapItemKind::Shop, lane_slot, None)
        }
        "citadel_trigger_corrupted_item_shop" => (MapItemKind::SoulsDealer, None, None),
        "citadel_trigger_idol_return" => (MapItemKind::UrnReturn, None, None),
        "citadel_trigger_teleport" => (MapItemKind::Teleporter, None, None),
        "citadel_item_powerup_spawner" => (MapItemKind::BuffSpawner, None, None),
        // The Unstable Rift (capture points and their spawn locations) moves between lanes, so it has
        // no place in a static table.
        _ => return None,
    };

    let [x, y, z] = parse_vec3(raw.get("origin")?)?;
    let name = ["bossname", "targetname", "campname"]
        .iter()
        .filter_map(|key| raw.get(key))
        .map(|v| v.trim_start_matches("[PR#]"))
        .find(|v| !v.is_empty())
        .map(str::to_owned);

    Some(MapItem {
        kind,
        team,
        lane_slot,
        objective_id,
        x,
        y,
        z,
        class_name: class.to_owned(),
        subclass: subclass.map(str::to_owned),
        name,
        has_icon: kind != MapItemKind::BaseSentry,
    })
}

const NODE_FLOATS: usize = 9;

fn lane_slot_of(lane_num: u8) -> Option<u8> {
    match lane_num {
        1 => Some(1),
        4 => Some(3),
        6 => Some(4),
        _ => None,
    }
}

/// The lane splines of the map. `rows` supplies the patrons that tell which base a path starts in.
pub fn map_lane_lines<'a>(entities: impl IntoIterator<Item = &'a RawEntity>, rows: &[MapItem]) -> Vec<LaneLine> {
    let patrons: Vec<&MapItem> = rows.iter().filter(|r| r.kind == MapItemKind::Patron && r.team.is_some()).collect();
    let mut lines: Vec<LaneLine> = entities.into_iter().filter_map(|raw| lane_line(raw, &patrons)).collect();
    lines.sort_by_key(|l| (l.lane_num, l.marker_slot));
    lines
}

fn lane_line(raw: &RawEntity, patrons: &[&MapItem]) -> Option<LaneLine> {
    if raw.get("classname")? != "lane_marker_path" {
        return None;
    }
    let lane_num: u8 = raw.get("lanenum")?.parse().ok()?;
    let lane_slot = lane_slot_of(lane_num)?;
    let marker_slot: u8 = raw.get("laneslot")?.parse().ok()?;
    let [ox, oy, oz] = parse_vec3(raw.get("origin")?)?;

    // The archive hands nested arrays over as text; brackets, commas and whitespace all separate floats.
    let floats = raw
        .get("pathnodes")?
        .split(|c: char| matches!(c, '[' | ']' | ',') || c.is_whitespace())
        .filter(|t| !t.is_empty())
        .map(str::parse::<f32>)
        .collect::<Result<Vec<f32>, _>>()
        .ok()?;
    if floats.len() % NODE_FLOATS != 0 || floats.len() < 2 * NODE_FLOATS {
        return None;
    }
    let round = |v: f32| (v * 10.0).round() / 10.0;
    let nodes: Vec<[f32; 3]> =
        floats.chunks(NODE_FLOATS).map(|n| [round(ox + n[0]), round(oy + n[1]), round(oz + n[2])]).collect();

    let start = nodes[0];
    let start_team = patrons
        .iter()
        .min_by(|a, b| planar_distance(start, a).total_cmp(&planar_distance(start, b)))
        .and_then(|p| p.team);
    Some(LaneLine { lane_num, lane_slot, marker_slot, start_team, mid_index: mid_index(&nodes), nodes })
}

fn planar_distance(from: [f32; 3], to: &MapItem) -> f32 {
    (from[0] - to.x).hypot(from[1] - to.y)
}

fn mid_index(nodes: &[[f32; 3]]) -> u32 {
    let step = |w: &[[f32; 3]]| (w[1][0] - w[0][0]).hypot(w[1][1] - w[0][1]);
    let total: f32 = nodes.windows(2).map(step).sum();
    let mut walked = 0.0;
    for (i, w) in nodes.windows(2).enumerate() {
        walked += step(w);
        if walked >= total / 2.0 {
            return i as u32 + 1;
        }
    }
    nodes.len() as u32 - 1
}

fn parse_vec3(raw: &str) -> Option<[f32; 3]> {
    let cleaned: String = raw.chars().map(|c| if matches!(c, '[' | ']' | ',') { ' ' } else { c }).collect();
    let mut parts = cleaned.split_whitespace().map(str::parse::<f32>);
    let round = |v: f32| (v * 10.0).round() / 10.0;
    let out = [round(parts.next()?.ok()?), round(parts.next()?.ok()?), round(parts.next()?.ok()?)];
    parts.next().is_none().then_some(out)
}

fn installed_build_id(citadel_dir: &Path) -> Option<u64> {
    dp_steam::build_id_of(citadel_dir.parent()?.parent()?)
}

fn or_dash(value: Option<String>) -> String {
    value.unwrap_or_else(|| "-".into())
}

fn skip_dash(value: &str) -> Option<&str> {
    (value != "-").then_some(value)
}

impl MapItemKind {
    const ALL: [MapItemKind; 16] = [
        MapItemKind::Guardian,
        MapItemKind::Walker,
        MapItemKind::Patron,
        MapItemKind::Shrine,
        MapItemKind::BaseGuardian,
        MapItemKind::BaseSentry,
        MapItemKind::MidBoss,
        MapItemKind::CampWeak,
        MapItemKind::CampMedium,
        MapItemKind::CampStrong,
        MapItemKind::CampVault,
        MapItemKind::Shop,
        MapItemKind::SoulsDealer,
        MapItemKind::UrnReturn,
        MapItemKind::Teleporter,
        MapItemKind::BuffSpawner,
    ];

    fn key(self) -> &'static str {
        match self {
            MapItemKind::Guardian => "guardian",
            MapItemKind::Walker => "walker",
            MapItemKind::Patron => "patron",
            MapItemKind::Shrine => "shrine",
            MapItemKind::BaseGuardian => "base_guardian",
            MapItemKind::BaseSentry => "base_sentry",
            MapItemKind::MidBoss => "mid_boss",
            MapItemKind::CampWeak => "camp_weak",
            MapItemKind::CampMedium => "camp_medium",
            MapItemKind::CampStrong => "camp_strong",
            MapItemKind::CampVault => "camp_vault",
            MapItemKind::Shop => "shop",
            MapItemKind::SoulsDealer => "souls_dealer",
            MapItemKind::UrnReturn => "urn_return",
            MapItemKind::Teleporter => "teleporter",
            MapItemKind::BuffSpawner => "buff_spawner",
        }
    }

    fn from_key(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|k| k.key() == key)
    }
}

const TSV_MAGIC: &str = "# dp-map-items ";
const LANE_KEY: &str = "lane";

impl MapItemTable {
    pub fn empty() -> Self {
        Self { schema: MAP_ITEMS_SCHEMA, build_id: None, vents_crc: 0, rows: Vec::new(), lanes: Vec::new() }
    }

    /// Plain tab-separated text, `-` for an absent value. Keeps the cache and the test fixture free of
    /// a JSON dependency and readable in a diff.
    pub fn to_tsv(&self) -> String {
        let mut out = format!("{TSV_MAGIC}{}\n", self.schema);
        out.push_str(&format!("build_id\t{}\n", or_dash(self.build_id.map(|b| b.to_string()))));
        out.push_str(&format!("vents_crc\t{:08x}\n", self.vents_crc));
        for r in &self.rows {
            let fields = [
                r.kind.key().to_owned(),
                or_dash(r.team.map(|v| v.to_string())),
                or_dash(r.lane_slot.map(|v| v.to_string())),
                or_dash(r.objective_id.map(|v| v.to_string())),
                r.x.to_string(),
                r.y.to_string(),
                r.z.to_string(),
                r.class_name.clone(),
                or_dash(r.subclass.clone()),
                or_dash(r.name.clone()),
                u8::from(r.has_icon).to_string(),
            ];
            out.push_str(&fields.join("\t"));
            out.push('\n');
        }
        for l in &self.lanes {
            let nodes: Vec<String> = l.nodes.iter().map(|[x, y, z]| format!("{x},{y},{z}")).collect();
            out.push_str(&format!(
                "{LANE_KEY}\t{}\t{}\t{}\t{}\t{}\n",
                l.lane_num,
                l.marker_slot,
                or_dash(l.start_team.map(|v| v.to_string())),
                l.mid_index,
                nodes.join(";")
            ));
        }
        out
    }

    pub fn from_tsv(text: &str) -> Option<Self> {
        let mut lines = text.lines();
        let schema = lines.next()?.strip_prefix(TSV_MAGIC)?.trim().parse().ok()?;
        let build = lines.next()?.strip_prefix("build_id\t")?;
        let build_id = skip_dash(build).map(str::parse).transpose().ok()?;
        let vents_crc = u32::from_str_radix(lines.next()?.strip_prefix("vents_crc\t")?, 16).ok()?;
        let mut rows = Vec::new();
        let mut lanes = Vec::new();
        for line in lines.filter(|l| !l.is_empty()) {
            let f: Vec<&str> = line.split('\t').collect();
            if f[0] == LANE_KEY {
                lanes.push(lane_from_fields(&f)?);
                continue;
            }
            let [kind, team, slot, id, x, y, z, class, sub, name, icon] = f[..] else { return None };
            rows.push(MapItem {
                kind: MapItemKind::from_key(kind)?,
                team: skip_dash(team).map(str::parse).transpose().ok()?,
                lane_slot: skip_dash(slot).map(str::parse).transpose().ok()?,
                objective_id: skip_dash(id).map(str::parse).transpose().ok()?,
                x: x.parse().ok()?,
                y: y.parse().ok()?,
                z: z.parse().ok()?,
                class_name: class.to_owned(),
                subclass: skip_dash(sub).map(str::to_owned),
                name: skip_dash(name).map(str::to_owned),
                has_icon: icon == "1",
            });
        }
        Some(Self { schema, build_id, vents_crc, rows, lanes })
    }
}

fn lane_from_fields(f: &[&str]) -> Option<LaneLine> {
    let [_, lane_num, marker_slot, start_team, mid_index, nodes] = f[..] else { return None };
    let lane_num: u8 = lane_num.parse().ok()?;
    let nodes = nodes
        .split(';')
        .map(|n| {
            let mut p = n.split(',').map(str::parse::<f32>);
            let node = [p.next()?.ok()?, p.next()?.ok()?, p.next()?.ok()?];
            p.next().is_none().then_some(node)
        })
        .collect::<Option<Vec<_>>>()?;
    Some(LaneLine {
        lane_num,
        lane_slot: lane_slot_of(lane_num)?,
        marker_slot: marker_slot.parse().ok()?,
        start_team: skip_dash(start_team).map(str::parse).transpose().ok()?,
        mid_index: mid_index.parse().ok()?,
        nodes,
    })
}

type Memo = (Option<PathBuf>, Option<u64>, Arc<Resolved>);

pub struct MapItems<I: Install = SteamInstall, E: VentsSource = NoExtractor> {
    install: I,
    extractor: E,
    cache_dir: PathBuf,
    /// Failures are memoized too: re-reading a 1 GB archive on every call is worse than waiting for
    /// the next build or install change.
    memo: Mutex<Option<Memo>>,
}

pub type GameMapItems = MapItems<SteamInstall, VpkVentsSource>;

impl GameMapItems {
    /// Reads the installed Deadlock and keeps the extracted table in `cache_dir`.
    pub fn installed(cache_dir: PathBuf) -> Self {
        Self::new(SteamInstall, VpkVentsSource, cache_dir)
    }
}

impl<I: Install, E: VentsSource> MapItems<I, E> {
    pub fn new(install: I, extractor: E, cache_dir: PathBuf) -> Self {
        Self { install, extractor, cache_dir, memo: Mutex::new(None) }
    }

    pub fn resolve(&self) -> Arc<Resolved> {
        let dir = self.install.citadel_dir();
        let build = dir.as_deref().and_then(installed_build_id);
        let mut memo = self.memo.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((d, b, resolved)) = memo.as_ref() {
            if *d == dir && *b == build {
                return Arc::clone(resolved);
            }
        }
        let resolved = Arc::new(self.load(dir.as_deref(), build));
        *memo = Some((dir, build, Arc::clone(&resolved)));
        resolved
    }

    fn load(&self, dir: Option<&Path>, build: Option<u64>) -> Resolved {
        let cache_path = self.cache_dir.join(CACHE_FILE);
        let cached = || {
            std::fs::read_to_string(&cache_path)
                .ok()
                .and_then(|t| MapItemTable::from_tsv(&t))
                .filter(|t| t.schema == MAP_ITEMS_SCHEMA && !t.rows.is_empty())
        };

        if let Some(dir) = dir {
            if let Some(table) = build.and_then(|b| cached().filter(|t| t.build_id == Some(b))) {
                return Resolved { table, source: TableSource::Cache };
            }
            match self.extract(dir, build) {
                Ok(table) => {
                    if build.is_some() {
                        if let Err(e) = write_cache(&cache_path, &table) {
                            log::warn!("map items: could not write the cache: {e}");
                        }
                    }
                    return Resolved { table, source: TableSource::Game };
                }
                Err(e) => log::warn!("map items: reading the game map failed: {e}"),
            }
        }

        match cached() {
            Some(table) => {
                log::warn!(
                    "map items: serving rows decoded from build {:?} for installed build {build:?}; positions may \
                     be out of date",
                    table.build_id
                );
                Resolved { table, source: TableSource::StaleCache { installed_build: build } }
            }
            None => Resolved { table: MapItemTable::empty(), source: TableSource::None },
        }
    }

    fn extract(&self, dir: &Path, build: Option<u64>) -> Result<MapItemTable, String> {
        let v = self.extractor.extract(dir)?;
        let rows = map_entities(&v.entities);
        if rows.is_empty() {
            return Err("the map file holds no recognised objectives".to_owned());
        }
        let lanes = map_lane_lines(&v.entities, &rows);
        Ok(MapItemTable { schema: MAP_ITEMS_SCHEMA, build_id: build, vents_crc: v.crc, rows, lanes })
    }
}

fn write_cache(path: &Path, table: &MapItemTable) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, table.to_tsv())?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const FIXTURE_PATH: &str = "fixtures/map_items.tsv";

    fn fixture_table() -> MapItemTable {
        MapItemTable::from_tsv(include_str!("../fixtures/map_items.tsv")).expect("readable fixture")
    }

    fn parse_vents_text(text: &str) -> Vec<RawEntity> {
        let mut out = Vec::new();
        let mut current: Option<BTreeMap<String, String>> = None;
        for line in text.lines() {
            if line.starts_with("====") && line.ends_with("====") {
                if let Some(done) = current.take() {
                    out.push(RawEntity { fields: done });
                }
                current = Some(BTreeMap::new());
                continue;
            }
            let Some(fields) = current.as_mut() else { continue };
            if line.starts_with('@') {
                continue;
            }
            let Some((key, value)) = line.trim_end().split_once(char::is_whitespace) else { continue };
            fields.insert(key.to_string(), value.trim().trim_matches('"').to_string());
        }
        if let Some(done) = current {
            out.push(RawEntity { fields: done });
        }
        out
    }

    fn ent(pairs: &[(&str, &str)]) -> RawEntity {
        RawEntity::new(pairs.iter().copied())
    }

    fn one(pairs: &[(&str, &str)]) -> Option<MapItem> {
        map_entities([&ent(pairs)]).into_iter().next()
    }

    #[test]
    fn a_tier_one_guardian_takes_its_lane_slot_as_objective_id() {
        let item = one(&[
            ("classname", "info_super_trooper_spawn"),
            ("teamnumber", "3"),
            ("lanenum", "4"),
            ("bossname", "boss_combine_t1_blue"),
            ("origin", "[ 0.0, 1792.0, 384.0 ]"),
        ])
        .unwrap();
        assert_eq!(item.kind, MapItemKind::Guardian);
        assert_eq!(item.team, Some(1));
        assert_eq!(item.lane_slot, Some(3));
        assert_eq!(item.objective_id, Some(3));
        assert_eq!((item.x, item.y, item.z), (0.0, 1792.0, 384.0));
        assert_eq!(item.name.as_deref(), Some("boss_combine_t1_blue"));
    }

    #[test]
    fn a_trooper_spawn_without_a_boss_name_is_not_a_guardian() {
        let spawn = one(&[
            ("classname", "info_super_trooper_spawn"),
            ("teamnumber", "2"),
            ("lanenum", "6"),
            ("bossname", ""),
            ("origin", "[ -1450.0, -10644.0, 1422.7 ]"),
        ]);
        assert_eq!(spawn, None);
    }

    #[test]
    fn walkers_base_guardians_and_patrons_carry_the_enum_ids() {
        let walker = one(&[
            ("classname", "npc_boss_tier2"),
            ("teamnumber", "2"),
            ("lanenum", "6"),
            ("origin", "[ 1.0, 2.0, 3.0 ]"),
        ])
        .unwrap();
        assert_eq!((walker.kind, walker.lane_slot, walker.objective_id), (MapItemKind::Walker, Some(4), Some(8)));
        assert_eq!(walker.team, Some(0));

        let base = one(&[
            ("classname", "npc_barrack_boss"),
            ("teamnumber", "3"),
            ("lanenum", "1"),
            ("origin", "[ 1.0, 2.0, 3.0 ]"),
        ])
        .unwrap();
        assert_eq!((base.kind, base.lane_slot, base.objective_id), (MapItemKind::BaseGuardian, Some(1), Some(12)));

        let patron = one(&[
            ("classname", "npc_boss_tier3"),
            ("teamnumber", "2"),
            ("lanenum", "3"),
            ("origin", "[ 1.0, 2.0, 3.0 ]"),
        ])
        .unwrap();
        assert_eq!((patron.kind, patron.lane_slot, patron.objective_id), (MapItemKind::Patron, Some(3), Some(9)));
    }

    #[test]
    fn shrines_have_no_objective_id_and_other_buildings_are_skipped() {
        let shrine = one(&[
            ("classname", "destroyable_building"),
            ("teamnumber", "2"),
            ("lanenum", "6"),
            ("targetname", "[PR#]amber_t3_generator_purple"),
            ("model", "resource_name:\"models/npc/shrine_amber/shrine_amber.vmdl\""),
            ("origin", "[ 299.0, -7535.0, 980.0 ]"),
        ])
        .unwrap();
        assert_eq!(shrine.kind, MapItemKind::Shrine);
        assert_eq!(shrine.objective_id, None);
        assert_eq!(shrine.lane_slot, Some(4));
        assert!(shrine.has_icon);

        let crate_box = one(&[
            ("classname", "destroyable_building"),
            ("teamnumber", "0"),
            ("targetname", "wooden_crate"),
            ("origin", "[ 1.0, 2.0, 3.0 ]"),
        ]);
        assert_eq!(crate_box, None);
    }

    #[test]
    fn base_sentries_are_kept_but_flagged_without_an_icon() {
        let sentry =
            one(&[("classname", "npc_base_defense_sentry"), ("teamnumber", "2"), ("origin", "[ 1.0, 2.0, 3.0 ]")])
                .unwrap();
        assert_eq!(sentry.kind, MapItemKind::BaseSentry);
        assert!(!sentry.has_icon);
        assert_eq!(sentry.team, Some(0));
    }

    #[test]
    fn camp_subclasses_map_to_camp_kinds_and_the_mid_boss() {
        let kind = |sub: &str| {
            one(&[
                ("classname", "info_neutral_trooper_camp"),
                ("subclass_name", sub),
                ("targetname", "[PR#]dock_camp"),
                ("origin", "[ -9248.0, 0.0, 288.9 ]"),
            ])
            .map(|i| (i.kind, i.team, i.name))
        };
        assert_eq!(kind("neutral_camp_weak").unwrap().0, MapItemKind::CampWeak);
        assert_eq!(kind("neutral_camp_medium").unwrap().0, MapItemKind::CampMedium);
        assert_eq!(kind("neutral_camp_strong").unwrap().0, MapItemKind::CampStrong);
        assert_eq!(kind("neutral_camp_vaults").unwrap().0, MapItemKind::CampVault);
        let mid = kind("neutral_camp_midboss").unwrap();
        assert_eq!(mid.0, MapItemKind::MidBoss);
        assert_eq!(mid.1, None);
        assert_eq!(mid.2.as_deref(), Some("dock_camp"));
        assert_eq!(kind("neutral_camp_something_new"), None);
    }

    #[test]
    fn shops_are_neutral_when_the_trigger_team_is_four() {
        let shop = one(&[
            ("classname", "trigger_item_shop"),
            ("teamnumber", "4"),
            ("lanenum", "-1"),
            ("origin", "[ 3920.0, -1120.0, -80.0 ]"),
        ])
        .unwrap();
        assert_eq!(shop.kind, MapItemKind::Shop);
        assert_eq!(shop.team, None);
        assert_eq!(shop.lane_slot, None);

        let lane_shop = one(&[
            ("classname", "trigger_item_shop"),
            ("teamnumber", "2"),
            ("lanenum", "1"),
            ("origin", "[ -8832.0, -1944.0, 312.0 ]"),
        ])
        .unwrap();
        assert_eq!((lane_shop.team, lane_shop.lane_slot), (Some(0), Some(1)));
    }

    #[test]
    fn a_team_shop_outside_the_lanes_is_a_base_shop_and_is_dropped() {
        for team in ["2", "3"] {
            let base_shop = one(&[
                ("classname", "trigger_item_shop"),
                ("teamnumber", team),
                ("lanenum", "0"),
                ("origin", "[ -752.0, -10714.0, 1142.5 ]"),
            ]);
            assert_eq!(base_shop, None, "team {team}");
        }
        let no_lane_key =
            one(&[("classname", "trigger_item_shop"), ("teamnumber", "3"), ("origin", "[ 1.0, 2.0, 3.0 ]")]);
        assert_eq!(no_lane_key, None);
    }

    #[test]
    fn pads_dealers_teleporters_and_buff_spawners_are_mapped() {
        let kinds: Vec<MapItemKind> = [
            "citadel_trigger_corrupted_item_shop",
            "citadel_trigger_idol_return",
            "citadel_trigger_teleport",
            "citadel_item_powerup_spawner",
        ]
        .iter()
        .map(|c| one(&[("classname", c), ("teamnumber", "0"), ("origin", "[ 1.0, 2.0, 3.0 ]")]).unwrap().kind)
        .collect();
        assert_eq!(
            kinds,
            [MapItemKind::SoulsDealer, MapItemKind::UrnReturn, MapItemKind::Teleporter, MapItemKind::BuffSpawner]
        );
    }

    #[test]
    fn the_unstable_rift_and_its_spawn_locations_are_dropped() {
        for class in ["citadel_capture_point", "info_koth_spawn_location"] {
            assert_eq!(one(&[("classname", class), ("origin", "[ -8832.0, 0.0, 288.0 ]")]), None, "{class}");
        }
    }

    #[test]
    fn origins_accept_both_array_and_space_separated_forms_and_round_to_a_tenth() {
        let array = one(&[
            ("classname", "trigger_item_shop"),
            ("teamnumber", "4"),
            ("origin", "[ -909.999939, 1248.0, 440.0 ]"),
        ])
        .unwrap();
        assert_eq!((array.x, array.y, array.z), (-910.0, 1248.0, 440.0));
        let spaced = one(&[
            ("classname", "npc_boss_tier2"),
            ("teamnumber", "2"),
            ("lanenum", "1"),
            ("origin", "641.151978 -2.04 7"),
        ])
        .unwrap();
        assert_eq!((spaced.x, spaced.y, spaced.z), (641.2, -2.0, 7.0));
        assert_eq!(one(&[("classname", "trigger_item_shop"), ("origin", "oops")]), None);
        assert_eq!(one(&[("classname", "trigger_item_shop")]), None);
    }

    #[test]
    fn rows_come_out_in_a_stable_order() {
        let a = ent(&[("classname", "trigger_item_shop"), ("teamnumber", "4"), ("origin", "[ 5.0, 0.0, 0.0 ]")]);
        let b = ent(&[("classname", "trigger_item_shop"), ("teamnumber", "4"), ("origin", "[ -5.0, 0.0, 0.0 ]")]);
        let c = ent(&[
            ("classname", "npc_boss_tier2"),
            ("teamnumber", "3"),
            ("lanenum", "1"),
            ("origin", "[ 0.0, 0.0, 0.0 ]"),
        ]);
        let forward = map_entities([&a, &b, &c]);
        let reverse = map_entities([&c, &b, &a]);
        assert_eq!(forward, reverse);
        assert_eq!(forward[0].kind, MapItemKind::Walker);
        assert_eq!(forward[1].x, -5.0);
    }

    #[test]
    fn archive_entities_map_with_case_folded_keys_and_space_separated_origins() {
        let archive = deadlock_data::map::MapEntities {
            crc: 7,
            entities: vec![BTreeMap::from([
                ("classname".to_owned(), "info_super_trooper_spawn".to_owned()),
                ("teamnumber".to_owned(), "3".to_owned()),
                ("LaneNum".to_owned(), "4".to_owned()),
                ("BossName".to_owned(), "boss_combine_t1_blue".to_owned()),
                ("origin".to_owned(), "-3936 136 24.5".to_owned()),
            ])],
        };
        let extracted = extracted_from_map(archive);
        assert_eq!(extracted.crc, 7);
        let rows = map_entities(&extracted.entities);
        assert_eq!(rows.len(), 1);
        assert_eq!((rows[0].kind, rows[0].lane_slot), (MapItemKind::Guardian, Some(3)));
        assert_eq!((rows[0].x, rows[0].y, rows[0].z), (-3936.0, 136.0, 24.5));
    }

    fn lane_entity(lane: &str, slot: &str, origin: &str, nodes: &str) -> RawEntity {
        ent(&[
            ("classname", "lane_marker_path"),
            ("lanenum", lane),
            ("laneslot", slot),
            ("origin", origin),
            ("pathnodes", nodes),
        ])
    }

    fn patron(team: &str, origin: &str) -> RawEntity {
        ent(&[("classname", "npc_boss_tier3"), ("teamnumber", team), ("origin", origin)])
    }

    // x y z plus six floats the table does not keep, per node.
    const NODES: &str = "[\n\t[\n\t\t0.0, 0.0, 0.0, -0.0,\n\t\t0.0, 0.0, 79.5, 203.2,\n\t\t-2.6,\n\t],\n\t[\n\t\t100.0, 0.0, 8.0, 0.3,\n\t\t-218.2, 1.8, -0.2, 137.6,\n\t\t-1.1,\n\t],\n\t[\n\t\t300.04, 0.0, -4.0, 0.3,\n\t\t-218.2, 1.8, -0.2, 137.6,\n\t\t-1.1,\n\t],\n]";

    fn lane_lines(entities: &[RawEntity]) -> Vec<LaneLine> {
        map_lane_lines(entities, &map_entities(entities))
    }

    #[test]
    fn a_lane_marker_path_yields_absolute_nodes_with_lane_and_slot() {
        let lanes = lane_lines(&[lane_entity("4", "2", "-1000.0 -7000.0 776.0", NODES)]);
        assert_eq!(lanes.len(), 1);
        let line = &lanes[0];
        assert_eq!((line.lane_num, line.lane_slot, line.marker_slot), (4, 3, 2));
        assert_eq!(line.nodes, vec![[-1000.0, -7000.0, 776.0], [-900.0, -7000.0, 784.0], [-700.0, -7000.0, 772.0]]);
    }

    #[test]
    fn lane_ids_map_to_objective_slots() {
        let slot = |lane: &str| lane_lines(&[lane_entity(lane, "0", "0 0 0", NODES)]).first().map(|l| l.lane_slot);
        assert_eq!((slot("1"), slot("4"), slot("6")), (Some(1), Some(3), Some(4)));
        assert_eq!(slot("2"), None);
    }

    #[test]
    fn path_nodes_read_from_bracketed_text_or_space_separated_numbers() {
        let flat = "0 0 0 0 0 0 0 0 0 5 6 7 0 0 0 0 0 0";
        let lanes = lane_lines(&[lane_entity("1", "0", "10 20 30", flat)]);
        assert_eq!(lanes[0].nodes, vec![[10.0, 20.0, 30.0], [15.0, 26.0, 37.0]]);
    }

    #[test]
    fn malformed_or_single_node_paths_are_dropped() {
        let ragged = "[ [ 0, 0, 0, 0, 0, 0, 0, 0 ] ]";
        let single = "[ [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ] ]";
        let junk = "[ [ a, b ] ]";
        for nodes in [ragged, single, junk, ""] {
            assert!(lane_lines(&[lane_entity("1", "0", "0 0 0", nodes)]).is_empty(), "{nodes:?}");
        }
        let no_slot = ent(&[("classname", "lane_marker_path"), ("origin", "0 0 0"), ("pathnodes", NODES)]);
        assert!(lane_lines(&[no_slot]).is_empty());
    }

    #[test]
    fn a_path_starts_for_the_team_whose_patron_is_nearest_and_splits_at_half_its_length() {
        let entities =
            [patron("2", "-50.0 0.0 0.0"), patron("3", "5000.0 0.0 0.0"), lane_entity("1", "0", "0 0 0", NODES)];
        let line = &lane_lines(&entities)[0];
        assert_eq!(line.start_team, Some(0));
        // Segments are about 100 and 200 units: half of 300 falls inside the second one, nearer its end.
        assert_eq!(line.mid_index, 2);

        let flipped =
            [patron("3", "-50.0 0.0 0.0"), patron("2", "5000.0 0.0 0.0"), lane_entity("1", "0", "0 0 0", NODES)];
        assert_eq!(lane_lines(&flipped)[0].start_team, Some(1));
        assert_eq!(lane_lines(&[lane_entity("1", "0", "0 0 0", NODES)])[0].start_team, None);
    }

    #[test]
    fn lane_lines_come_out_in_a_stable_order() {
        let a = lane_entity("6", "1", "0 0 0", NODES);
        let b = lane_entity("1", "3", "0 0 0", NODES);
        let c = lane_entity("1", "0", "0 0 0", NODES);
        let order = |lanes: Vec<LaneLine>| lanes.into_iter().map(|l| (l.lane_num, l.marker_slot)).collect::<Vec<_>>();
        assert_eq!(order(lane_lines(&[a.clone(), b.clone(), c.clone()])), [(1, 0), (1, 3), (6, 1)]);
        assert_eq!(order(lane_lines(&[c, b, a])), [(1, 0), (1, 3), (6, 1)]);
    }

    #[test]
    fn lane_lines_survive_the_text_round_trip() {
        let entities = [patron("2", "0 0 0"), lane_entity("4", "1", "0 0 0", NODES)];
        let table = MapItemTable {
            schema: MAP_ITEMS_SCHEMA,
            build_id: Some(5),
            vents_crc: 0xbeef,
            rows: map_entities(&entities),
            lanes: lane_lines(&entities),
        };
        assert_eq!(table.lanes.len(), 1);
        let text = table.to_tsv();
        assert_eq!(MapItemTable::from_tsv(&text), Some(table));
    }

    #[test]
    fn a_corrupt_lane_line_makes_the_whole_text_unreadable() {
        let table = MapItemTable {
            schema: MAP_ITEMS_SCHEMA,
            build_id: None,
            vents_crc: 1,
            rows: Vec::new(),
            lanes: lane_lines(&[lane_entity("4", "1", "0 0 0", NODES)]),
        };
        let broken = table.to_tsv().replace("lane\t", "lane\tx");
        assert_eq!(MapItemTable::from_tsv(&broken), None);
    }

    #[test]
    fn extraction_keeps_the_lane_lines_and_the_cache_returns_them() {
        let tmp = Tmp::new("lanes");
        let citadel = tmp.steam_layout(Some(&manifest_with_build(900)));
        let cache = tmp.0.join("cache");
        let mut entities = one_shop();
        entities.push(lane_entity("6", "3", "0 0 0", NODES));
        let (map, _) = items(Some(citadel.clone()), &cache, Ok((1, entities)));
        let resolved = map.resolve();
        assert_eq!(resolved.table.lanes.len(), 1);

        let (second, calls) = items(Some(citadel), &cache, Err("must not run".into()));
        let again = second.resolve();
        assert_eq!(again.source, TableSource::Cache);
        assert_eq!(again.table.lanes, resolved.table.lanes);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn the_fixture_has_all_twelve_lane_lines_running_base_to_base() {
        let table = fixture_table();
        assert_eq!(table.lanes.len(), 12);
        for lane in [1u8, 4, 6] {
            for slot in 0u8..4 {
                let line = table
                    .lanes
                    .iter()
                    .find(|l| l.lane_num == lane && l.marker_slot == slot)
                    .unwrap_or_else(|| panic!("lane {lane} slot {slot}"));
                assert!(line.nodes.len() > 10, "{} nodes", line.nodes.len());
                assert_eq!(line.start_team, Some(0));
                let mid = line.mid_index as usize;
                assert!(mid > 0 && mid < line.nodes.len() - 1, "mid {mid}");
            }
        }
        let slots: std::collections::BTreeSet<u8> = table.lanes.iter().map(|l| l.lane_slot).collect();
        assert_eq!(slots, [1, 3, 4].into());
    }

    #[test]
    #[ignore = "needs the installed game; set DEADLOCK_CITADEL_DIR to its game/citadel folder"]
    fn the_installed_game_yields_the_fixture_rows() {
        let dir = std::env::var("DEADLOCK_CITADEL_DIR").expect("set DEADLOCK_CITADEL_DIR");
        let extracted = VpkVentsSource.extract(Path::new(&dir)).unwrap();
        let rows = map_entities(&extracted.entities);
        let fixture = fixture_table();
        assert_eq!(rows.len(), fixture.rows.len());
        assert_eq!(rows, fixture.rows);
        assert_eq!(map_lane_lines(&extracted.entities, &rows), fixture.lanes);
    }

    #[test]
    fn the_payload_carries_the_source_and_the_stale_build() {
        let table = fixture_table();
        let stale = Resolved { table: table.clone(), source: TableSource::StaleCache { installed_build: Some(9) } };
        let payload = MapItemsPayload::from(&stale);
        assert_eq!((payload.source, payload.installed_build), (MapItemsSource::StaleCache, Some(9)));
        assert_eq!(payload.table, table);

        let no_install = Resolved { table: table.clone(), source: TableSource::StaleCache { installed_build: None } };
        let payload = MapItemsPayload::from(&no_install);
        assert_eq!((payload.source, payload.installed_build), (MapItemsSource::StaleCache, None));

        for (source, expected) in [
            (TableSource::Cache, MapItemsSource::Cache),
            (TableSource::Game, MapItemsSource::Game),
            (TableSource::Api, MapItemsSource::Api),
            (TableSource::None, MapItemsSource::None),
        ] {
            let payload = MapItemsPayload::from(&Resolved { table: table.clone(), source });
            assert_eq!((payload.source, payload.installed_build), (expected, None));
        }
    }

    // A real response is parsed in the desktop crate, which has a JSON parser.
    fn rel(left: f32, top: f32) -> AssetsRelativePosition {
        AssetsRelativePosition { left_relative: left, top_relative: top }
    }

    fn at(x: f32, y: f32, z: f32) -> AssetsEntity {
        AssetsEntity { position: [x, y, z], team: None, kind: None }
    }

    fn camp(kind: &str, name: &str, position: [f32; 3]) -> AssetsCamp {
        AssetsCamp { name: Some(name.into()), kind: Some(kind.into()), position }
    }

    fn objectives(pairs: &[(&str, AssetsRelativePosition)]) -> AssetsMap {
        AssetsMap {
            radius: Some(10752.0),
            objective_positions: pairs.iter().map(|(k, p)| (k.to_string(), *p)).collect(),
            ..AssetsMap::default()
        }
    }

    #[test]
    fn objective_positions_are_box_corners_half_a_tenth_from_the_marker() {
        // Values from the live response; the game puts these guardians at (0, -1792), (-8192, -1856) and
        // the Hidden King's patron at (-1280, -8034).
        let map = objectives(&[
            ("team0_tier1_3", rel(0.45, 0.5333)),
            ("team0_tier1_1", rel(0.069, 0.5363)),
            ("team0_titan", rel(0.3905, 0.8236)),
        ]);
        let table = table_from_assets_map(&map);
        let pos = |kind: MapItemKind, slot: u8| {
            let r = table.rows.iter().find(|r| r.kind == kind && r.lane_slot == Some(slot)).unwrap();
            (r.x, r.y, r.z)
        };
        assert_eq!(pos(MapItemKind::Guardian, 3), (0.0, -1791.3, 0.0));
        assert_eq!(pos(MapItemKind::Guardian, 1), (-8193.0, -1855.8, 0.0));
        assert_eq!(pos(MapItemKind::Patron, 3), (-1279.5, -8033.9, 0.0));
    }

    #[test]
    fn a_missing_or_bad_radius_uses_the_minimap_radius() {
        let mut map = objectives(&[("team1_tier1_3", rel(0.45, 0.3667))]);
        let expected = table_from_assets_map(&map).rows;
        assert_eq!((expected[0].x, expected[0].y), (0.0, 1791.3));
        map.radius = None;
        assert_eq!(table_from_assets_map(&map).rows, expected);
        map.radius = Some(-1.0);
        assert_eq!(table_from_assets_map(&map).rows, expected);
        map.radius = Some(5376.0);
        assert_eq!(table_from_assets_map(&map).rows[0].y, 895.6);
    }

    #[test]
    fn objective_keys_map_to_kinds_teams_slots_and_enum_ids() {
        let p = rel(0.45, 0.45);
        let map = objectives(&[
            ("team0_tier1_1", p),
            ("team1_tier1_4", p),
            ("team0_tier2_3", p),
            ("team1_tier2_4", p),
            ("team1_titan", p),
        ]);
        let got: Vec<_> =
            table_from_assets_map(&map).rows.iter().map(|r| (r.kind, r.team, r.lane_slot, r.objective_id)).collect();
        assert_eq!(
            got,
            [
                (MapItemKind::Guardian, Some(0), Some(1), Some(1)),
                (MapItemKind::Guardian, Some(1), Some(4), Some(4)),
                (MapItemKind::Walker, Some(0), Some(3), Some(7)),
                (MapItemKind::Walker, Some(1), Some(4), Some(8)),
                (MapItemKind::Patron, Some(1), Some(3), Some(9)),
            ]
        );
    }

    #[test]
    fn unknown_objective_keys_and_the_cores_are_skipped() {
        let p = rel(0.45, 0.45);
        let map = objectives(&[
            ("team0_core", p),
            ("team1_core", p),
            ("team2_tier1_1", p),
            ("team0_tier1_2", p),
            ("team0_tier3_1", p),
            ("team0_titan_2", p),
            ("zipline", p),
        ]);
        assert!(table_from_assets_map(&map).rows.is_empty());
    }

    #[test]
    fn camps_map_by_kind_with_world_positions_and_unknown_kinds_are_skipped() {
        let map = AssetsMap {
            neutral_camps: vec![
                camp("weak", "park_club_camp", [6304.0, 964.0, 264.0]),
                camp("medium", "nw_bank_camp", [-8624.0, 4264.0, 648.0]),
                camp("strong", "dock_camp", [-9248.0, 0.0, 288.87]),
                camp("vault", "chinatown_bell_1", [3248.0, -1888.0, 0.0]),
                camp("legendary", "new_camp", [1.0, 2.0, 3.0]),
                AssetsCamp { name: None, kind: None, position: [1.0, 2.0, 3.0] },
            ],
            ..AssetsMap::default()
        };
        let rows = table_from_assets_map(&map).rows;
        let got: Vec<_> = rows.iter().map(|r| (r.kind, r.subclass.as_deref(), r.name.as_deref(), r.team)).collect();
        assert_eq!(
            got,
            [
                (MapItemKind::CampWeak, Some("neutral_camp_weak"), Some("park_club_camp"), None),
                (MapItemKind::CampMedium, Some("neutral_camp_medium"), Some("nw_bank_camp"), None),
                (MapItemKind::CampStrong, Some("neutral_camp_strong"), Some("dock_camp"), None),
                (MapItemKind::CampVault, Some("neutral_camp_vaults"), Some("chinatown_bell_1"), None),
            ]
        );
        assert_eq!((rows[2].x, rows[2].y, rows[2].z), (-9248.0, 0.0, 288.9));
        assert!(rows.iter().all(|r| r.class_name == "info_neutral_trooper_camp" && r.has_icon));
    }

    #[test]
    fn entities_map_to_their_kinds_and_base_shops_are_dropped() {
        let team = |t: i64, e: AssetsEntity| AssetsEntity { team: Some(t), ..e };
        let shop =
            |kind: &str, t: Option<i64>, x: f32| AssetsEntity { kind: Some(kind.into()), team: t, ..at(x, 0.0, 0.0) };
        let map = AssetsMap {
            entities: AssetsEntities {
                base_sentries: vec![team(0, at(-1568.0, -9424.0, 1152.0)), team(1, at(864.0, 9664.0, 1216.0))],
                teleporters: vec![at(-3904.0, 1792.0, -128.0)],
                soul_urn_pads: vec![at(-6592.0, -8.0, 192.0)],
                shops: vec![
                    shop("lane", Some(0), -8832.0),
                    shop("secret", None, -3920.0),
                    shop("base", Some(0), -752.0),
                    shop("mystery", None, 5.0),
                ],
                bridge_buffs: vec![at(-3936.0, 136.0, 912.0)],
            },
            ..AssetsMap::default()
        };
        let rows = table_from_assets_map(&map).rows;
        let got: Vec<_> = rows.iter().map(|r| (r.kind, r.team, r.x)).collect();
        assert_eq!(
            got,
            [
                (MapItemKind::BaseSentry, Some(0), -1568.0),
                (MapItemKind::BaseSentry, Some(1), 864.0),
                (MapItemKind::Shop, None, -3920.0),
                (MapItemKind::Shop, Some(0), -8832.0),
                (MapItemKind::UrnReturn, None, -6592.0),
                (MapItemKind::Teleporter, None, -3904.0),
                (MapItemKind::BuffSpawner, None, -3936.0),
            ]
        );
        assert!(!rows[0].has_icon);
        assert!(rows[2..].iter().all(|r| r.has_icon && r.lane_slot.is_none() && r.objective_id.is_none()));
    }

    #[test]
    fn an_api_table_has_no_build_and_no_lanes() {
        let table = table_from_assets_map(&objectives(&[("team0_titan", rel(0.39, 0.82))]));
        assert_eq!((table.schema, table.build_id, table.vents_crc), (MAP_ITEMS_SCHEMA, None, 0));
        assert_eq!(table.rows.len(), 1);
        assert!(table.lanes.is_empty());
        assert!(table_from_assets_map(&AssetsMap::default()).rows.is_empty());
    }

    #[test]
    fn non_finite_positions_are_skipped() {
        let map = AssetsMap {
            objective_positions: [("team0_titan".to_owned(), rel(f32::NAN, 0.5))].into(),
            entities: AssetsEntities { teleporters: vec![at(f32::INFINITY, 0.0, 0.0)], ..AssetsEntities::default() },
            ..AssetsMap::default()
        };
        assert!(table_from_assets_map(&map).rows.is_empty());
    }

    #[test]
    fn the_text_dump_helper_reads_blocks() {
        let text = "====0====\nclassname \"worldspawn\"\n====1====\nclassname                      \"trigger_item_shop\"\nteamnumber \"4\"\n@OnStartTouch Start x\norigin [ 1.0, 2.0, 3.0 ]\n";
        let ents = parse_vents_text(text);
        assert_eq!(ents.len(), 2);
        assert_eq!(map_entities(&ents).len(), 1);
    }

    const DEADLOCK_APP_ID: u32 = 1422450;
    const ACF: &str = "\"AppState\"
{
	\"appid\"		\"1422450\"
	\"installdir\"		\"Deadlock\"
	\"buildid\"		\"25841406\"
}";

    struct Tmp(PathBuf);

    impl Tmp {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("dp-map-items-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Tmp(dir)
        }

        fn steam_layout(&self, manifest: Option<&str>) -> PathBuf {
            let citadel = self.0.join("steamapps/common/Deadlock/game/citadel");
            fs::create_dir_all(&citadel).unwrap();
            if let Some(acf) = manifest {
                fs::write(self.0.join(format!("steamapps/appmanifest_{DEADLOCK_APP_ID}.acf")), acf).unwrap();
            }
            citadel
        }
    }

    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn the_installed_build_id_comes_from_the_manifest_next_to_common() {
        let tmp = Tmp::new("build");
        let citadel = tmp.steam_layout(Some(ACF));
        assert_eq!(installed_build_id(&citadel), Some(25841406));
    }

    #[test]
    fn a_missing_manifest_or_unusual_layout_gives_no_build_id() {
        let tmp = Tmp::new("nobuild");
        let citadel = tmp.steam_layout(None);
        assert_eq!(installed_build_id(&citadel), None);

        let loose = tmp.0.join("elsewhere/game/citadel");
        fs::create_dir_all(&loose).unwrap();
        assert_eq!(installed_build_id(&loose), None);
    }

    struct FixedInstall(Option<PathBuf>);

    impl Install for FixedInstall {
        fn citadel_dir(&self) -> Option<PathBuf> {
            self.0.clone()
        }
    }

    struct CountingExtractor {
        calls: Arc<AtomicUsize>,
        result: Result<(u32, Vec<RawEntity>), String>,
    }

    impl VentsSource for CountingExtractor {
        fn extract(&self, _dir: &Path) -> Result<ExtractedVents, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            match &self.result {
                Ok((crc, entities)) => Ok(ExtractedVents { crc: *crc, entities: entities.clone() }),
                Err(e) => Err(e.clone()),
            }
        }
    }

    fn manifest_with_build(build: u64) -> String {
        ACF.replace("25841406", &build.to_string())
    }

    fn one_shop() -> Vec<RawEntity> {
        vec![ent(&[("classname", "trigger_item_shop"), ("teamnumber", "4"), ("origin", "[ 11.0, 22.0, 33.0 ]")])]
    }

    fn items(
        install: Option<PathBuf>,
        cache: &Path,
        result: Result<(u32, Vec<RawEntity>), String>,
    ) -> (MapItems<FixedInstall, CountingExtractor>, Arc<AtomicUsize>) {
        let calls = Arc::new(AtomicUsize::new(0));
        let extractor = CountingExtractor { calls: Arc::clone(&calls), result };
        (MapItems::new(FixedInstall(install), extractor, cache.to_path_buf()), calls)
    }

    #[test]
    fn a_new_build_extracts_from_the_game_and_writes_the_cache() {
        let tmp = Tmp::new("extract");
        let citadel = tmp.steam_layout(Some(&manifest_with_build(900)));
        let cache = tmp.0.join("cache");
        let (map, calls) = items(Some(citadel.clone()), &cache, Ok((0xabcd, one_shop())));

        let resolved = map.resolve();
        assert_eq!(resolved.source, TableSource::Game);
        assert_eq!(resolved.table.build_id, Some(900));
        assert_eq!(resolved.table.vents_crc, 0xabcd);
        assert_eq!(resolved.table.rows.len(), 1);
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        let (second, second_calls) = items(Some(citadel), &cache, Err("must not run".into()));
        let again = second.resolve();
        assert_eq!(again.source, TableSource::Cache);
        assert_eq!(again.table, resolved.table);
        assert_eq!(second_calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn a_cache_from_another_build_is_replaced() {
        let tmp = Tmp::new("rebuild");
        let cache = tmp.0.join("cache");
        let old = tmp.steam_layout(Some(&manifest_with_build(900)));
        let (first, _) = items(Some(old), &cache, Ok((1, one_shop())));
        assert_eq!(first.resolve().table.build_id, Some(900));

        fs::write(tmp.0.join(format!("steamapps/appmanifest_{DEADLOCK_APP_ID}.acf")), manifest_with_build(901))
            .unwrap();
        let citadel = tmp.0.join("steamapps/common/Deadlock/game/citadel");
        let (second, calls) = items(Some(citadel), &cache, Ok((2, one_shop())));
        let resolved = second.resolve();
        assert_eq!(resolved.source, TableSource::Game);
        assert_eq!((resolved.table.build_id, resolved.table.vents_crc), (Some(901), 2));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_corrupt_or_foreign_schema_cache_is_ignored() {
        let tmp = Tmp::new("corrupt");
        let citadel = tmp.steam_layout(Some(&manifest_with_build(900)));
        let cache = tmp.0.join("cache");
        fs::create_dir_all(&cache).unwrap();
        fs::write(cache.join(CACHE_FILE), "not a table").unwrap();
        let (map, calls) = items(Some(citadel.clone()), &cache, Ok((5, one_shop())));
        assert_eq!(map.resolve().source, TableSource::Game);
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        let mut foreign = map.resolve().table.clone();
        foreign.schema = MAP_ITEMS_SCHEMA + 1;
        fs::write(cache.join(CACHE_FILE), foreign.to_tsv()).unwrap();
        let (fresh, fresh_calls) = items(Some(citadel), &cache, Ok((6, one_shop())));
        assert_eq!(fresh.resolve().table.vents_crc, 6);
        assert_eq!(fresh_calls.load(Ordering::SeqCst), 1);
    }

    fn seed_cache(cache: &Path, build: Option<u64>) -> MapItemTable {
        let table =
            MapItemTable { build_id: build, vents_crc: 0x900, rows: map_entities(&one_shop()), ..fixture_table() };
        write_cache(&cache.join(CACHE_FILE), &table).unwrap();
        table
    }

    #[test]
    fn a_failed_extraction_on_a_new_build_serves_the_cache_of_the_old_build_as_stale() {
        let tmp = Tmp::new("stale");
        let cache = tmp.0.join("cache");
        let old = seed_cache(&cache, Some(900));
        let citadel = tmp.steam_layout(Some(&manifest_with_build(901)));
        let (map, calls) = items(Some(citadel), &cache, Err("boom".into()));
        let resolved = map.resolve();
        assert_eq!(resolved.source, TableSource::StaleCache { installed_build: Some(901) });
        assert_eq!(resolved.table, old);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_failed_extraction_with_no_cache_gives_an_empty_table_for_the_caller_to_fill() {
        let tmp = Tmp::new("nothing");
        let citadel = tmp.steam_layout(Some(&manifest_with_build(901)));
        let (map, _) = items(Some(citadel), &tmp.0.join("cache"), Err("boom".into()));
        let resolved = map.resolve();
        assert_eq!(resolved.source, TableSource::None);
        assert_eq!(resolved.table, MapItemTable::empty());
    }

    #[test]
    fn a_foreign_schema_cache_is_not_served_as_stale() {
        let tmp = Tmp::new("stale-schema");
        let cache = tmp.0.join("cache");
        let mut foreign = seed_cache(&cache, Some(900));
        foreign.schema = MAP_ITEMS_SCHEMA + 1;
        write_cache(&cache.join(CACHE_FILE), &foreign).unwrap();
        let citadel = tmp.steam_layout(Some(&manifest_with_build(901)));
        let (map, _) = items(Some(citadel), &cache, Err("boom".into()));
        assert_eq!(map.resolve().source, TableSource::None);
    }

    #[test]
    fn an_install_without_a_build_id_serves_the_cache_as_stale_when_extraction_fails() {
        let tmp = Tmp::new("stale-nobuild");
        let cache = tmp.0.join("cache");
        let old = seed_cache(&cache, Some(900));
        let citadel = tmp.steam_layout(None);
        let (map, _) = items(Some(citadel), &cache, Err("boom".into()));
        let resolved = map.resolve();
        assert_eq!(resolved.source, TableSource::StaleCache { installed_build: None });
        assert_eq!(resolved.table, old);
    }

    #[test]
    fn no_install_serves_the_last_cache_as_stale_without_extracting() {
        let tmp = Tmp::new("none-cached");
        let cache = tmp.0.join("cache");
        let old = seed_cache(&cache, Some(900));
        let (map, calls) = items(None, &cache, Ok((1, one_shop())));
        let resolved = map.resolve();
        assert_eq!(resolved.source, TableSource::StaleCache { installed_build: None });
        assert_eq!(resolved.table, old);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn no_install_and_no_cache_gives_an_empty_table_without_extracting() {
        let tmp = Tmp::new("none");
        let (map, calls) = items(None, &tmp.0.join("cache"), Ok((1, one_shop())));
        let resolved = map.resolve();
        assert_eq!(resolved.source, TableSource::None);
        assert!(resolved.table.rows.is_empty());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn resolving_twice_does_not_extract_twice() {
        let tmp = Tmp::new("memo");
        let citadel = tmp.steam_layout(Some(&manifest_with_build(900)));
        let (map, calls) = items(Some(citadel), &tmp.0.join("cache"), Err("boom".into()));
        assert_eq!(map.resolve().source, TableSource::None);
        map.resolve();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    fn count(table: &MapItemTable, kind: MapItemKind) -> usize {
        table.rows.iter().filter(|r| r.kind == kind).count()
    }

    #[test]
    fn the_fixture_has_the_full_row_set() {
        let table = fixture_table();
        assert_eq!(table.schema, MAP_ITEMS_SCHEMA);
        let expected = [
            (MapItemKind::Guardian, 6),
            (MapItemKind::Walker, 6),
            (MapItemKind::Patron, 2),
            (MapItemKind::Shrine, 4),
            (MapItemKind::BaseGuardian, 12),
            (MapItemKind::BaseSentry, 8),
            (MapItemKind::MidBoss, 1),
            (MapItemKind::CampWeak, 4),
            (MapItemKind::CampMedium, 25),
            (MapItemKind::CampStrong, 11),
            (MapItemKind::CampVault, 11),
            (MapItemKind::Shop, 8),
            (MapItemKind::SoulsDealer, 2),
            (MapItemKind::UrnReturn, 2),
            (MapItemKind::Teleporter, 4),
            (MapItemKind::BuffSpawner, 2),
        ];
        for (kind, n) in expected {
            assert_eq!(count(&table, kind), n, "{kind:?}");
        }
        assert_eq!(table.rows.len(), expected.iter().map(|(_, n)| n).sum::<usize>());
        assert_eq!(table.rows.len(), 108);
    }

    #[test]
    fn the_fixture_matches_the_documented_coordinates() {
        let table = fixture_table();
        let at = |kind: MapItemKind| -> Vec<(i32, i32)> {
            let mut v: Vec<_> = table
                .rows
                .iter()
                .filter(|r| r.kind == kind)
                .map(|r| (r.x.round() as i32, r.y.round() as i32))
                .collect();
            v.sort();
            v
        };
        let mut shops = vec![
            (-910, 1248),
            (1024, -1248),
            (8832, 1944),
            (-6432, 1760),
            (-8832, -1944),
            (6432, -1760),
            (3920, -1120),
            (-3920, 1120),
        ];
        shops.sort();
        assert_eq!(at(MapItemKind::Shop), shops);
        assert_eq!(at(MapItemKind::SoulsDealer), vec![(-1056, 3108), (1056, -3108)]);
        assert_eq!(at(MapItemKind::UrnReturn), vec![(-6592, -8), (6304, -96)]);
        let mut tp = vec![(3904, -1792), (-3904, 1792), (-3584, -2784), (3584, 2784)];
        tp.sort();
        assert_eq!(at(MapItemKind::Teleporter), tp);
        assert_eq!(at(MapItemKind::BuffSpawner), vec![(-3936, 136), (3936, -128)]);
        let mid = table.rows.iter().find(|r| r.kind == MapItemKind::MidBoss).unwrap();
        assert!(mid.x.abs() < 2.0 && mid.y.abs() < 2.0);
    }

    #[test]
    fn the_fixture_objective_ids_follow_the_enum() {
        let table = fixture_table();
        let ids = |kind: MapItemKind| {
            let mut v: Vec<u8> = table.rows.iter().filter(|r| r.kind == kind).filter_map(|r| r.objective_id).collect();
            v.sort();
            v
        };
        assert_eq!(ids(MapItemKind::Guardian), [1, 1, 3, 3, 4, 4]);
        assert_eq!(ids(MapItemKind::Walker), [5, 5, 7, 7, 8, 8]);
        assert_eq!(ids(MapItemKind::BaseGuardian).len(), 12);
        assert_eq!(ids(MapItemKind::Patron), [9, 9]);
        assert!(ids(MapItemKind::Shrine).is_empty());
        for kind in [MapItemKind::Guardian, MapItemKind::Walker, MapItemKind::Patron, MapItemKind::BaseGuardian] {
            for row in table.rows.iter().filter(|r| r.kind == kind) {
                assert!(row.team.is_some() && row.lane_slot.is_some(), "{row:?}");
            }
        }
    }

    #[test]
    #[ignore = "needs a decoded default_ents.vents text dump; set DP_VENTS_TEXT"]
    fn the_fixture_matches_the_decoded_game_file() {
        let path = std::env::var("DP_VENTS_TEXT").expect("set DP_VENTS_TEXT");
        let text = fs::read_to_string(path).unwrap();
        let rows = map_entities(&parse_vents_text(&text));
        assert_eq!(rows, fixture_table().rows);
    }

    #[test]
    #[ignore = "writes fixtures/map_items.tsv from the installed game; set DEADLOCK_CITADEL_DIR"]
    fn regenerate_the_fixture() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("set DEADLOCK_CITADEL_DIR"));
        let extracted = VpkVentsSource.extract(&dir).unwrap();
        let rows = map_entities(&extracted.entities);
        let lanes = map_lane_lines(&extracted.entities, &rows);
        let table = MapItemTable {
            schema: MAP_ITEMS_SCHEMA,
            build_id: Some(installed_build_id(&dir).expect("build id")),
            vents_crc: extracted.crc,
            rows,
            lanes,
        };
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(FIXTURE_PATH);
        fs::write(path, table.to_tsv()).unwrap();
    }
}
