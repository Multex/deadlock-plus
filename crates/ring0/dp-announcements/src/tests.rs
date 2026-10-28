use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};
use serde_json::{json, Value};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use super::*;

struct Signer {
    pair: Ed25519KeyPair,
    id: String,
    x: String,
}

impl Signer {
    fn new(id: &str) -> Self {
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
        let pair = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap();
        let x = URL_SAFE_NO_PAD.encode(pair.public_key().as_ref());
        Self { pair, id: id.to_string(), x }
    }

    fn key(&self) -> PublicKey<'_> {
        PublicKey { id: &self.id, x: &self.x }
    }

    fn sign_bytes(&self, payload: &[u8]) -> Vec<u8> {
        let signature = self.pair.sign(payload);
        let envelope = json!({
            "keyId": self.id,
            "payload": URL_SAFE_NO_PAD.encode(payload),
            "signature": URL_SAFE_NO_PAD.encode(signature.as_ref()),
        });
        serde_json::to_vec(&envelope).unwrap()
    }

    fn sign(&self, payload: &Value) -> Vec<u8> {
        self.sign_bytes(&serde_json::to_vec(payload).unwrap())
    }
}

fn at(text: &str) -> OffsetDateTime {
    OffsetDateTime::parse(text, &Rfc3339).unwrap()
}

const ISSUED: &str = "2026-10-28T12:00:00Z";

fn payload(issued_at: &str, items: Vec<Value>) -> Value {
    json!({ "version": 1, "issuedAt": issued_at, "announcements": items })
}

fn item(id: &str, severity: &str) -> Value {
    json!({ "id": id, "title": "Update broken", "body": "Download 0.13.2 from the website.", "severity": severity })
}

fn with(mut value: Value, field: &str, extra: Value) -> Value {
    value[field] = extra;
    value
}

fn ctx(version: &str) -> Context {
    Context { version: semver::Version::parse(version).unwrap(), platform: Some(Platform::Windows), now: at(ISSUED) }
}

fn ids(announcements: &[Announcement]) -> Vec<&str> {
    announcements.iter().map(|a| a.id.as_str()).collect()
}

/// Every item of a feed signed with a fresh key, verified and shown for 0.14.0 on Windows at `ISSUED`.
fn shown(items: Vec<Value>) -> Vec<Announcement> {
    let signer = Signer::new("k");
    let feed = verify(&signer.sign(&payload(ISSUED, items)), &[signer.key()]).expect("feed verifies");
    feed.visible(&ctx("0.14.0"))
}

fn envelope_field(envelope: &[u8], field: &str) -> String {
    let value: Value = serde_json::from_slice(envelope).unwrap();
    value[field].as_str().unwrap().to_string()
}

fn replace_field(envelope: &[u8], field: &str, text: String) -> Vec<u8> {
    let mut value: Value = serde_json::from_slice(envelope).unwrap();
    value[field] = Value::String(text);
    serde_json::to_vec(&value).unwrap()
}

#[test]
fn a_signed_feed_verifies() {
    let signer = Signer::new("2026-10");
    let feed = verify(&signer.sign(&payload(ISSUED, vec![item("a", "info")])), &[signer.key()]).unwrap();
    assert_eq!(feed.issued_at(), at(ISSUED));
    assert_eq!(ids(&feed.visible(&ctx("0.14.0"))), ["a"]);
}

#[test]
fn a_feed_verifies_with_any_listed_key() {
    let old = Signer::new("old");
    let new = Signer::new("new");
    let envelope = new.sign(&payload(ISSUED, vec![]));
    assert!(verify(&envelope, &[old.key(), new.key()]).is_ok());
}

#[test]
fn a_tampered_payload_fails() {
    let signer = Signer::new("k");
    let envelope = signer.sign(&payload(ISSUED, vec![item("a", "info")]));
    let forged = serde_json::to_vec(&payload(ISSUED, vec![item("b", "critical")])).unwrap();
    let tampered = replace_field(&envelope, "payload", URL_SAFE_NO_PAD.encode(forged));
    assert_eq!(verify(&tampered, &[signer.key()]).unwrap_err(), FeedError::BadSignature);
}

