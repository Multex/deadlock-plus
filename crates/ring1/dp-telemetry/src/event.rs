use serde_json::Value;

pub const FEATURES: &[&str] = &[
    "home",
    "server-picker",
    "live",
    "stats",
    "rank",
    "sessions",
    "alerts",
    "performance",
    "voice-bans",
    "demos",
    "storage",
    "settings",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Context {
    pub app_version: String,
    pub os: String,
    pub os_arch: String,
    pub locale: String,
}

/// Matches the website's `discord_invite_click` event, so in-app and web clicks chart as one series split by channel.
pub const INVITE_CLICK: &[(&str, &str)] = &[("ref", "app"), ("channel", "app")];

pub fn is_feature(name: &str) -> bool {
    FEATURES.contains(&name)
}

pub fn build(ctx: &Context, distinct_id: &str, event: &str, extra: &[(&str, &str)], timestamp: &str) -> Value {
    let mut properties = serde_json::json!({
        "app_version": ctx.app_version,
        "os": ctx.os,
        "os_arch": ctx.os_arch,
        "locale": ctx.locale,
        "$process_person_profile": false,
    });
    for (key, value) in extra {
        properties[*key] = (*value).into();
    }
    serde_json::json!({
        "event": event,
        "distinct_id": distinct_id,
        "properties": properties,
        "timestamp": timestamp,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> Context {
        Context { app_version: "0.8.0".into(), os: "windows".into(), os_arch: "x86_64".into(), locale: "en".into() }
    }

    #[test]
    fn a_plain_event_carries_exactly_the_allow_listed_properties() {
        let event = build(&ctx(), "id-1", "app_started", &[], "2026-10-05T00:00:00Z");
        assert_eq!(event["event"], "app_started");
        assert_eq!(event["distinct_id"], "id-1");
        assert_eq!(event["timestamp"], "2026-10-05T00:00:00Z");
        let mut keys: Vec<&str> = event["properties"].as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["$process_person_profile", "app_version", "locale", "os", "os_arch"]);
        assert_eq!(event["properties"]["$process_person_profile"], false);
    }

    #[test]
    fn a_feature_event_adds_only_the_feature_name() {
        let event = build(&ctx(), "id-1", "feature_used", &[("feature", "stats")], "t");
        assert_eq!(event["properties"]["feature"], "stats");
        assert_eq!(event["properties"].as_object().unwrap().len(), 6);
    }

    #[test]
    fn an_invite_click_names_the_app_as_its_ref_and_channel() {
        let event = build(&ctx(), "id-1", "discord_invite_click", INVITE_CLICK, "t");
        assert_eq!(event["properties"]["ref"], "app");
        assert_eq!(event["properties"]["channel"], "app");
        assert_eq!(event["properties"].as_object().unwrap().len(), 7);
    }

    #[test]
    fn only_listed_features_are_accepted() {
        assert!(is_feature("server-picker"));
        assert!(!is_feature("some free text"));
        assert!(!is_feature(""));
        assert!(!is_feature("Stats"));
    }
}
