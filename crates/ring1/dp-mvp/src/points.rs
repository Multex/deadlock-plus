use serde::{Deserialize, Serialize};

use crate::totals::PlayerTotals;

/// Bumped whenever a points value, the CC rate, the CC list or the curve changes, so stored grades can be
/// told apart from the current model.
pub const LOBBY_GRADE_VERSION: u32 = 1;

/// Every points value below was fitted to match match outcomes (which team won) over a set of recorded lobbies.
pub const EARLY_DAMAGE_POINTS: f64 = 0.0223;
pub const LATE_DAMAGE_POINTS: f64 = 0.0349;
pub const EARLY_ASSIST_POINTS: f64 = 45.94;
pub const LATE_ASSIST_POINTS: f64 = 80.82;
pub const PREBASE_OBJECTIVE_POINTS: f64 = 0.1795;
pub const BASE_OBJECTIVE_POINTS: f64 = 0.4108;
pub const DAMAGE_ABSORBED_POINTS: f64 = 0.056;
pub const ALLY_HEALING_POINTS: f64 = 0.03;
pub const HEAL_PREVENTED_POINTS: f64 = 0.05;
pub const BARRIER_POINTS: f64 = 0.2393;
pub const CS_POINTS: f64 = 21.001;

/// Points per kill unit.
pub const KILL_POINTS: f64 = 3.0;
/// Kill units: `KILL_UNITS_PER_KILL * kills + KILL_UNITS_PER_TIME_SHARE * sum(kill time / duration)`.
pub const KILL_UNITS_PER_KILL: f64 = 18.91;
pub const KILL_UNITS_PER_TIME_SHARE: f64 = 102.622;

pub const DEATH_POINTS: f64 = 57.76;
pub const DEATH_POINTS_PER_DEAD_S: f64 = 2.746;

pub const CC_POINTS_PER_DAMAGE: f64 = 0.075;
pub const FARM_BONUS_RATE: f64 = 0.367;

pub const METRIC_COUNT: usize = 14;

/// One value per graded stat; the same shape carries points (`f64`) and lobby ranks (`u32`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Metrics<T> {
    pub early_damage: T,
    pub late_damage: T,
    pub early_assists: T,
    pub late_assists: T,
    pub prebase_objective: T,
    pub base_objective: T,
    pub damage_absorbed: T,
    pub ally_healing: T,
    pub heal_prevented: T,
    pub barriers: T,
    pub cs: T,
    pub kills: T,
    pub deaths: T,
    pub cc: T,
}

impl<T: Copy> Metrics<T> {
    pub fn to_array(&self) -> [T; METRIC_COUNT] {
        [
            self.early_damage,
            self.late_damage,
            self.early_assists,
            self.late_assists,
            self.prebase_objective,
            self.base_objective,
            self.damage_absorbed,
            self.ally_healing,
            self.heal_prevented,
            self.barriers,
            self.cs,
            self.kills,
            self.deaths,
            self.cc,
        ]
    }

    pub fn from_array(a: [T; METRIC_COUNT]) -> Self {
        Self {
            early_damage: a[0],
            late_damage: a[1],
            early_assists: a[2],
            late_assists: a[3],
            prebase_objective: a[4],
            base_objective: a[5],
            damage_absorbed: a[6],
            ally_healing: a[7],
            heal_prevented: a[8],
            barriers: a[9],
            cs: a[10],
            kills: a[11],
            deaths: a[12],
            cc: a[13],
        }
    }
}

impl Metrics<f64> {
    pub fn sum(&self) -> f64 {
        self.to_array().iter().sum()
    }
}

pub fn kill_points(kills: f64, kill_time_share: f64) -> f64 {
    KILL_POINTS * (KILL_UNITS_PER_KILL * kills + KILL_UNITS_PER_TIME_SHARE * kill_time_share)
}

/// Negative: more deaths and more time dead cost more.
pub fn death_points(deaths: f64, dead_s: f64) -> f64 {
    -(DEATH_POINTS * deaths + DEATH_POINTS_PER_DEAD_S * dead_s)
}

/// Damage from the sources the caller counts as hard CC, at one flat rate.
pub fn cc_points(t: &PlayerTotals, is_cc: &impl Fn(&str) -> bool) -> f64 {
    CC_POINTS_PER_DAMAGE * t.cc_by_source.iter().filter(|(name, _)| is_cc(name)).map(|(_, d)| d).sum::<f64>()
}

pub fn metric_points(t: &PlayerTotals, is_cc: &impl Fn(&str) -> bool) -> Metrics<f64> {
    Metrics {
        early_damage: t.early_damage * EARLY_DAMAGE_POINTS,
        late_damage: t.late_damage * LATE_DAMAGE_POINTS,
        early_assists: t.early_assists * EARLY_ASSIST_POINTS,
        late_assists: t.late_assists * LATE_ASSIST_POINTS,
        prebase_objective: t.prebase_objective * PREBASE_OBJECTIVE_POINTS,
        base_objective: t.base_objective * BASE_OBJECTIVE_POINTS,
        damage_absorbed: t.damage_absorbed * DAMAGE_ABSORBED_POINTS,
        ally_healing: t.ally_healing * ALLY_HEALING_POINTS,
        heal_prevented: t.heal_prevented * HEAL_PREVENTED_POINTS,
        barriers: t.barriers * BARRIER_POINTS,
        cs: t.cs * CS_POINTS,
        kills: kill_points(t.kills, t.kill_time_share),
        deaths: death_points(t.deaths, t.dead_s),
        cc: cc_points(t, is_cc),
    }
}

/// 0 for a team whose best farmer has no farm souls.
pub fn farm_dependency(farm_souls: f64, team_max_farm_souls: f64) -> f64 {
    if team_max_farm_souls > 0.0 {
        1.0 - farm_souls / team_max_farm_souls
    } else {
        0.0
    }
}

/// Signed: a negative points sum gets a negative bonus.
pub fn farm_bonus(points_sum: f64, dependency: f64) -> f64 {
    FARM_BONUS_RATE * dependency * points_sum
}
