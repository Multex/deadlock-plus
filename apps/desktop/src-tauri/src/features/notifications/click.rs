#[cfg(any(windows, test))]
use std::path::Path;

use super::{AppNotification, NotificationKind};

/// Every in-app route a notification click may open. A click target or launch argument outside this list is
/// dropped, so nothing can steer the app to an unknown page or an external URL.
const ROUTES: [&str; 4] = ["/alerts", "/server-picker", "/settings/notifications", "/match-history"];

pub fn allowed_route(route: &str) -> Option<&'static str> {
    ROUTES.into_iter().find(|known| *known == route)
}

/// The page a click on this notification opens. Maintenance carries no link and opens its settings, as the
/// notification center does.
pub fn click_target(item: &AppNotification) -> Option<&'static str> {
    match (&item.link, item.kind) {
        (Some(link), _) => allowed_route(link),
        (None, NotificationKind::Maintenance) => allowed_route("/settings/notifications"),
        (None, _) => None,
    }
}

/// `deadlock-plus://open/<route without its leading slash>?id=<notification id>`. Process arguments can
/// hold anything, so parsing is strict: the route must be on the allow-list and the id must look like one the app
/// makes.
const OPEN_PREFIX: &str = "deadlock-plus://open/";
const MAX_LAUNCH_LEN: usize = 256;
const MAX_ID_LEN: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launch {
    pub route: &'static str,
    pub id: String,
}

fn valid_id(id: &str) -> bool {
    (1..=MAX_ID_LEN).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

#[cfg(any(windows, test))]
pub fn launch_url(route: &'static str, id: &str) -> Option<String> {
    let url = format!("{OPEN_PREFIX}{}?id={id}", route.strip_prefix('/')?);
    parse_launch(&url).is_some().then_some(url)
}

pub fn parse_launch(arg: &str) -> Option<Launch> {
    if arg.len() > MAX_LAUNCH_LEN || !arg.get(..OPEN_PREFIX.len())?.eq_ignore_ascii_case(OPEN_PREFIX) {
        return None;
    }
    let (path, query) = arg[OPEN_PREFIX.len()..].split_once('?')?;
    let route = allowed_route(&format!("/{path}"))?;
    let id = query.strip_prefix("id=").filter(|id| valid_id(id))?;
    Some(Launch { route, id: id.to_string() })
}

/// The process arguments of a launch from a toast or a `deadlock-plus://` link; the first one that parses wins.
pub fn launch_from_args<I, S>(args: I) -> Option<Launch>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().find_map(|arg| parse_launch(arg.as_ref()))
}

#[cfg(any(windows, test))]
pub const POWERSHELL_APP_ID: &str = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

/// Same rule as `tauri-plugin-notification`: a build run from `target/debug` or `target/release` has no Start
/// menu shortcut carrying the app's AUMID, and Windows drops toasts for an unregistered AUMID, so those builds
/// borrow PowerShell's.
#[cfg(any(windows, test))]
pub fn toast_app_id(exe_dir: &Path, identifier: &str) -> String {
    let mut parts = exe_dir.components().rev().map(|c| c.as_os_str());
    let (profile, target) = (parts.next(), parts.next());
    let cargo_build = target == Some("target".as_ref()) && matches!(profile, Some(p) if p == "debug" || p == "release");
    if cargo_build { POWERSHELL_APP_ID } else { identifier }.to_string()
}

