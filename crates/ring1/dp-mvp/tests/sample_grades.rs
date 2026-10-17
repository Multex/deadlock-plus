use std::collections::BTreeMap;

use dp_mvp::{
    build, parse_matches, LastStats, MatchGrade, MatchInput, ModelCache, MvpLetter, PlayerInput, Sample, SampleMatch,
};

const FIXTURE: &str = include_str!("../fixtures/sample.json");

fn as_input(m: &SampleMatch) -> MatchInput {
    let players = m
        .players
        .iter()
        .map(|p| PlayerInput {
            account_id: 1,
            player_slot: p.player_slot,
            hero_id: p.hero_id,
            abandon_match_time_s: p.abandon_match_time_s.unwrap_or(0),
            player_match_outcome: if p.team == m.winning_team { 1 } else { 2 },
            kills: p.kills.unwrap_or(0.0) as u32,
            deaths: p.deaths.unwrap_or(0.0) as u32,
            assists: p.assists.unwrap_or(0.0) as u32,
            net_worth: p.net_worth.unwrap_or(0.0) as u32,
            last_stats: Some(LastStats {
                player_damage: p.max_player_damage.unwrap_or(0.0) as u32,
                boss_damage: p.max_boss_damage.unwrap_or(0.0) as u32,
                player_healing: p.max_player_healing.unwrap_or(0.0) as u32,
                teammate_healing: p.max_teammate_healing.unwrap_or(0.0) as u32,
                teammate_barriering: p.max_teammate_barriering.unwrap_or(0.0) as u32,
            }),
            path_len: None,
        })
        .collect();
    MatchInput {
        match_id: m.match_id,
        game_mode: 1,
        match_mode: 1,
        match_outcome: 0,
        not_scored: false,
        low_pri_pool: false,
        duration_s: m.duration_s,
        lobby_badge: m.average_badge,
        players,
    }
}

fn fixture_cache() -> (Vec<SampleMatch>, ModelCache) {
    let matches = parse_matches(FIXTURE).unwrap();
    let sample = Sample::from_matches(&matches).unwrap();
    let cache = build(&sample, 1_792_000_000, sample.rows.len()).unwrap();
    (matches, cache)
}

fn order(cache: &ModelCache, matches: &[SampleMatch], match_id: u64) -> (bool, Vec<(u32, u8, u16)>) {
    let m = matches.iter().find(|m| m.match_id == match_id).unwrap();
    let grade = cache.grade(&as_input(m)).unwrap();
    (grade.leaver, grade.players.iter().map(|p| (p.player_slot, p.place, p.s10)).collect())
}

#[test]
fn fixture_matches_grade_to_a_pinned_order() {
    let (matches, cache) = fixture_cache();
    let clean = vec![
        (7, 1, 930),
        (12, 2, 922),
        (11, 3, 920),
        (10, 4, 827),
        (9, 5, 593),
        (8, 6, 591),
        (4, 7, 298),
        (1, 8, 285),
        (2, 9, 256),
        (6, 10, 226),
        (5, 11, 83),
        (3, 12, 41),
    ];
    assert_eq!(order(&cache, &matches, 118340487), (false, clean));
    let with_a_leaver = vec![
        (12, 1, 894),
        (11, 2, 892),
        (7, 3, 735),
        (8, 4, 577),
        (10, 5, 458),
        (9, 6, 256),
        (3, 7, 255),
        (2, 8, 186),
        (6, 9, 185),
        (5, 10, 58),
        (1, 11, 51),
    ];
    assert_eq!(order(&cache, &matches, 118338426), (true, with_a_leaver));
    let ranked_badge_52 = vec![
        (3, 1, 908),
        (5, 2, 907),
        (2, 3, 848),
        (6, 4, 788),
        (4, 5, 776),
        (1, 6, 446),
        (9, 7, 389),
        (10, 8, 372),
        (8, 9, 290),
        (11, 10, 264),
        (7, 11, 122),
        (12, 12, 35),
    ];
    assert_eq!(order(&cache, &matches, 118340277), (false, ranked_badge_52));
}

#[test]
fn a_cache_read_back_from_json_grades_the_same() {
    let (matches, cache) = fixture_cache();
    let back: ModelCache = serde_json::from_str(&serde_json::to_string(&cache).unwrap()).unwrap();
    for m in matches.iter().take(30) {
        assert_eq!(back.grade(&as_input(m)), cache.grade(&as_input(m)), "{}", m.match_id);
    }
}

