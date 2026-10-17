#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    InProcess,
    Service,
    Helper,
    /// The caller shows the Allow notice, or a stale-blocks toast for background sync. Never a prompt from here.
    NeedsPermission,
}

pub fn route(elevated: bool, service_approved: bool, helper_running: bool) -> Route {
    if elevated {
        Route::InProcess
    } else if service_approved {
        Route::Service
    } else if helper_running {
        Route::Helper
    } else {
        Route::NeedsPermission
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truth_table() {
        use Route::*;
        let rows = [
            (false, false, false, NeedsPermission),
            (false, false, true, Helper),
            (false, true, false, Service),
            (false, true, true, Service),
            (true, false, false, InProcess),
            (true, false, true, InProcess),
            (true, true, false, InProcess),
            (true, true, true, InProcess),
        ];
        for (elevated, service, helper, want) in rows {
            assert_eq!(route(elevated, service, helper), want, "elevated={elevated} service={service} helper={helper}");
        }
    }
}
