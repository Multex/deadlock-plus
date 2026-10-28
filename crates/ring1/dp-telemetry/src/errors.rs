use std::borrow::Cow;
use std::sync::Arc;

use sentry::protocol::{Event, Level, User};
use sentry::{ClientOptions, Integration};

use crate::config::Config;
use crate::gate::Gate;
use crate::scrub::{before_send, MAX_EVENTS_PER_SESSION};

/// `None` when the build has no DSN, which leaves every `capture_*` call a no-op. The panic integration
/// wraps whatever hook is installed when this runs, so call it after the app's own hook is in place.
pub fn init(
    config: &Config,
    release: &str,
    os: &str,
    gate: Gate,
    install_id: &str,
    panic_is_handled: fn() -> bool,
) -> Option<sentry::ClientInitGuard> {
    let dsn = config.sentry_dsn.as_deref()?;
    let guard = sentry::init((
        dsn,
        sentry::ClientOptions {
            release: Some(Cow::Owned(release.to_string())),
            send_default_pii: false,
            max_breadcrumbs: 20,
            before_send: Some(before_send(gate, MAX_EVENTS_PER_SESSION)),
            integrations: vec![Arc::new(HandledPanics(panic_is_handled))],
            ..Default::default()
        },
    ));
    sentry::configure_scope(|scope| scope.set_tag("os", os));
    set_install_id(install_id);
    Some(guard)
}

/// Sentry's panic hook reports every panic as an unhandled, fatal crash. Integrations run on the panicking
/// thread before the event is queued, so this can ask the app whether a command caught it and downgrade it.
pub struct HandledPanics(pub fn() -> bool);

impl Integration for HandledPanics {
    fn name(&self) -> &'static str {
        "handled-panics"
    }

    fn process_event(&self, mut event: Event<'static>, _: &ClientOptions) -> Option<Event<'static>> {
        let mut panics = event
            .exception
            .values
            .iter_mut()
            .filter_map(|e| e.mechanism.as_mut())
            .filter(|m| m.ty == "panic")
            .peekable();
        if panics.peek().is_none() || !(self.0)() {
            return Some(event);
        }
        panics.for_each(|mechanism| mechanism.handled = Some(true));
        event.level = Level::Error;
        event.tags.insert("panic".into(), "command".into());
        Some(event)
    }
}

pub fn set_install_id(id: &str) {
    sentry::configure_scope(|scope| scope.set_user(Some(User { id: Some(id.to_string()), ..Default::default() })));
}

pub fn capture_webview_error(message: &str, stack: &str) {
    let mut event = Event { level: Level::Error, message: Some(format!("{message}\n{stack}")), ..Default::default() };
    event.tags.insert("source".into(), "webview".into());
    sentry::capture_event(event);
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::{Exception, Mechanism};

    #[test]
    fn a_build_without_a_dsn_makes_no_client() {
        assert!(init(&Config::default(), "0.8.0", "windows", Gate::default(), "id", || false).is_none());
    }

    fn panic_event() -> Event<'static> {
        Event {
            exception: vec![Exception {
                ty: "panic".into(),
                mechanism: Some(Mechanism { ty: "panic".into(), handled: Some(false), ..Default::default() }),
                ..Default::default()
            }]
            .into(),
            level: Level::Fatal,
            ..Default::default()
        }
    }

    fn handled(event: &Event<'static>) -> Option<bool> {
        event.exception.values[0].mechanism.as_ref().and_then(|m| m.handled)
    }

    #[test]
    fn a_panic_a_command_caught_reaches_sentry_as_handled() {
        let event = HandledPanics(|| true).process_event(panic_event(), &ClientOptions::default()).unwrap();
        assert_eq!(handled(&event), Some(true));
        assert_eq!(event.level, Level::Error);
        assert_eq!(event.tags.get("panic").map(String::as_str), Some("command"));
    }

    #[test]
    fn a_panic_nothing_caught_stays_fatal() {
        let event = HandledPanics(|| false).process_event(panic_event(), &ClientOptions::default()).unwrap();
        assert_eq!(handled(&event), Some(false));
        assert_eq!(event.level, Level::Fatal);
        assert!(event.tags.is_empty());
    }

    #[test]
    fn an_error_captured_inside_a_command_is_left_alone() {
        let event = Event { level: Level::Error, message: Some("boom".into()), ..Default::default() };
        let event = HandledPanics(|| true).process_event(event, &ClientOptions::default()).unwrap();
        assert!(event.tags.is_empty());
    }
}
