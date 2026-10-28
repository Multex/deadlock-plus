use super::*;

fn v(text: &str) -> Version {
    Version::parse(text).unwrap()
}

#[test]
fn release_follows_only_the_release_feed() {
    assert_eq!(UpdateChannel::Release.feeds(), [RELEASE_FEED]);
}

#[test]
fn beta_also_follows_release_so_a_finished_beta_moves_on() {
    assert_eq!(UpdateChannel::Beta.feeds(), [RELEASE_FEED, BETA_FEED]);
}

#[test]
fn nightly_follows_every_feed() {
    assert_eq!(UpdateChannel::Nightly.feeds(), [RELEASE_FEED, BETA_FEED, NIGHTLY_FEED]);
}

#[test]
fn release_feed_is_the_configured_endpoint() {
    let config: serde_json::Value = serde_json::from_str(include_str!("../../../tauri.conf.json")).unwrap();
    assert_eq!(config["plugins"]["updater"]["endpoints"], serde_json::json!([RELEASE_FEED]));
}

#[test]
fn prerelease_feeds_sit_on_their_rolling_releases() {
    assert!(BETA_FEED.ends_with("/releases/download/beta-feed/latest.json"));
    assert!(NIGHTLY_FEED.ends_with("/releases/download/nightly-feed/latest.json"));
}

#[test]
fn channel_names_match_the_setting_values() {
    for (name, channel) in
        [("release", UpdateChannel::Release), ("beta", UpdateChannel::Beta), ("nightly", UpdateChannel::Nightly)]
    {
        assert_eq!(serde_json::from_value::<UpdateChannel>(serde_json::json!(name)).unwrap(), channel);
    }
    assert!(serde_json::from_value::<UpdateChannel>(serde_json::json!("stable")).is_err());
}

#[test]
fn versions_order_release_after_its_betas_and_nightlies() {
    let order = [
        "0.14.0",
        "0.14.1-nightly.20261028",
        "0.15.0-beta.1",
        "0.15.0-beta.2",
        "0.15.0-beta.10",
        "0.15.0-nightly.20261029",
        "0.15.0-nightly.20261029.2",
        "0.15.0-nightly.20261030",
        "0.15.0",
        "0.15.1-nightly.20261101",
    ];
    for pair in order.windows(2) {
        assert!(v(pair[0]) < v(pair[1]), "{} should sort before {}", pair[0], pair[1]);
    }
}

fn answers(versions: &[Option<&'static str>]) -> Vec<Result<Option<&'static str>, String>> {
    versions.iter().map(|found| Ok(*found)).collect()
}

#[test]
fn takes_the_newest_version_any_feed_offers() {
    let found = newest(&v("0.14.0"), answers(&[Some("0.14.1"), Some("0.15.0-beta.2"), None]), |s| s);
    assert_eq!(found, Ok(Some("0.15.0-beta.2")));
}

#[test]
fn never_offers_the_running_version_or_an_older_one() {
    let current = v("0.15.0-nightly.20261030");
    let found =
        newest(&current, answers(&[Some("0.14.1"), Some("0.15.0-beta.2"), Some("0.15.0-nightly.20261030")]), |s| s);
    assert_eq!(found, Ok(None));
}

#[test]
fn a_failing_feed_does_not_hide_what_the_others_offer() {
    let found = newest(&v("0.14.0"), vec![Ok(Some("0.15.0")), Err("404".to_string())], |s: &&str| s);
    assert_eq!(found, Ok(Some("0.15.0")));
    let none = newest(&v("0.15.0"), vec![Ok(None), Err("404".to_string())], |s: &&str| s);
    assert_eq!(none, Ok(None));
}

#[test]
fn fails_only_when_every_feed_fails() {
    let found = newest::<&str, String>(&v("0.14.0"), vec![Err("offline".into()), Err("404".into())], |s| s);
    assert_eq!(found, Err("offline".to_string()));
}

#[test]
fn skips_an_offer_whose_version_does_not_parse() {
    let found = newest(&v("0.14.0"), answers(&[Some("not a version"), Some("0.14.1")]), |s| s);
    assert_eq!(found, Ok(Some("0.14.1")));
}

#[test]
fn every_feed_is_a_github_release_asset_over_https() {
    for feed in UpdateChannel::Nightly.feeds() {
        assert!(feed.starts_with("https://github.com/deadlock-plus/deadlock-plus/releases/"), "{feed}");
    }
}

#[test]
fn no_workflow_builds_with_the_rehearsal_feeds() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../.github/workflows");
    let mut read = 0;
    for entry in std::fs::read_dir(&dir).unwrap() {
        let path = entry.unwrap().path();
        let text = std::fs::read_to_string(&path).unwrap();
        for switch in ["update-rehearsal", "--all-features"] {
            assert!(!text.contains(switch), "{} uses {switch}", path.display());
        }
        read += 1;
    }
    assert!(read > 0, "no workflows in {}", dir.display());
}

#[test]
fn update_metadata_has_the_fields_the_plugins_update_class_reads() {
    let metadata = UpdateMetadata {
        rid: 7,
        current_version: "0.13.99".into(),
        version: "0.14.0".into(),
        date: None,
        body: None,
        raw_json: serde_json::json!({}),
    };
    let json = serde_json::to_value(&metadata).unwrap();
    let mut keys: Vec<_> = json.as_object().unwrap().keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["body", "currentVersion", "date", "rawJson", "rid", "version"]);
}
