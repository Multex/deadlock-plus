use std::sync::OnceLock;

/// Whether a StatusNotifier host (the panel that draws tray icons) is on the session bus.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub enum TrayHost {
    Present,
    Absent,
    Unknown,
}

/// Probed once per process.
pub fn tray_host() -> TrayHost {
    static HOST: OnceLock<TrayHost> = OnceLock::new();
    *HOST.get_or_init(probe)
}

#[cfg(not(target_os = "linux"))]
fn probe() -> TrayHost {
    TrayHost::Present
}

#[cfg(target_os = "linux")]
fn probe() -> TrayHost {
    let host = match linux::host_registered() {
        Ok(true) => TrayHost::Present,
        Ok(false) => TrayHost::Absent,
        Err(e) => {
            log::warn!("could not ask the session bus for a status notifier host: {e}");
            TrayHost::Unknown
        }
    };
    log::info!("status notifier host: {host:?}");
    host
}

#[cfg(target_os = "linux")]
mod linux {
    use std::time::Duration;
    use zbus::blocking::{connection, fdo::DBusProxy, proxy, Proxy};
    use zbus::names::BusName;
    use zbus::proxy::CacheProperties;

    const WATCHER: &str = "org.kde.StatusNotifierWatcher";
    const WATCHER_PATH: &str = "/StatusNotifierWatcher";
    // Startup waits on this; a stuck bus must not keep the window from coming up.
    const CALL_TIMEOUT: Duration = Duration::from_secs(1);

    /// A watcher alone is not enough: some desktops own the name with no panel drawing the icons.
    pub fn host_registered() -> zbus::Result<bool> {
        let conn = connection::Builder::session()?.method_timeout(CALL_TIMEOUT).build()?;
        if !DBusProxy::new(&conn)?.name_has_owner(BusName::try_from(WATCHER)?)? {
            return Ok(false);
        }
        let watcher: Proxy = proxy::Builder::new(&conn)
            .destination(WATCHER)?
            .path(WATCHER_PATH)?
            .interface(WATCHER)?
            .cache_properties(CacheProperties::No)
            .build()?;
        watcher.get_property("IsStatusNotifierHostRegistered")
    }
}

#[cfg(all(test, not(target_os = "linux")))]
mod tests {
    use super::*;

    #[test]
    fn the_tray_always_has_a_host_off_linux() {
        assert_eq!(tray_host(), TrayHost::Present);
    }
}
