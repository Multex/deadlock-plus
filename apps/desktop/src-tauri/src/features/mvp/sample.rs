use dp_mvp::{MvpError, SampleMatch};

pub const GRAPHQL_URL: &str = "https://api.deadlock-api.com/v1/graphql";
/// Matches per page. About 37k raw player rows and 13 MB of JSON before brotli.
pub const PAGE_LIMIT: u32 = 3100;
/// Three full pages. A halved page size takes more pages to reach it.
pub const TARGET_MATCHES: u32 = 3 * PAGE_LIMIT;
pub const MAX_PAGES: usize = 6;
/// Usable rows the sample aims for; three pages measured 101k after dropping leaver and short matches.
pub const TARGET_ROWS: usize = 100_000;

const PLAYER_FIELDS: &str = "player_slot hero_id team kills deaths assists net_worth abandon_match_time_s \
     max_player_damage max_boss_damage max_player_healing max_teammate_healing max_teammate_barriering";

/// The JSON request body for one keyset page, newest matches first. `before` is the smallest match id of the
/// previous page. The client clock never enters the query.
pub fn query_body(limit: u32, before: Option<u64>) -> String {
    let cursor = before.map(|id| format!(", match_id:{{lt:{id}}}")).unwrap_or_default();
    let query = format!(
        r#"{{ matches(where:{{game_mode:{{eq:"Normal"}}, match_mode:{{in:["Ranked","Unranked"]}}, match_outcome:{{eq:"TeamWin"}}, duration_s:{{gte:600}}, not_scored:{{eq:false}}, low_pri_pool:{{eq:false}}{cursor}}}, order_by:MATCH_ID, order_direction:DESC, limit:{limit}) {{ match_id start_time duration_s winning_team match_mode average_badge players {{ {PLAYER_FIELDS} }} }} }}"#
    );
    serde_json::json!({ "query": query }).to_string()
}

/// The keyset cursor for the page after `matches`.
pub fn next_cursor(matches: &[SampleMatch]) -> Option<u64> {
    matches.iter().map(|m| m.match_id).min()
}

pub fn is_complexity_error(e: &MvpError) -> bool {
    matches!(e, MvpError::GraphQl(message) if message.to_ascii_lowercase().contains("complex"))
}

/// Unix seconds of an HTTP `Date` header (`Sat, 17 Oct 2026 00:14:10 GMT`).
pub fn http_date(value: &str) -> Option<i64> {
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let (_, rest) = value.trim().split_once(", ")?;
    let mut parts = rest.split(' ');
    let day: u8 = parts.next()?.parse().ok()?;
    let month_name = parts.next()?;
    let month = MONTHS.iter().position(|m| *m == month_name)? as u8 + 1;
    let year: i32 = parts.next()?.parse().ok()?;
    let clock: Vec<u8> = parts.next()?.split(':').map(|p| p.parse().ok()).collect::<Option<_>>()?;
    let [h, m, s] = clock[..] else { return None };
    if parts.next()? != "GMT" {
        return None;
    }
    let date = time::Date::from_calendar_date(year, time::Month::try_from(month).ok()?, day).ok()?;
    Some(date.with_hms(h, m, s).ok()?.assume_utc().unix_timestamp())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query_of(body: &str) -> String {
        let value: serde_json::Value = serde_json::from_str(body).expect("body is JSON");
        value["query"].as_str().expect("a query string").to_string()
    }

    #[test]
    fn the_first_page_filters_and_orders_without_a_cursor() {
        let q = query_of(&query_body(3100, None));
        for part in [
            r#"game_mode:{eq:"Normal"}"#,
            r#"match_mode:{in:["Ranked","Unranked"]}"#,
            r#"match_outcome:{eq:"TeamWin"}"#,
            "duration_s:{gte:600}",
            "not_scored:{eq:false}",
            "low_pri_pool:{eq:false}",
            "order_by:MATCH_ID",
            "order_direction:DESC",
            "limit:3100",
            "match_id start_time duration_s winning_team match_mode average_badge",
            "players { player_slot hero_id team kills deaths assists net_worth abandon_match_time_s",
            "max_teammate_barriering }",
        ] {
            assert!(q.contains(part), "{part} missing from {q}");
        }
        assert!(!q.contains("match_id:{lt"));
    }

    #[test]
    fn later_pages_page_by_match_id() {
        let q = query_of(&query_body(1550, Some(118285847)));
        assert!(q.contains("match_id:{lt:118285847}"), "{q}");
        assert!(q.contains("limit:1550"));
    }

    #[test]
    fn the_query_matches_the_recorded_one() {
        let recorded = r#"{ matches(where:{game_mode:{eq:"Normal"}, match_mode:{in:["Ranked","Unranked"]}, match_outcome:{eq:"TeamWin"}, duration_s:{gte:600}, not_scored:{eq:false}, low_pri_pool:{eq:false}, match_id:{lt:118285847}}, order_by:MATCH_ID, order_direction:DESC, limit:3100) { match_id start_time duration_s winning_team match_mode average_badge players { player_slot hero_id team kills deaths assists net_worth abandon_match_time_s max_player_damage max_boss_damage max_player_healing max_teammate_healing max_teammate_barriering } } }"#;
        assert_eq!(query_of(&query_body(3100, Some(118285847))), recorded);
    }

    fn matches(ids: &[u64]) -> Vec<SampleMatch> {
        let rows: Vec<String> = ids
            .iter()
            .map(|id| {
                format!(
                    r#"{{"match_id":{id},"start_time":1,"duration_s":900,"winning_team":"Team0","match_mode":"Ranked","average_badge":null,"players":[]}}"#
                )
            })
            .collect();
        dp_mvp::parse_matches(&format!(r#"{{"data":{{"matches":[{}]}}}}"#, rows.join(","))).unwrap()
    }

    #[test]
    fn the_cursor_is_the_smallest_match_id() {
        assert_eq!(next_cursor(&matches(&[30, 10, 20])), Some(10));
        assert_eq!(next_cursor(&[]), None);
    }

    #[test]
    fn only_complexity_errors_halve_the_page() {
        assert!(is_complexity_error(&MvpError::GraphQl("Query is too complex".into())));
        assert!(is_complexity_error(&MvpError::GraphQl("query complexity 120000 exceeds 100000".into())));
        assert!(!is_complexity_error(&MvpError::GraphQl("unknown field".into())));
        assert!(!is_complexity_error(&MvpError::Json("complex".into())));
    }

    #[test]
    fn reads_the_server_date() {
        assert_eq!(http_date("Sat, 17 Oct 2026 00:14:10 GMT"), Some(1_792_196_050));
        assert_eq!(http_date("Thu, 01 Jan 1970 00:00:00 GMT"), Some(0));
        assert_eq!(http_date("Tue, 29 Feb 2028 23:59:59 GMT"), Some(1_835_481_599));
        for bad in [
            "",
            "yesterday",
            "Sat, 17 Foo 2026 00:14:10 GMT",
            "Sat, 32 Oct 2026 00:14:10 GMT",
            "Sat, 17 Oct 2026 25:00:00 GMT",
        ] {
            assert_eq!(http_date(bad), None, "{bad}");
        }
    }
}