#[cfg(any(windows, test))]
pub fn toast_xml(title: &str, body: &str, launch: Option<&str>) -> String {
    let launch = launch.map(|url| format!(r#" launch="{}""#, escape(url))).unwrap_or_default();
    format!(
        r#"<toast{launch}><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual></toast>"#,
        escape(title),
        escape(body)
    )
}

#[cfg(any(windows, test))]
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::PathBuf;

    use super::*;
    use crate::features::notifications::NotificationTopic;

    fn item(kind: NotificationKind, link: Option<&str>) -> AppNotification {
        AppNotification {
            id: "a".into(),
            kind,
            key: None,
            params: BTreeMap::new(),
            title: None,
            body: None,
            timestamp: 0,
            read: false,
            link: link.map(Into::into),
        }
    }

    #[test]
    fn each_topic_clicks_through_to_its_page() {
        use NotificationTopic as T;
        #[rustfmt::skip]
        let rows = [
            (T::Updates,             Some("/alerts"),        Some("/alerts")),
            (T::Maintenance,         None,                   Some("/settings/notifications")),
            (T::ServerBlocksUpdated, Some("/server-picker"), Some("/server-picker")),
            (T::ServerBlocksStale,   Some("/server-picker"), Some("/server-picker")),
            (T::BreakReminder,       Some("/match-history"), Some("/match-history")),
        ];
        for (topic, link, want) in rows {
            assert_eq!(click_target(&item(topic.kind(), link)), want, "{topic:?}");
        }
    }

    #[test]
    fn a_link_outside_the_allow_list_opens_nothing() {
        assert_eq!(click_target(&item(NotificationKind::Alert, Some("https://example.com"))), None);
        assert_eq!(click_target(&item(NotificationKind::Maintenance, Some("/../etc"))), None);
        assert_eq!(click_target(&item(NotificationKind::Session, None)), None);
    }

    #[test]
    fn the_allow_list_accepts_only_known_routes() {
        for route in ROUTES {
            assert_eq!(allowed_route(route), Some(route));
        }
        for bad in [
            "",
            "/",
            "/unknown",
            "/alerts/../settings",
            "/alerts/..",
            "../alerts",
            "//evil.example/alerts",
            "https://example.com/alerts",
            "javascript:alert(1)",
            "deadlock-plus://open/alerts",
            "alerts",
            "/alerts ",
            "/ALERTS",
            "\\alerts",
        ] {
            assert_eq!(allowed_route(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn a_build_in_the_cargo_target_dir_borrows_powershells_app_id() {
        let dir = |parts: &[&str]| parts.iter().collect::<PathBuf>();
        assert_eq!(toast_app_id(&dir(&["repo", "target", "debug"]), "app.deadlockplus"), POWERSHELL_APP_ID);
        assert_eq!(toast_app_id(&dir(&["repo", "target", "release"]), "app.deadlockplus"), POWERSHELL_APP_ID);
        assert_eq!(toast_app_id(&dir(&["Program Files", "Deadlock+"]), "app.deadlockplus"), "app.deadlockplus");
        assert_eq!(toast_app_id(&dir(&["repo", "target", "debug", "deps"]), "app.deadlockplus"), "app.deadlockplus");
        assert_eq!(toast_app_id(&dir(&["my-target", "release"]), "app.deadlockplus"), "app.deadlockplus");
    }

    #[test]
    fn toast_xml_carries_the_launch_url_for_the_running_app() {
        let xml = toast_xml("Title", "Body", Some("deadlock-plus://open/alerts?id=Alert-1-2"));
        assert!(xml.starts_with(r#"<toast launch="deadlock-plus://open/alerts?id=Alert-1-2">"#), "{xml}");
        assert!(!xml.contains("activationType"), "{xml}");
        assert!(xml.contains("<text>Title</text><text>Body</text>"), "{xml}");
    }

    #[test]
    fn a_launch_url_parses_back_to_its_route_and_id() {
        for route in ROUTES {
            let url = launch_url(route, "Maintenance-1760700000-12").unwrap();
            assert_eq!(parse_launch(&url), Some(Launch { route, id: "Maintenance-1760700000-12".into() }), "{url}");
        }
        assert_eq!(launch_url("/alerts", "Alert-1-2").as_deref(), Some("deadlock-plus://open/alerts?id=Alert-1-2"));
    }

    #[test]
    fn no_launch_url_for_an_id_that_would_not_parse_back() {
        assert_eq!(launch_url("/alerts", ""), None);
        assert_eq!(launch_url("/alerts", "a&b"), None);
        assert_eq!(launch_url("/alerts", &"a".repeat(MAX_ID_LEN + 1)), None);
    }

    #[test]
    fn the_scheme_and_host_ignore_case() {
        assert_eq!(parse_launch("DEADLOCK-PLUS://Open/alerts?id=a"), Some(Launch { route: "/alerts", id: "a".into() }));
    }

    #[test]
    fn hostile_launch_urls_are_rejected() {
        let long_id = format!("deadlock-plus://open/alerts?id={}", "a".repeat(MAX_ID_LEN + 1));
        let long_url = format!("deadlock-plus://open/alerts?id=a{}", "-".repeat(MAX_LAUNCH_LEN));
        for bad in [
            "",
            "deadlock-plus://open/alerts",
            "deadlock-plus://open/alerts?",
            "deadlock-plus://open/alerts?id=",
            "deadlock-plus://open/alerts?id=a&x=1",
            "deadlock-plus://open/alerts?x=1&id=a",
            "deadlock-plus://open/alerts?id=a b",
            "deadlock-plus://open/alerts?id=a%20b",
            "deadlock-plus://open/alerts?id=a#x",
            "deadlock-plus://open/alerts?id=\u{e9}",
            "deadlock-plus://open/alerts/?id=a",
            "deadlock-plus://open//alerts?id=a",
            "deadlock-plus://open/../alerts?id=a",
            "deadlock-plus://open/alerts/..?id=a",
            "deadlock-plus://open/%2e%2e/alerts?id=a",
            "deadlock-plus://open/unknown?id=a",
            "deadlock-plus://open/https://evil.example?id=a",
            "deadlock-plus://evil/alerts?id=a",
            "deadlock-plus:open/alerts?id=a",
            "other://open/alerts?id=a",
            "https://open/alerts?id=a",
            "/alerts",
            "--autostart",
            r"C:\Program Files\Deadlock+\deadlock-plus.exe",
            "\u{e9}eadlock-plus://open/alerts?id=a",
            &long_id,
            &long_url,
        ] {
            assert_eq!(parse_launch(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn the_launch_url_is_found_among_the_process_arguments() {
        let url = "deadlock-plus://open/server-picker?id=Servers-1-0";
        let want = Some(Launch { route: "/server-picker", id: "Servers-1-0".into() });
        assert_eq!(launch_from_args([r"C:\Deadlock+\deadlock-plus.exe", url]), want);
        assert_eq!(launch_from_args(["deadlock-plus", "--autostart", url]), want);
        assert_eq!(launch_from_args(["deadlock-plus", "--autostart"]), None);
        assert_eq!(launch_from_args(["deadlock-plus", "deadlock-plus://open/unknown?id=a"]), None);
    }

    #[test]
    fn toast_xml_without_a_route_has_no_launch() {
        let xml = toast_xml("Title", "Body", None);
        assert!(xml.starts_with("<toast>"), "{xml}");
        assert!(!xml.contains("launch"), "{xml}");
    }

    #[test]
    fn toast_xml_escapes_feed_text() {
        let xml = toast_xml(r#"Patch <1> & "two""#, "it's </text><text>x", Some("/alerts"));
        assert!(xml.contains("<text>Patch &lt;1&gt; &amp; &quot;two&quot;</text>"), "{xml}");
        assert!(xml.contains("<text>it&apos;s &lt;/text&gt;&lt;text&gt;x</text>"), "{xml}");
        assert_eq!(xml.matches("<text>").count(), 2, "{xml}");
    }

    #[cfg(windows)]
    #[test]
    fn toast_xml_with_hostile_text_loads_as_a_toast_document() {
        let xml = toast_xml(r#"<a href="x">&amp;"#, "]]><!--", Some("/alerts"));
        let doc = windows::Data::Xml::Dom::XmlDocument::new().unwrap();
        doc.LoadXml(&windows::core::HSTRING::from(xml)).unwrap();
        let texts = doc.GetElementsByTagName(&"text".into()).unwrap();
        assert_eq!(texts.Length().unwrap(), 2);
        assert_eq!(texts.Item(0).unwrap().InnerText().unwrap().to_string(), r#"<a href="x">&amp;"#);
    }
}
