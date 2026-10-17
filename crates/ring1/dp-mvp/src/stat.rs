use serde::{Deserialize, Serialize};

pub const STAT_COUNT: usize = 8;

/// The graded stats, in the fixed order every per-stat array uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stat {
    Kills,
    Deaths,
    Assists,
    Souls,
    PlayerDamage,
    ObjectiveDamage,
    SelfHealing,
    Support,
}

pub const STATS: [Stat; STAT_COUNT] = [
    Stat::Kills,
    Stat::Deaths,
    Stat::Assists,
    Stat::Souls,
    Stat::PlayerDamage,
    Stat::ObjectiveDamage,
    Stat::SelfHealing,
    Stat::Support,
];

pub(crate) const DEATHS: usize = 1;

/// One value per stat, in [`STATS`] order. `None` marks a stat skipped for the hero.
pub type Percentiles = [Option<f64>; STAT_COUNT];

/// End-of-match totals. Kills, deaths, assists and souls are the player's top-level fields; the rest are the
/// last `stats` sample (GraphQL `max_*`).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Totals {
    pub kills: f64,
    pub deaths: f64,
    pub assists: f64,
    pub net_worth: f64,
    pub player_damage: f64,
    pub boss_damage: f64,
    pub player_healing: f64,
    pub teammate_healing: f64,
    pub teammate_barriering: f64,
}

impl Totals {
    /// `player_healing` already includes teammate healing, so self healing and support are split to stay disjoint.
    pub fn per_minute(&self, duration_s: u32) -> [f64; STAT_COUNT] {
        let minutes = duration_s as f64 / 60.0;
        [
            self.kills,
            self.deaths,
            self.assists,
            self.net_worth,
            self.player_damage,
            self.boss_damage,
            self.player_healing - self.teammate_healing,
            self.teammate_healing + self.teammate_barriering,
        ]
        .map(|v| v / minutes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn per_minute_splits_healing_into_self_and_support() {
        let t = Totals {
            kills: 10.0,
            deaths: 5.0,
            assists: 20.0,
            net_worth: 30000.0,
            player_damage: 25000.0,
            boss_damage: 5000.0,
            player_healing: 8000.0,
            teammate_healing: 3000.0,
            teammate_barriering: 1000.0,
        };
        assert_eq!(t.per_minute(1200), [0.5, 0.25, 1.0, 1500.0, 1250.0, 250.0, 250.0, 200.0]);
    }
}
