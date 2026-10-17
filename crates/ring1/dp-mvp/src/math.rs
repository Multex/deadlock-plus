use std::cmp::Ordering;

/// 1-based ranks; tied values share the average of the ranks they span.
pub(crate) fn average_ranks(values: &[f64]) -> Vec<f64> {
    let mut order: Vec<usize> = (0..values.len()).collect();
    order.sort_by(|&a, &b| values[a].total_cmp(&values[b]));
    let mut ranks = vec![0.0; values.len()];
    let mut start = 0;
    while start < order.len() {
        let mut end = start + 1;
        while end < order.len() && values[order[end]] == values[order[start]] {
            end += 1;
        }
        let rank = (start + end + 1) as f64 / 2.0;
        for &i in &order[start..end] {
            ranks[i] = rank;
        }
        start = end;
    }
    ranks
}

/// Spearman correlation with average ranks. NaN when either side is constant.
pub(crate) fn spearman(x: &[f64], y: &[f64]) -> f64 {
    pearson(&average_ranks(x), &average_ranks(y))
}

fn pearson(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len() as f64;
    let mean_x = x.iter().sum::<f64>() / n;
    let mean_y = y.iter().sum::<f64>() / n;
    let (mut cov, mut var_x, mut var_y) = (0.0, 0.0, 0.0);
    for (a, b) in x.iter().zip(y) {
        let (dx, dy) = (a - mean_x, b - mean_y);
        cov += dx * dy;
        var_x += dx * dx;
        var_y += dy * dy;
    }
    cov / (var_x * var_y).sqrt()
}

/// `100 · (#{< v} + 0.5 · #{= v}) / n` over an ascending slice.
pub(crate) fn mid_rank(sorted: &[f64], v: f64) -> f64 {
    let below = sorted.partition_point(|&x| x < v);
    let at_or_below = sorted.partition_point(|&x| x <= v);
    100.0 * (below as f64 + 0.5 * (at_or_below - below) as f64) / sorted.len() as f64
}

/// `knots` evenly spaced quantiles (first = min, last = max) of an ascending slice, interpolating between
/// neighbouring values.
pub(crate) fn quantiles(sorted: &[f64], knots: usize) -> Vec<f64> {
    let last = (sorted.len() - 1) as f64;
    (0..knots)
        .map(|k| {
            let h = last * k as f64 / (knots - 1) as f64;
            let (lo, hi) = (h.floor() as usize, h.ceil() as usize);
            sorted[lo] + (h - lo as f64) * (sorted[hi] - sorted[lo])
        })
        .collect()
}

/// Mid-rank percentile read back from a quantile table: linear between knots, and the middle of the run when
/// `v` equals several knots, so heavy ties (a stat that is 0 for most rows) land where the row mid-rank would.
pub(crate) fn knot_percentile(knots: &[f64], v: f64) -> f64 {
    let steps = (knots.len() - 1) as f64;
    let below = knots.partition_point(|&x| x < v);
    let at_or_below = knots.partition_point(|&x| x <= v);
    let position = if at_or_below > below {
        (below + at_or_below - 1) as f64 / 2.0
    } else if below == 0 {
        0.0
    } else if below == knots.len() {
        steps
    } else {
        let (a, b) = (knots[below - 1], knots[below]);
        (below - 1) as f64 + (v - a) / (b - a)
    };
    100.0 * position / steps
}

pub(crate) fn sort_ascending(values: &mut [f64]) {
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn ties_share_the_average_rank() {
        assert_eq!(average_ranks(&[20.0, 10.0, 30.0, 20.0]), vec![2.5, 1.0, 4.0, 2.5]);
        assert_eq!(average_ranks(&[0.0, 0.0, 0.0]), vec![2.0, 2.0, 2.0]);
    }

    #[test]
    fn spearman_of_a_monotone_pair_is_one() {
        assert!(close(spearman(&[1.0, 2.0, 3.0, 4.0], &[10.0, 40.0, 90.0, 160.0]), 1.0));
        assert!(close(spearman(&[1.0, 2.0, 3.0, 4.0], &[4.0, 3.0, 2.0, 1.0]), -1.0));
    }

    #[test]
    fn spearman_uses_average_ranks_for_ties() {
        // ranks x = 1, 2.5, 2.5, 4; y = 1.5, 1.5, 3.5, 3.5; cov 3, var 4.5 and 4 → 3 / √18
        let r = spearman(&[1.0, 2.0, 2.0, 3.0], &[0.0, 0.0, 1.0, 1.0]);
        assert!(close(r, 3.0 / 18f64.sqrt()), "{r}");
    }

    #[test]
    fn spearman_against_a_constant_is_nan() {
        assert!(spearman(&[1.0, 2.0, 3.0], &[0.0, 0.0, 0.0]).is_nan());
    }

    #[test]
    fn mid_rank_counts_ties_as_half() {
        let s = [1.0, 2.0, 2.0, 4.0];
        assert!(close(mid_rank(&s, 2.0), 50.0));
        assert!(close(mid_rank(&s, 4.0), 87.5));
        assert!(close(mid_rank(&s, 3.0), 75.0));
        assert!(close(mid_rank(&s, 0.0), 0.0));
        assert!(close(mid_rank(&s, 5.0), 100.0));
    }

    #[test]
    fn quantiles_interpolate_between_values() {
        assert_eq!(quantiles(&[0.0, 10.0, 20.0, 30.0, 40.0], 5), vec![0.0, 10.0, 20.0, 30.0, 40.0]);
        assert_eq!(quantiles(&[1.0, 2.0, 3.0, 4.0], 3), vec![1.0, 2.5, 4.0]);
        assert_eq!(quantiles(&[7.0], 3), vec![7.0, 7.0, 7.0]);
    }

    #[test]
    fn knot_percentile_interpolates_and_centres_tied_runs() {
        let k = [0.0, 0.0, 0.0, 10.0, 20.0];
        assert!(close(knot_percentile(&k, 0.0), 25.0));
        assert!(close(knot_percentile(&k, 5.0), 62.5));
        assert!(close(knot_percentile(&k, 10.0), 75.0));
        assert!(close(knot_percentile(&k, 15.0), 87.5));
        assert!(close(knot_percentile(&k, 20.0), 100.0));
        assert!(close(knot_percentile(&k, -1.0), 0.0));
        assert!(close(knot_percentile(&k, 25.0), 100.0));
        assert!(close(knot_percentile(&[3.0, 3.0, 3.0], 3.0), 50.0));
    }
}