/// Run with `MVP_SAMPLE=<path to a recorded GraphQL matches body> cargo test -p dp-mvp -- --ignored --nocapture`.
/// With `MVP_HOLDOUT=<path to another body>`, the model is built on `MVP_SAMPLE` and the checks grade the holdout.
#[test]
#[ignore]
fn validation_against_a_recorded_sample() {
    let path = std::env::var("MVP_SAMPLE").expect("MVP_SAMPLE");
    let matches = parse_matches(&std::fs::read_to_string(path).unwrap()).unwrap();
    let sample = Sample::from_matches(&matches).unwrap();
    let cache = build(&sample, 0, 100_000).unwrap();
    let fallback = cache.heroes.values().filter(|h| h.n < dp_mvp::MIN_HERO_ROWS).count();
    println!(
        "rows {} matches {} heroes {} (fallback {fallback})",
        sample.rows.len(),
        sample.summary.matches,
        cache.heroes.len()
    );
    println!("cache JSON {} KB", serde_json::to_string(&cache).unwrap().len() / 1024);
    let thin = cache.heroes.values().flat_map(|h| &h.length_quantiles).filter(|b| b.is_none()).count();
    println!("length cuts {:?}; hero length buckets on the hero-wide table {thin}", cache.length_cuts);

    let mut unskewed_sample = sample.clone();
    for row in &mut unskewed_sample.rows {
        row.lobby_badge = None;
    }
    let unskewed = build(&unskewed_sample, 0, 100_000).unwrap();

    let graded_matches = match std::env::var("MVP_HOLDOUT") {
        Ok(path) => {
            let holdout = parse_matches(&std::fs::read_to_string(path).unwrap()).unwrap();
            let ids = (holdout.iter().map(|m| m.match_id).min(), holdout.iter().map(|m| m.match_id).max());
            println!("holdout: {} matches, ids {ids:?}", holdout.len());
            holdout
        }
        Err(_) => matches.clone(),
    };
    let kept: Vec<&SampleMatch> = graded_matches
        .iter()
        .filter(|m| m.players.len() >= 12 && m.players.iter().all(|p| p.abandon_match_time_s == Some(0)))
        .collect();
    let grades: Vec<(&SampleMatch, MatchGrade)> =
        kept.iter().map(|m| (*m, cache.grade(&as_input(m)).unwrap())).collect();

    let mut places: BTreeMap<u32, (f64, usize)> = BTreeMap::new();
    let (mut firsts, mut losing_firsts, mut graded, mut s_plus, mut f) = (0, 0, 0, 0, 0);
    for (m, grade) in &grades {
        for g in &grade.players {
            let entry = places.entry(g.hero_id).or_default();
            entry.0 += g.place as f64;
            entry.1 += 1;
            graded += 1;
            s_plus += (g.letter == MvpLetter::SPlus) as usize;
            f += (g.letter == MvpLetter::F) as usize;
            if g.place == 1 {
                firsts += 1;
                let p = m.players.iter().find(|p| p.player_slot == g.player_slot).unwrap();
                losing_firsts += (p.team != m.winning_team) as usize;
            }
        }
    }
    let means: Vec<f64> = places.values().map(|(sum, n)| sum / *n as f64).collect();
    let (lo, hi) = means.iter().fold((f64::MAX, f64::MIN), |(lo, hi), &x| (lo.min(x), hi.max(x)));
    let losing_share = losing_firsts as f64 / firsts as f64;
    let s_plus_share = s_plus as f64 / graded as f64;
    let f_share = f as f64 / graded as f64;
    let candidates: usize = grades.iter().map(|(m, _)| m.players.len()).sum();
    println!("graded {graded} of {candidates} players; mean place per hero {lo:.2}-{hi:.2}");
    println!("losing-team place-1 share {:.1} % ({losing_firsts}/{firsts})", 100.0 * losing_share);
    println!("S+ {:.1} %, F {:.1} %", 100.0 * s_plus_share, 100.0 * f_share);

    let mut by_length: Vec<(u32, f64)> =
        grades.iter().flat_map(|(m, g)| g.players.iter().map(|p| (m.duration_s, p.score))).collect();
    by_length.sort_by_key(|(d, _)| *d);
    let third = by_length.len() / 3;
    let terciles: Vec<(u32, u32, f64)> = [&by_length[..third], &by_length[third..2 * third], &by_length[2 * third..]]
        .iter()
        .map(|chunk| {
            let mean = chunk.iter().map(|(_, s)| s).sum::<f64>() / chunk.len() as f64;
            (chunk[0].0, chunk[chunk.len() - 1].0, mean)
        })
        .collect();
    for (from, to, mean) in &terciles {
        println!("length {from}-{to} s: mean score {mean:.2}");
    }

    let mut before: BTreeMap<u32, (f64, usize)> = BTreeMap::new();
    let mut after: BTreeMap<u32, (f64, usize)> = BTreeMap::new();
    for (m, grade) in &grades {
        let Some(badge) = m.average_badge else { continue };
        let plain = unskewed.grade(&MatchInput { lobby_badge: None, ..as_input(m) }).unwrap();
        for (table, g) in [(&mut before, &plain), (&mut after, grade)] {
            let entry = table.entry(badge / 10).or_default();
            entry.0 += g.players.iter().map(|p| p.score).sum::<f64>();
            entry.1 += g.players.len();
        }
    }
    let mut tier_means = Vec::new();
    for (tier, (sum, n)) in &after {
        let (b_sum, b_n) = before[tier];
        let (b, a) = (b_sum / b_n as f64, sum / *n as f64);
        println!("tier {tier}: {n} graded, mean score before {b:.1}, after {a:.1}");
        tier_means.push((*tier, a));
    }
    println!("skew {:?}", cache.rank_skew.iter().map(|(t, s)| (t, s.n)).collect::<Vec<_>>());

    assert!(lo >= 6.0 && hi <= 7.0, "mean place per hero {lo:.2}-{hi:.2}");
    assert!((0.03..=0.10).contains(&losing_share), "losing place-1 share {losing_share:.3}");
    assert!((0.02..=0.05).contains(&s_plus_share), "S+ share {s_plus_share:.3}");
    assert!((0.08..=0.12).contains(&f_share), "F share {f_share:.3}");
    for (from, to, mean) in terciles {
        assert!((mean - 50.0).abs() <= 5.0, "length {from}-{to}: mean score {mean:.1}");
    }
    for (tier, mean) in tier_means {
        assert!((mean - 50.0).abs() <= 5.0, "tier {tier}: mean score {mean:.1}");
    }
}