#[test]
fn a_feed_signed_by_another_key_with_a_trusted_id_fails() {
    let trusted = Signer::new("k");
    let attacker = Signer::new("k");
    let envelope = attacker.sign(&payload(ISSUED, vec![item("a", "info")]));
    assert_eq!(verify(&envelope, &[trusted.key()]).unwrap_err(), FeedError::BadSignature);
}

#[test]
fn an_unknown_key_id_fails() {
    let trusted = Signer::new("k");
    let other = Signer::new("other");
    let envelope = other.sign(&payload(ISSUED, vec![]));
    assert_eq!(verify(&envelope, &[trusted.key()]).unwrap_err(), FeedError::UnknownKey);
    assert_eq!(verify(&envelope, &[]).unwrap_err(), FeedError::UnknownKey);
}

#[test]
fn padded_or_non_base64url_fields_are_malformed() {
    let signer = Signer::new("k");
    let envelope = signer.sign(&payload(ISSUED, vec![]));
    let signature = envelope_field(&envelope, "signature");
    let padded = replace_field(&envelope, "signature", format!("{signature}=="));
    assert_eq!(verify(&padded, &[signer.key()]).unwrap_err(), FeedError::Malformed);
    let standard = replace_field(&envelope, "payload", "a+b/".to_string());
    assert_eq!(verify(&standard, &[signer.key()]).unwrap_err(), FeedError::Malformed);
    assert_eq!(verify(b"not json", &[signer.key()]).unwrap_err(), FeedError::Malformed);
    assert_eq!(verify(br#"{"keyId":"k"}"#, &[signer.key()]).unwrap_err(), FeedError::Malformed);
}

#[test]
fn an_envelope_over_64_kib_is_rejected() {
    let signer = Signer::new("k");
    let envelope = signer.sign(&payload(ISSUED, vec![]));
    let mut value: Value = serde_json::from_slice(&envelope).unwrap();
    let fill = |value: &mut Value, len: usize| {
        value["pad"] = Value::String(String::new());
        let base = serde_json::to_vec(value).unwrap().len();
        value["pad"] = Value::String("x".repeat(len - base));
        serde_json::to_vec(value).unwrap()
    };
    let at_limit = fill(&mut value, MAX_ENVELOPE_BYTES);
    assert_eq!(at_limit.len(), 64 * 1024);
    assert!(verify(&at_limit, &[signer.key()]).is_ok());
    let over = fill(&mut value, MAX_ENVELOPE_BYTES + 1);
    assert_eq!(verify(&over, &[signer.key()]).unwrap_err(), FeedError::TooLarge);
}

#[test]
fn a_payload_version_other_than_1_rejects_the_feed() {
    let signer = Signer::new("k");
    let v2 = with(payload(ISSUED, vec![item("a", "info")]), "version", json!(2));
    assert_eq!(verify(&signer.sign(&v2), &[signer.key()]).unwrap_err(), FeedError::UnsupportedVersion);
}

#[test]
fn a_payload_without_a_valid_issued_at_or_list_rejects_the_feed() {
    let signer = Signer::new("k");
    for bad in [
        with(payload(ISSUED, vec![]), "issuedAt", json!("yesterday")),
        with(payload(ISSUED, vec![]), "announcements", json!({})),
        json!({ "version": 1, "announcements": [] }),
        json!([1]),
    ] {
        assert_eq!(verify(&signer.sign(&bad), &[signer.key()]).unwrap_err(), FeedError::BadPayload, "{bad}");
    }
    assert_eq!(verify(&signer.sign_bytes(b"\xff"), &[signer.key()]).unwrap_err(), FeedError::BadPayload);
}

#[test]
fn more_than_20_announcements_rejects_the_feed() {
    let signer = Signer::new("k");
    let items = |n: usize| (0..n).map(|i| item(&format!("a{i}"), "info")).collect::<Vec<_>>();
    assert!(verify(&signer.sign(&payload(ISSUED, items(20))), &[signer.key()]).is_ok());
    let over = signer.sign(&payload(ISSUED, items(21)));
    assert_eq!(verify(&over, &[signer.key()]).unwrap_err(), FeedError::BadPayload);
}

#[test]
fn unknown_fields_are_ignored_at_every_level() {
    let signer = Signer::new("k");
    let mut inner = with(payload(ISSUED, vec![with(item("a", "info"), "html", json!("<script>"))]), "extra", json!(1));
    inner["announcements"][0]["link"] =
        json!({ "url": "https://deadlockplus.app/x", "label": "Read more", "target": "_blank" });
    let envelope = replace_field(&signer.sign(&inner), "comment", "hi".to_string());
    let feed = verify(&envelope, &[signer.key()]).unwrap();
    let shown = feed.visible(&ctx("0.14.0"));
    assert_eq!(ids(&shown), ["a"]);
    assert_eq!(shown[0].link.as_ref().map(|l| l.url.as_str()), Some("https://deadlockplus.app/x"));
}

#[test]
fn item_limits_drop_only_the_item_that_breaks_them() {
    let ok = |id: &str| item(id, "info");
    let items = vec![
        ok("kept-1"),
        ok("kept-1"),
        ok(&"a".repeat(64)),
        ok(&"a".repeat(65)),
        ok(""),
        ok("Upper"),
        ok("under_score"),
        ok("space d"),
        with(ok("title-80"), "title", json!("t".repeat(80))),
        with(ok("title-81"), "title", json!("t".repeat(81))),
        with(ok("title-empty"), "title", json!("")),
        with(ok("title-multibyte"), "title", json!("é".repeat(80))),
        with(ok("body-600"), "body", json!("b\n".repeat(300))),
        with(ok("body-601"), "body", json!("b".repeat(601))),
        with(ok("body-empty"), "body", json!("")),
        with(ok("severity-bad"), "severity", json!("urgent")),
        with(ok("title-number"), "title", json!(5)),
        json!({ "id": "no-body", "title": "t", "severity": "info" }),
        json!("not an object"),
        with(ok("versions-bad"), "versions", json!("not a range")),
        with(ok("platform-bad"), "platforms", json!(["macos"])),
        with(ok("starts-bad"), "startsAt", json!("soon")),
        with(ok("ends-bad"), "endsAt", json!("2026-13-01T00:00:00Z")),
        with(ok("nulls"), "versions", Value::Null),
    ];
    let mut got = items
        .chunks(MAX_ANNOUNCEMENTS)
        .flat_map(|chunk| ids(&shown(chunk.to_vec())).into_iter().map(String::from).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    got.sort();
    let mut want = vec!["kept-1", &"a".repeat(64), "title-80", "title-multibyte", "body-600", "nulls"]
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    want.sort();
    assert_eq!(got, want);
}

#[test]
fn a_duplicate_id_keeps_the_first_item() {
    let first = with(item("dup", "info"), "title", json!("First"));
    let second = with(item("dup", "critical"), "title", json!("Second"));
    let shown = shown(vec![first, second]);
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0].title, "First");
}

#[test]
fn a_version_range_targets_only_matching_app_versions() {
    let signer = Signer::new("k");
    let items = vec![with(item("old", "critical"), "versions", json!(">=0.13.0, <0.13.2")), item("all", "info")];
    let feed = verify(&signer.sign(&payload(ISSUED, items)), &[signer.key()]).unwrap();
    assert_eq!(ids(&feed.visible(&ctx("0.13.0"))), ["old", "all"]);
    assert_eq!(ids(&feed.visible(&ctx("0.13.1"))), ["old", "all"]);
    assert_eq!(ids(&feed.visible(&ctx("0.13.2"))), ["all"]);
    assert_eq!(ids(&feed.visible(&ctx("0.14.0"))), ["all"]);
}

#[test]
fn a_platform_list_targets_only_those_platforms() {
    let signer = Signer::new("k");
    let items = vec![
        with(item("linux", "info"), "platforms", json!(["linux"])),
        with(item("both", "info"), "platforms", json!(["windows", "linux"])),
        with(item("none", "info"), "platforms", json!([])),
        item("any", "info"),
    ];
    let feed = verify(&signer.sign(&payload(ISSUED, items)), &[signer.key()]).unwrap();
    let on = |platform| {
        let mut c = ctx("0.14.0");
        c.platform = platform;
        let mut got = ids(&feed.visible(&c)).into_iter().map(String::from).collect::<Vec<_>>();
        got.sort();
        got
    };
    assert_eq!(on(Some(Platform::Windows)), ["any", "both"]);
    assert_eq!(on(Some(Platform::Linux)), ["any", "both", "linux"]);
    assert_eq!(on(None), ["any"]);
}

#[test]
fn the_current_platform_is_the_build_target() {
    let want = if cfg!(windows) {
        Some(Platform::Windows)
    } else if cfg!(target_os = "linux") {
        Some(Platform::Linux)
    } else {
        None
    };
    assert_eq!(Platform::current(), want);
}

#[test]
fn starts_at_and_ends_at_bound_when_an_item_shows() {
    let signer = Signer::new("k");
    let items = vec![
        with(item("future", "info"), "startsAt", json!("2026-10-28T12:00:01Z")),
        with(item("started", "info"), "startsAt", json!("2026-10-28T12:00:00Z")),
        with(item("ended", "info"), "endsAt", json!("2026-10-28T12:00:00Z")),
        with(item("ending", "info"), "endsAt", json!("2026-10-28T13:00:00+01:00")),
        with(
            with(item("window", "info"), "startsAt", json!("2026-10-01T00:00:00Z")),
            "endsAt",
            json!("2026-11-01T00:00:00Z"),
        ),
    ];
    let feed = verify(&signer.sign(&payload(ISSUED, items)), &[signer.key()]).unwrap();
    let mut got = ids(&feed.visible(&ctx("0.14.0"))).into_iter().map(String::from).collect::<Vec<_>>();
    got.sort();
    assert_eq!(got, ["started", "window"]);
}

#[test]
fn visible_items_sort_by_severity_then_newest_first() {
    let shown = shown(vec![
        item("info-old", "info"),
        item("critical-old", "critical"),
        item("warning", "warning"),
        item("info-new", "info"),
        item("critical-new", "critical"),
    ]);
    assert_eq!(ids(&shown), ["critical-new", "critical-old", "warning", "info-new", "info-old"]);
}

#[test]
fn an_announcement_serializes_in_camel_case_with_a_null_link() {
    let shown = shown(vec![
        with(item("a", "warning"), "link", json!({ "url": "https://discord.gg/abc", "label": "Join" })),
        item("b", "info"),
    ]);
    assert_eq!(
        serde_json::to_value(&shown).unwrap(),
        json!([
            { "id": "a", "title": "Update broken", "body": "Download 0.13.2 from the website.", "severity": "warning",
              "link": { "url": "https://discord.gg/abc", "label": "Join" } },
            { "id": "b", "title": "Update broken", "body": "Download 0.13.2 from the website.", "severity": "info",
              "link": null },
        ])
    );
}

#[test]
fn links_are_allowed_only_to_our_own_places() {
    for url in [
        "https://deadlockplus.app",
        "https://deadlockplus.app/download?from=app#top",
        "https://www.deadlockplus.app/",
        "https://DeadlockPlus.app/x",
        "https://discord.gg/abc123",
        "https://discord.com/invite/abc123",
        "https://github.com/deadlock-plus/deadlock-plus/releases/tag/v0.13.2",
        "https://github.com/deadlock-plus",
    ] {
        assert!(link::allowed(url), "{url}");
    }
    for url in [
        "http://deadlockplus.app/",
        "HTTPS://deadlockplus.app/",
        "https://evil.example/",
        "https://deadlockplus.app.evil.example/",
        "https://evil.example/deadlockplus.app",
        "https://deadlockplus.app@evil.example/",
        "https://deadlockplus.app:8443/",
        "https://deadlockplus.app./",
        "https://sub.deadlockplus.app/",
        "https://discord.gg",
        "https://discord.gg/",
        "https://discord.com/",
        "https://discord.com/invite/",
        "https://discord.com/channels/1/2",
        "https://github.com/",
        "https://github.com/deadlock-plusevil/x",
        "https://github.com/evil/deadlock-plus",
        "https://github.com/deadlock-plus/../evil/repo",
        "https://github.com/deadlock-plus/%2e%2E/evil/repo",
        "https://github.com/deadlock-plus/./x",
        "https://deadlockplus.app\\@evil.example/",
        "https://deadlockplus.app/ x",
        "https://deadlockplus.app/\nx",
        "javascript:alert(1)",
        "",
    ] {
        assert!(!link::allowed(url), "{url}");
    }
}

#[test]
fn a_bad_link_is_dropped_and_its_item_kept() {
    let link = |url: &str, label: &str| json!({ "url": url, "label": label });
    let shown = shown(vec![
        with(item("good", "info"), "link", link("https://deadlockplus.app/", &"l".repeat(40))),
        with(item("host", "info"), "link", link("https://evil.example/", "Open")),
        with(item("label-long", "info"), "link", link("https://deadlockplus.app/", &"l".repeat(41))),
        with(item("label-empty", "info"), "link", link("https://deadlockplus.app/", "")),
        with(item("no-label", "info"), "link", json!({ "url": "https://deadlockplus.app/" })),
        with(item("string", "info"), "link", json!("https://deadlockplus.app/")),
    ]);
    let links: Vec<(&str, bool)> = shown.iter().map(|a| (a.id.as_str(), a.link.is_some())).collect();
    assert_eq!(
        links,
        [
            ("string", false),
            ("no-label", false),
            ("label-empty", false),
            ("label-long", false),
            ("host", false),
            ("good", true)
        ]
    );
}

#[test]
fn every_trusted_key_is_a_32_byte_key_with_a_unique_id() {
    let mut ids = std::collections::HashSet::new();
    for key in KEYS {
        assert!(ids.insert(key.id), "duplicate key id {}", key.id);
        assert_eq!(URL_SAFE_NO_PAD.decode(key.x).map(|k| k.len()), Ok(32), "key {}", key.id);
    }
}

#[test]
fn a_response_maps_404_to_missing_and_other_errors_to_failed() {
    assert_eq!(Fetch::from_response(404, b"nope".to_vec()), Fetch::Missing);
    assert_eq!(Fetch::from_response(200, b"{}".to_vec()), Fetch::Body(b"{}".to_vec()));
    assert!(matches!(Fetch::from_response(500, Vec::new()), Fetch::Failed(_)));
    assert!(matches!(Fetch::from_response(304, Vec::new()), Fetch::Failed(_)));
}

mod resolving {
    use super::*;

    fn feed_ids(resolved: &Resolved) -> Vec<String> {
        resolved.announcements(&ctx("0.14.0")).into_iter().map(|a| a.id).collect()
    }

    #[test]
    fn a_missing_feed_shows_nothing_and_keeps_the_store() {
        let signer = Signer::new("k");
        let stored = signer.sign(&payload(ISSUED, vec![item("old", "info")]));
        let resolved = resolve(Fetch::Missing, Some(&stored), &[signer.key()]).unwrap();
        assert!(feed_ids(&resolved).is_empty());
        assert_eq!(resolved.save, None);
    }

    #[test]
    fn a_new_verified_feed_is_shown_and_saved() {
        let signer = Signer::new("k");
        let stored = signer.sign(&payload("2026-10-27T00:00:00Z", vec![item("old", "info")]));
        let fresh = signer.sign(&payload(ISSUED, vec![item("new", "info")]));
        let resolved = resolve(Fetch::Body(fresh.clone()), Some(&stored), &[signer.key()]).unwrap();
        assert_eq!(feed_ids(&resolved), ["new"]);
        assert_eq!(resolved.save, Some(fresh.clone()));
        let first = resolve(Fetch::Body(fresh.clone()), None, &[signer.key()]).unwrap();
        assert_eq!(first.save, Some(fresh));
    }

    #[test]
    fn the_same_feed_again_is_not_saved_again() {
        let signer = Signer::new("k");
        let envelope = signer.sign(&payload(ISSUED, vec![item("a", "info")]));
        let resolved = resolve(Fetch::Body(envelope.clone()), Some(&envelope), &[signer.key()]).unwrap();
        assert_eq!(feed_ids(&resolved), ["a"]);
        assert_eq!(resolved.save, None);
    }

    #[test]
    fn an_older_feed_is_ignored_for_the_stored_one() {
        let signer = Signer::new("k");
        let stored = signer.sign(&payload(ISSUED, vec![item("current", "info")]));
        let replayed = signer.sign(&payload("2026-10-01T00:00:00Z", vec![item("replayed", "critical")]));
        let resolved = resolve(Fetch::Body(replayed), Some(&stored), &[signer.key()]).unwrap();
        assert_eq!(feed_ids(&resolved), ["current"]);
        assert_eq!(resolved.save, None);
    }

    #[test]
    fn a_failed_fetch_shows_the_stored_feed_or_fails_without_one() {
        let signer = Signer::new("k");
        let stored = signer.sign(&payload(ISSUED, vec![item("cached", "info")]));
        let resolved = resolve(Fetch::Failed("offline".into()), Some(&stored), &[signer.key()]).unwrap();
        assert_eq!(feed_ids(&resolved), ["cached"]);
        assert_eq!(resolved.save, None);
        let err = resolve(Fetch::Failed("offline".into()), None, &[signer.key()]).unwrap_err();
        assert_eq!(err, Error::Fetch("offline".into()));
    }

    #[test]
    fn a_rejected_feed_falls_back_to_the_stored_one_or_fails_without_one() {
        let signer = Signer::new("k");
        let attacker = Signer::new("k");
        let stored = signer.sign(&payload("2026-10-01T00:00:00Z", vec![item("cached", "warning")]));
        let forged = attacker.sign(&payload(ISSUED, vec![item("forged", "critical")]));
        let resolved = resolve(Fetch::Body(forged.clone()), Some(&stored), &[signer.key()]).unwrap();
        assert_eq!(feed_ids(&resolved), ["cached"]);
        assert_eq!(resolved.save, None);
        assert_eq!(resolved.rejected, Some(Error::Feed(FeedError::BadSignature)));
        let err = resolve(Fetch::Body(forged), None, &[signer.key()]).unwrap_err();
        assert_eq!(err, Error::Feed(FeedError::BadSignature));
    }

    #[test]
    fn a_stored_feed_that_no_longer_verifies_counts_as_none() {
        let retired = Signer::new("old");
        let current = Signer::new("new");
        let stored = retired.sign(&payload("2026-12-01T00:00:00Z", vec![item("retired", "info")]));
        let fresh = current.sign(&payload(ISSUED, vec![item("fresh", "info")]));
        let resolved = resolve(Fetch::Body(fresh.clone()), Some(&stored), &[current.key()]).unwrap();
        assert_eq!(feed_ids(&resolved), ["fresh"]);
        assert_eq!(resolved.save, Some(fresh));
        assert!(resolve(Fetch::Failed("offline".into()), Some(b"garbage"), &[current.key()]).is_err());
    }
}
