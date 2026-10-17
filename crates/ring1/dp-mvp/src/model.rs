use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::math::{knot_percentile, mid_rank, quantiles, sort_ascending, spearman};
use crate::sample::{Sample, SampleRow, SampleSummary};
use crate::skew::{apply, tier, tier_skews, TierSkew, TierSums};
use crate::stat::{Percentiles, Stat, DEATHS, STATS, STAT_COUNT};
use crate::MvpError;

/// Bumped whenever the cache layout or the model math changes; an older cache is rebuilt.
pub const MODEL_VERSION: u32 = 3;
/// Heroes with fewer sample rows than this use the all-hero weights.
pub const MIN_HERO_ROWS: usize = 250;
/// Match-length buckets (terciles of the sample's rows).
pub const LENGTH_BUCKETS: usize = 3;
/// A hero's length bucket with fewer rows than this reads the hero-wide quantiles.
pub const MIN_BUCKET_ROWS: usize = 250;

const STAT_KNOTS: usize = 101;
const CALIBRATION_KNOTS: usize = 1001;
const WEIGHT_FLOOR: f64 = 0.03;
const MIN_ROW_SHARE: f64 = 0.8;
const WIN_RATE: (f64, f64) = (0.48, 0.52);
const MUST_HELP_WIN: [Stat; 3] = [Stat::Assists, Stat::Souls, Stat::ObjectiveDamage];
const DAY_S: i64 = 86_400;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelCache {
    pub model_version: u32,
    /// Unix seconds, from the server's `Date` header so a wrong client clock cannot age the cache.
    pub built_at: i64,
    pub sample: SampleSummary,
    pub stats: Vec<Stat>,
    pub all_heroes: AllHeroes,
    pub heroes: BTreeMap<u32, HeroModel>,
    /// Durations (s) where the 2nd and 3rd length buckets start.
    pub length_cuts: [u32; LENGTH_BUCKETS - 1],
    /// Per lobby rank tier (`badge / 10`), learned from the sample's ranked rows.
    pub rank_skew: BTreeMap<u32, TierSkew>,
    /// Ascending composite quantiles of the sample's own rows: ranked rows skewed, unranked rows not.
    pub calibration: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AllHeroes {
    pub w: [f64; STAT_COUNT],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeroModel {
    pub n: usize,
    /// The hero's own weights, or the all-hero ones when it has too few rows or no stat tracks winning.
    pub w: [f64; STAT_COUNT],
    /// Per-minute quantiles per stat; `None` when the stat is 0 in every row of the hero.
    pub quantiles: [Option<Vec<f64>>; STAT_COUNT],
    /// The same per match-length bucket; `None` for a bucket with too few rows. A stat skipped hero-wide is
    /// `None` here too.
    pub length_quantiles: [Option<[Option<Vec<f64>>; STAT_COUNT]>; LENGTH_BUCKETS],
}

impl HeroModel {
    /// Raw percentiles vs the hero's rows in the same length bucket, or all its rows when the bucket is thin.
    pub fn percentiles(&self, per_minute: &[f64; STAT_COUNT], bucket: usize) -> Percentiles {
        let table = self.length_quantiles[bucket].as_ref().unwrap_or(&self.quantiles);
        std::array::from_fn(|s| table[s].as_ref().map(|knots| knot_percentile(knots, per_minute[s])))
    }

    /// `Σ w·p` over the stats the hero has, renormalised by their weight; deaths count as `100 − p`.
    pub fn composite(&self, percentiles: &Percentiles) -> Option<f64> {
        let (mut sum, mut weight) = (0.0, 0.0);
        for (s, p) in percentiles.iter().enumerate() {
            let Some(p) = p else { continue };
            let p = if s == DEATHS { 100.0 - p } else { *p };
            sum += self.w[s] * p;
            weight += self.w[s];
        }
        (weight > 0.0).then(|| sum / weight)
    }
}

impl ModelCache {
    pub fn length_bucket(&self, duration_s: u32) -> usize {
        length_bucket(&self.length_cuts, duration_s)
    }

    pub fn needs_refresh(&self, now: i64) -> bool {
        self.model_version != MODEL_VERSION || now - self.built_at > 7 * DAY_S || self.built_at > now + DAY_S
    }

    /// `100 · (#{< c} + 0.5 · #{= c}) / n` over the calibration table.
    pub fn score(&self, composite: f64) -> f64 {
        mid_rank(&self.calibration, composite)
    }
}

/// Builds the cache from a sample, or fails a sanity gate and returns nothing.
pub fn build(sample: &Sample, built_at: i64, target_rows: usize) -> Result<ModelCache, MvpError> {
    let rows = &sample.rows;
    let need = (MIN_ROW_SHARE * target_rows as f64).ceil() as usize;
    if rows.len() < need {
        return Err(MvpError::TooFewRows { rows: rows.len(), need });
    }
    let win_rate = rows.iter().filter(|r| r.won).count() as f64 / rows.len() as f64;
    if !(WIN_RATE.0..=WIN_RATE.1).contains(&win_rate) {
        return Err(MvpError::WinRate(win_rate));
    }

    let all_rows: Vec<&SampleRow> = rows.iter().collect();
    let all_c = correlations(&all_rows);
    if let Some(stat) =
        MUST_HELP_WIN.into_iter().find(|&stat| all_c[stat as usize].is_nan() || all_c[stat as usize] <= 0.0)
    {
        return Err(MvpError::Correlation(stat));
    }
    let all_w = weights(all_c).ok_or_else(|| MvpError::Weights("all heroes".into()))?;

    let mut durations: Vec<u32> = rows.iter().map(|r| r.duration_s).collect();
    durations.sort_unstable();
    let cuts = length_cuts(&durations);

    let mut by_hero: BTreeMap<u32, Vec<&SampleRow>> = BTreeMap::new();
    for row in rows {
        by_hero.entry(row.hero_id).or_default().push(row);
    }
    let heroes: BTreeMap<u32, HeroModel> = by_hero
        .iter()
        .map(|(&hero_id, rows)| {
            let quantiles: [Option<Vec<f64>>; STAT_COUNT] = std::array::from_fn(|s| hero_quantiles(rows, s));
            let own = if rows.len() >= MIN_HERO_ROWS { weights(correlations(rows)) } else { None };
            let length_quantiles = std::array::from_fn(|bucket| {
                let rows: Vec<&SampleRow> =
                    rows.iter().copied().filter(|r| length_bucket(&cuts, r.duration_s) == bucket).collect();
                (rows.len() >= MIN_BUCKET_ROWS)
                    .then(|| std::array::from_fn(|s| quantiles[s].as_ref().map(|_| stat_knots(&rows, s))))
            });
            let hero = HeroModel { n: rows.len(), w: own.unwrap_or(all_w), quantiles, length_quantiles };
            (hero_id, hero)
        })
        .collect();

    check_weights("all heroes", &all_w)?;
    for (hero_id, hero) in &heroes {
        check_weights(&format!("hero {hero_id}"), &hero.w)?;
    }

    let mut tiers: BTreeMap<u32, TierSums> = BTreeMap::new();
    for row in rows {
        if let Some(badge) = row.lobby_badge {
            tiers
                .entry(tier(badge))
                .or_default()
                .add(&heroes[&row.hero_id].percentiles(&row.per_minute, length_bucket(&cuts, row.duration_s)));
        }
    }
    let rank_skew = tier_skews(&tiers);

    let mut composites: Vec<f64> = rows
        .iter()
        .filter_map(|row| {
            let hero = &heroes[&row.hero_id];
            let mut percentiles = hero.percentiles(&row.per_minute, length_bucket(&cuts, row.duration_s));
            if let Some(skew) = row.lobby_badge.and_then(|b| rank_skew.get(&tier(b))) {
                apply(skew, &mut percentiles);
            }
            hero.composite(&percentiles)
        })
        .collect();
    sort_ascending(&mut composites);

    Ok(ModelCache {
        model_version: MODEL_VERSION,
        built_at,
        sample: sample.summary.clone(),
        stats: STATS.to_vec(),
        all_heroes: AllHeroes { w: all_w },
        heroes,
        length_cuts: cuts,
        rank_skew,
        calibration: quantiles(&composites, CALIBRATION_KNOTS),
    })
}

/// Cut-offs at the 1/3 and 2/3 positions of the ascending durations; a duration at a cut-off starts the next
/// bucket.
fn length_bucket(cuts: &[u32; LENGTH_BUCKETS - 1], duration_s: u32) -> usize {
    cuts.iter().filter(|&&cut| duration_s >= cut).count()
}

fn length_cuts(sorted_durations: &[u32]) -> [u32; LENGTH_BUCKETS - 1] {
    std::array::from_fn(|k| sorted_durations[(k + 1) * sorted_durations.len() / LENGTH_BUCKETS])
}

fn check_weights(owner: &str, w: &[f64; STAT_COUNT]) -> Result<(), MvpError> {
    let sum: f64 = w.iter().sum();
    if w.iter().all(|x| x.is_finite()) && (sum - 1.0).abs() < 1e-9 {
        Ok(())
    } else {
        Err(MvpError::Weights(owner.into()))
    }
}

/// `w = 0.03 + 0.76 · c / Σc` after NaN → 0 and `c = max(c, 0)`; `None` when no stat tracks winning.
pub(crate) fn weights(correlations: [f64; STAT_COUNT]) -> Option<[f64; STAT_COUNT]> {
    let c = correlations.map(|c| if c.is_nan() { 0.0 } else { c.max(0.0) });
    let total: f64 = c.iter().sum();
    let spread = 1.0 - WEIGHT_FLOOR * STAT_COUNT as f64;
    (total > 0.0).then(|| c.map(|c| WEIGHT_FLOOR + spread * c / total))
}

fn correlations(rows: &[&SampleRow]) -> [f64; STAT_COUNT] {
    let won: Vec<f64> = rows.iter().map(|r| if r.won { 1.0 } else { 0.0 }).collect();
    std::array::from_fn(|s| {
        let sign = if s == DEATHS { -1.0 } else { 1.0 };
        let values: Vec<f64> = rows.iter().map(|r| sign * r.per_minute[s]).collect();
        spearman(&values, &won)
    })
}

fn hero_quantiles(rows: &[&SampleRow], s: usize) -> Option<Vec<f64>> {
    rows.iter().any(|r| r.per_minute[s] != 0.0).then(|| stat_knots(rows, s))
}

fn stat_knots(rows: &[&SampleRow], s: usize) -> Vec<f64> {
    let mut values: Vec<f64> = rows.iter().map(|r| r.per_minute[s]).collect();
    sort_ascending(&mut values);
    // Rounded so the cache stays small; the calibration is built from these same rounded knots.
    quantiles(&values, STAT_KNOTS).into_iter().map(|v| (v * 1e4).round() / 1e4).collect()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn weights_floor_each_stat_and_sum_to_one() {
        let w = weights([0.2, f64::NAN, -0.1, 0.2, 0.0, 0.0, 0.0, 0.0]).unwrap();
        let expected = [0.41, 0.03, 0.03, 0.41, 0.03, 0.03, 0.03, 0.03];
        assert!(w.iter().zip(expected).all(|(a, b)| close(*a, b)), "{w:?}");
        assert!(close(w.iter().sum(), 1.0));
    }

    #[test]
    fn weights_are_none_when_no_stat_tracks_winning() {
        assert_eq!(weights([0.0, -0.3, f64::NAN, 0.0, 0.0, 0.0, -0.1, 0.0]), None);
    }

    /// Deterministic rows: every stat but damage and self healing leans toward the winners.
    pub(crate) fn synthetic_rows(hero_id: u32, n: usize, seed: u64, support: bool) -> Vec<SampleRow> {
        let mut state = seed;
        let mut noise = move || {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (state >> 11) as f64 / (1u64 << 53) as f64
        };
        (0..n)
            .map(|i| {
                let won = i % 2 == 0;
                let edge = if won { 0.6 } else { 0.0 };
                SampleRow {
                    hero_id,
                    won,
                    duration_s: 900 + (i as u32 * 37) % 2400,
                    lobby_badge: None,
                    per_minute: [
                        noise() + edge,
                        noise() + 0.6 - edge,
                        noise() + edge,
                        500.0 + 300.0 * (noise() + edge),
                        800.0 * noise(),
                        100.0 * (noise() + edge),
                        50.0 * noise(),
                        if support { 30.0 * (noise() + edge) } else { 0.0 },
                    ],
                }
            })
            .collect()
    }

    pub(crate) fn synthetic_sample(rows: Vec<SampleRow>) -> Sample {
        let summary = SampleSummary { rows: rows.len(), matches: rows.len() / 12, min_match_id: 1, max_match_id: 9 };
        Sample { rows, summary }
    }

    fn two_hero_sample() -> Sample {
        let mut rows = synthetic_rows(1, 300, 7, true);
        rows.extend(synthetic_rows(2, 100, 11, false));
        synthetic_sample(rows)
    }

    #[test]
    fn heroes_below_the_row_floor_use_the_all_hero_weights() {
        let cache = build(&two_hero_sample(), 1_000, 400).unwrap();
        assert_eq!(cache.heroes[&1].n, 300);
        assert_eq!(cache.heroes[&2].n, 100);
        assert_eq!(cache.heroes[&2].w, cache.all_heroes.w);
        assert_ne!(cache.heroes[&1].w, cache.all_heroes.w);
        for w in cache.heroes.values().map(|h| h.w).chain([cache.all_heroes.w]) {
            assert!(close(w.iter().sum(), 1.0));
            assert!(w.iter().all(|&x| x >= WEIGHT_FLOOR - 1e-12));
        }
    }

    #[test]
    fn a_stat_that_is_zero_for_every_row_of_a_hero_is_skipped() {
        let cache = build(&two_hero_sample(), 1_000, 400).unwrap();
        assert_eq!(cache.heroes[&2].quantiles[7], None);
        let knots = cache.heroes[&1].quantiles[7].as_ref().unwrap();
        assert_eq!(knots.len(), STAT_KNOTS);
        assert!(knots.windows(2).all(|p| p[0] <= p[1]));
    }

    #[test]
    fn calibration_is_1001_ascending_composite_quantiles() {
        let cache = build(&two_hero_sample(), 1_000, 400).unwrap();
        assert_eq!(cache.calibration.len(), CALIBRATION_KNOTS);
        assert!(cache.calibration.windows(2).all(|p| p[0] <= p[1]));
        assert!(cache.calibration[0] >= 0.0 && cache.calibration[1000] <= 100.0);
        assert_eq!(cache.stats, STATS.to_vec());
        assert_eq!((cache.model_version, cache.built_at), (MODEL_VERSION, 1_000));
        assert_eq!(cache.sample.rows, 400);
    }

    #[test]
    fn composite_renormalises_over_the_stats_the_hero_has() {
        let hero = HeroModel {
            n: 300,
            w: [0.3, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
            quantiles: std::array::from_fn(|s| (s != 7).then(|| vec![0.0, 2.0])),
            length_quantiles: Default::default(),
        };
        let p = hero.percentiles(&[2.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], 0);
        assert_eq!(p, [Some(100.0), Some(50.0), Some(50.0), Some(50.0), Some(50.0), Some(50.0), Some(50.0), None]);
        // (0.3 · 100 + 0.6 · 50) / 0.9; deaths at p 50 count as 100 − 50.
        assert!(close(hero.composite(&p).unwrap(), 60.0 / 0.9));
        let deaths_high = hero.percentiles(&[2.0, 2.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], 0);
        assert!(close(hero.composite(&deaths_high).unwrap(), 55.0 / 0.9));
    }

    #[test]
    fn too_few_rows_fail_the_build() {
        assert_eq!(build(&two_hero_sample(), 0, 501), Err(MvpError::TooFewRows { rows: 400, need: 401 }));
    }

    #[test]
    fn a_lopsided_win_rate_fails_the_build() {
        let mut sample = two_hero_sample();
        for row in sample.rows.iter_mut().take(40) {
            row.won = true;
        }
        assert!(matches!(build(&sample, 0, 400), Err(MvpError::WinRate(r)) if close(r, 0.55)));
    }

    #[test]
    fn assists_that_do_not_track_winning_fail_the_build() {
        let mut sample = two_hero_sample();
        for row in &mut sample.rows {
            row.per_minute[2] = if row.won { 0.0 } else { 1.0 };
        }
        assert_eq!(build(&sample, 0, 400), Err(MvpError::Correlation(Stat::Assists)));
    }

    fn ranked_sample() -> Sample {
        let mut rows = synthetic_rows(1, 300, 7, true);
        let mut ranked = synthetic_rows(1, 1200, 13, true);
        for row in &mut ranked {
            row.lobby_badge = Some(35);
            row.per_minute[0] += 0.5;
        }
        rows.extend(ranked);
        synthetic_sample(rows)
    }

    #[test]
    fn rank_skew_is_the_mean_raw_percentile_of_a_tier() {
        let sample = ranked_sample();
        let cache = build(&sample, 0, 1500).unwrap();
        assert_eq!(cache.rank_skew.keys().copied().collect::<Vec<_>>(), vec![3]);
        let skew = &cache.rank_skew[&3];
        assert_eq!(skew.n, 1200);
        let hero = &cache.heroes[&1];
        let ranked: Vec<_> = sample.rows.iter().filter(|r| r.lobby_badge.is_some()).collect();
        for s in 0..STAT_COUNT {
            let mean = ranked
                .iter()
                .map(|r| hero.percentiles(&r.per_minute, cache.length_bucket(r.duration_s))[s].unwrap())
                .sum::<f64>()
                / 1200.0;
            assert!(close(skew.m[s], mean), "{s}: {} vs {mean}", skew.m[s]);
        }
        assert!(skew.m[0] > 55.0, "ranked kills lean high: {}", skew.m[0]);
    }

    #[test]
    fn calibration_uses_skewed_ranked_composites() {
        let sample = ranked_sample();
        let cache = build(&sample, 0, 1500).unwrap();
        let hero = &cache.heroes[&1];
        let mut composites: Vec<f64> = sample
            .rows
            .iter()
            .map(|r| {
                let mut p = hero.percentiles(&r.per_minute, cache.length_bucket(r.duration_s));
                if r.lobby_badge.is_some() {
                    apply(&cache.rank_skew[&3], &mut p);
                }
                hero.composite(&p).unwrap()
            })
            .collect();
        sort_ascending(&mut composites);
        assert_eq!(cache.calibration, quantiles(&composites, CALIBRATION_KNOTS));
    }

    #[test]
    fn length_cuts_split_the_durations_into_terciles() {
        let durations: Vec<u32> = (6..=14).map(|m| m * 100).collect();
        assert_eq!(length_cuts(&durations), [900, 1200]);
        let cache = ModelCache { length_cuts: [900, 1200], ..build(&two_hero_sample(), 0, 400).unwrap() };
        let buckets: Vec<usize> = [600, 899, 900, 1199, 1200, 5000].map(|d| cache.length_bucket(d)).to_vec();
        assert_eq!(buckets, vec![0, 0, 1, 1, 2, 2]);
    }

    #[test]
    fn heroes_get_length_bucket_quantiles_above_the_floor() {
        let sample = ranked_sample();
        let cache = build(&sample, 0, 1500).unwrap();
        let mut durations: Vec<u32> = sample.rows.iter().map(|r| r.duration_s).collect();
        durations.sort_unstable();
        assert_eq!(cache.length_cuts, length_cuts(&durations));
        let hero = &cache.heroes[&1];
        for bucket in 0..LENGTH_BUCKETS {
            let rows: Vec<&SampleRow> =
                sample.rows.iter().filter(|r| cache.length_bucket(r.duration_s) == bucket).collect();
            assert!(rows.len() >= MIN_BUCKET_ROWS);
            let table = hero.length_quantiles[bucket].as_ref().unwrap();
            assert_eq!(table[0], hero_quantiles(&rows, 0), "{bucket}");
        }
        let thin = build(&two_hero_sample(), 0, 400).unwrap();
        assert_eq!(thin.heroes[&2].length_quantiles, [None, None, None]);
    }

    #[test]
    fn percentiles_read_the_bucket_table_when_there_is_one() {
        let mut long: [Option<Vec<f64>>; STAT_COUNT] = std::array::from_fn(|_| Some(vec![0.0, 4.0]));
        long[7] = None;
        let hero = HeroModel {
            n: 300,
            w: [0.125; STAT_COUNT],
            quantiles: std::array::from_fn(|s| (s != 7).then(|| vec![0.0, 2.0])),
            length_quantiles: [None, None, Some(long)],
        };
        let pm = [2.0; STAT_COUNT];
        assert_eq!(hero.percentiles(&pm, 0)[0], Some(100.0));
        assert_eq!(hero.percentiles(&pm, 2)[0], Some(50.0));
        assert_eq!(hero.percentiles(&pm, 2)[7], None);
    }

    #[test]
    fn a_sample_without_ranked_rows_has_no_skew() {
        assert!(build(&two_hero_sample(), 0, 400).unwrap().rank_skew.is_empty());
    }

    #[test]
    fn refreshes_after_a_week_or_when_built_in_the_future() {
        let cache = build(&two_hero_sample(), 1_000_000, 400).unwrap();
        assert!(!cache.needs_refresh(1_000_000 + 7 * DAY_S));
        assert!(cache.needs_refresh(1_000_000 + 7 * DAY_S + 1));
        assert!(!cache.needs_refresh(1_000_000 - DAY_S));
        assert!(cache.needs_refresh(1_000_000 - DAY_S - 1));
        let old = ModelCache { model_version: MODEL_VERSION - 1, ..cache };
        assert!(old.needs_refresh(1_000_000));
    }

    #[test]
    fn the_cache_round_trips_through_json_with_the_planned_keys() {
        let cache = build(&two_hero_sample(), 1_000, 400).unwrap();
        let json = serde_json::to_value(&cache).unwrap();
        for key in
            ["model_version", "built_at", "sample", "stats", "all_heroes", "heroes", "length_cuts", "calibration"]
        {
            assert!(json.get(key).is_some(), "{key}");
        }
        assert_eq!(json["stats"][7], "support");
        assert_eq!(json["heroes"]["2"]["quantiles"][7], serde_json::Value::Null);
        let back: ModelCache = serde_json::from_value(json).unwrap();
        assert_eq!(back.heroes, cache.heroes);
        assert_eq!(back.calibration.len(), CALIBRATION_KNOTS);
    }
}
