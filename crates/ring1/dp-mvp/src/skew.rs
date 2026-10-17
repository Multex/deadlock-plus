use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::stat::{Percentiles, STAT_COUNT};

const MIN_LOBBY_RANKS: usize = 4;
const SUBRANKS: u32 = 6;
/// Tiers with fewer sample rows pool with their neighbours and shrink toward 50 by `n / (n + MIN_TIER_ROWS)`.
const MIN_TIER_ROWS: usize = 1000;

/// Mean raw percentile per stat of the sample's players in lobbies of one rank tier.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TierSkew {
    /// Rows behind `m`, after pooling.
    pub n: usize,
    pub m: [f64; STAT_COUNT],
}

/// Mean badge of a lobby from its players' badges, or `None` when fewer than 4 are usable (missing or 0).
/// Badges skip subranks 7-9 (56 is followed by 61), so the mean is taken on a dense scale of 6 subranks per
/// tier and mapped back.
pub fn lobby_badge_from_ranks(ranks: &[Option<u32>]) -> Option<u32> {
    let dense: Vec<u32> = ranks.iter().flatten().filter(|&&b| b > 0).map(|b| b - 4 * (b / 10)).collect();
    if dense.len() < MIN_LOBBY_RANKS {
        return None;
    }
    let m = (dense.iter().sum::<u32>() as f64 / dense.len() as f64 + 0.5).floor() as u32;
    Some(m + 4 * ((m - 1) / SUBRANKS))
}

pub(crate) fn tier(badge: u32) -> u32 {
    badge / 10
}

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct TierSums {
    pub n: usize,
    pub sum: [f64; STAT_COUNT],
    pub count: [usize; STAT_COUNT],
}

impl TierSums {
    pub fn add(&mut self, percentiles: &Percentiles) {
        self.n += 1;
        for (s, p) in percentiles.iter().enumerate() {
            if let Some(p) = p {
                self.sum[s] += p;
                self.count[s] += 1;
            }
        }
    }
}

pub(crate) fn tier_skews(sums: &BTreeMap<u32, TierSums>) -> BTreeMap<u32, TierSkew> {
    sums.iter()
        .map(|(&t, own)| {
            let small = own.n < MIN_TIER_ROWS;
            let pooled: Vec<&TierSums> =
                if small { (t.saturating_sub(1)..=t + 1).filter_map(|n| sums.get(&n)).collect() } else { vec![own] };
            let n: usize = pooled.iter().map(|s| s.n).sum();
            let shrink = if small { n as f64 / (n + MIN_TIER_ROWS) as f64 } else { 1.0 };
            let m = std::array::from_fn(|s| {
                let count: usize = pooled.iter().map(|p| p.count[s]).sum();
                if count == 0 {
                    return 50.0;
                }
                let mean = pooled.iter().map(|p| p.sum[s]).sum::<f64>() / count as f64;
                50.0 + (mean - 50.0) * shrink
            });
            (t, TierSkew { n, m })
        })
        .collect()
}

/// `p_adj = clamp(p − (m − 50), 0, 100)` on the raw percentiles.
pub(crate) fn apply(skew: &TierSkew, percentiles: &mut Percentiles) {
    for (p, m) in percentiles.iter_mut().zip(skew.m) {
        if let Some(p) = p {
            *p = (*p - (m - 50.0)).clamp(0.0, 100.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn lobby_badge_needs_four_usable_ranks() {
        assert_eq!(lobby_badge_from_ranks(&[Some(11), Some(16), None, Some(0), Some(21)]), None);
        assert_eq!(lobby_badge_from_ranks(&[]), None);
        assert_eq!(lobby_badge_from_ranks(&[Some(55); 4]), Some(55));
    }

    #[test]
    fn lobby_badge_means_on_the_dense_subrank_scale() {
        // dense 7, 7, 12, 12 → 9.5 → 10 → badge 14
        assert_eq!(lobby_badge_from_ranks(&[Some(11), Some(11), Some(16), Some(16)]), Some(14));
        // dense 36, 36, 37, 37 → 36.5 → 37 → 61, never 59
        assert_eq!(lobby_badge_from_ranks(&[Some(56), Some(56), Some(61), Some(61), None]), Some(61));
        assert_eq!(lobby_badge_from_ranks(&[Some(116), Some(116), Some(115), Some(116)]), Some(116));
    }

    #[test]
    fn badges_map_to_tiers() {
        assert_eq!((tier(11), tier(56), tier(61), tier(116)), (1, 5, 6, 11));
    }

    fn sums(n: usize, mean: f64) -> TierSums {
        TierSums { n, sum: [mean * n as f64; STAT_COUNT], count: [n; STAT_COUNT] }
    }

    #[test]
    fn tier_sums_skip_missing_stats() {
        let mut s = TierSums::default();
        s.add(&[Some(40.0), None, Some(10.0), None, None, None, None, None]);
        s.add(&[Some(60.0), Some(20.0), None, None, None, None, None, None]);
        assert_eq!(s.n, 2);
        assert_eq!(s.sum[..3], [100.0, 20.0, 10.0]);
        assert_eq!(s.count[..4], [2, 1, 1, 0]);
    }

    #[test]
    fn large_tiers_keep_their_own_mean_and_small_ones_pool_and_shrink() {
        let input = BTreeMap::from([(5, sums(2000, 60.0)), (6, sums(500, 40.0)), (7, sums(1500, 50.0))]);
        let out = tier_skews(&input);
        assert_eq!(out[&5], TierSkew { n: 2000, m: [60.0; STAT_COUNT] });
        assert_eq!(out[&7], TierSkew { n: 1500, m: [50.0; STAT_COUNT] });
        // pooled 5-7: n 4000, mean 53.75; shrunk 50 + 3.75 · 4000 / 5000 = 53
        assert_eq!(out[&6].n, 4000);
        assert!(out[&6].m.iter().all(|&m| close(m, 53.0)), "{:?}", out[&6]);
    }

    #[test]
    fn an_edge_tier_pools_with_its_one_neighbour() {
        let input = BTreeMap::from([(1, sums(200, 30.0)), (2, sums(1800, 45.0))]);
        let out = tier_skews(&input);
        // pooled n 2000, mean (6000 + 81000) / 2000 = 43.5; shrunk 50 − 6.5 · 2000 / 3000
        assert_eq!(out[&1].n, 2000);
        assert!(close(out[&1].m[0], 50.0 - 6.5 * 2.0 / 3.0));
    }

    #[test]
    fn a_stat_no_row_has_stays_centred() {
        let mut s = sums(1200, 70.0);
        s.count[7] = 0;
        s.sum[7] = 0.0;
        let out = tier_skews(&BTreeMap::from([(4, s)]));
        assert_eq!(out[&4].m[7], 50.0);
    }

    #[test]
    fn apply_shifts_by_the_tier_offset_and_clamps() {
        let skew = TierSkew { n: 2000, m: [40.0, 60.0, 60.0, 50.0, 50.0, 50.0, 50.0, 50.0] };
        let mut p = [Some(95.0), Some(30.0), Some(5.0), None, Some(50.0), Some(0.0), Some(100.0), Some(20.0)];
        apply(&skew, &mut p);
        assert_eq!(p, [Some(100.0), Some(20.0), Some(0.0), None, Some(50.0), Some(0.0), Some(100.0), Some(20.0)]);
    }
}
