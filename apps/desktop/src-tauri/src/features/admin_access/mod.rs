// The privileged server exists only on Windows; other platforms report fixed values, but the decisions are tested on
// every host.
#![cfg_attr(not(windows), allow(dead_code))]

pub mod commands;

use dp_helper::op::{NEEDS_INSTALLED_APP, SERVICE_INSTALL_FAILED};
use dp_helper::route::Route;
use dp_privilege::Outcome;
use serde::Serialize;
use ts_rs::TS;

use crate::features::error::{error_codes, AppError};
use crate::features::live::state::LivePhase;

error_codes! {
    // Each platform constructs only some of these.
    #[allow(dead_code)]
    pub enum AdminAccessError in "admin_access" {
        AlreadyElevated = "already_elevated",
        InMatch = "in_match",
        AllowFailed = "allow_failed",
        // The service install was blocked (security software?). The helper still runs and this session is allowed.
        AlwaysAllowBlocked = "always_allow_blocked",
        // Always allow needs the installed app. The helper still runs and this session is allowed.
        AlwaysAllowNeedsInstall = "always_allow_needs_install",
        RemoveFailed = "remove_failed",
        Unsupported = "unsupported",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum AdminRoute {
    InProcess,
    Service,
    Helper,
    NeedsPermission,
}

impl From<Route> for AdminRoute {
    fn from(route: Route) -> Self {
        match route {
            Route::InProcess => AdminRoute::InProcess,
            Route::Service => AdminRoute::Service,
            Route::Helper => AdminRoute::Helper,
            Route::NeedsPermission => AdminRoute::NeedsPermission,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AdminAccessStatus {
    pub elevated: bool,
    pub route: AdminRoute,
    /// The Allow buttons may raise a UAC prompt now.
    pub can_prompt: bool,
    /// The game link could not open the game because the game runs elevated and this app does not.
    pub game_runs_as_admin: bool,
}

impl AdminAccessStatus {
    #[cfg(any(test, not(windows)))]
    pub fn unsupported() -> Self {
        AdminAccessStatus {
            elevated: false,
            route: AdminRoute::InProcess,
            can_prompt: false,
            game_runs_as_admin: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum AdminAccessOutcome {
    Applied,
    /// The user dismissed the UAC prompt.
    Cancelled,
    Failed {
        error: AppError,
    },
}

pub fn can_prompt(elevated: bool, phase: LivePhase) -> bool {
    !elevated && !phase.blocks_prompts()
}

pub fn status(elevated: bool, route: Route, phase: LivePhase, game_access_denied: bool) -> AdminAccessStatus {
    AdminAccessStatus {
        elevated,
        route: route.into(),
        can_prompt: can_prompt(elevated, phase),
        game_runs_as_admin: !elevated && game_access_denied,
    }
}

/// Why Allow must not prompt now, if it must not.
pub fn allow_refusal(elevated: bool, phase: LivePhase) -> Option<AppError> {
    if elevated {
        return Some(AppError::new(AdminAccessError::AlreadyElevated));
    }
    if !dp_privilege::may_prompt(true, phase.blocks_prompts()) {
        return Some(AppError::new(AdminAccessError::InMatch));
    }
    None
}

pub fn outcome(outcome: Outcome) -> AdminAccessOutcome {
    match outcome {
        Outcome::Applied => AdminAccessOutcome::Applied,
        Outcome::Cancelled => AdminAccessOutcome::Cancelled,
        Outcome::Failed(detail) => {
            let error = if detail == NEEDS_INSTALLED_APP {
                AppError::new(AdminAccessError::AlwaysAllowNeedsInstall)
            } else if let Some(service) = detail.strip_prefix(SERVICE_INSTALL_FAILED) {
                AppError::new(AdminAccessError::AlwaysAllowBlocked).detail(service)
            } else {
                AppError::new(AdminAccessError::AllowFailed).detail(detail)
            };
            AdminAccessOutcome::Failed { error }
        }
    }
}

pub fn remove_result(elevated: bool, revoke: impl FnOnce() -> Result<(), String>) -> Result<(), AppError> {
    if elevated {
        return Err(AppError::new(AdminAccessError::AlreadyElevated));
    }
    revoke().map_err(|detail| AppError::new(AdminAccessError::RemoveFailed).detail(detail))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::error::assert_catalogued;

    const ALL_PHASES: [LivePhase; 6] = [
        LivePhase::GameClosed,
        LivePhase::Menus,
        LivePhase::Queuing,
        LivePhase::Pregame,
        LivePhase::InMatch,
        LivePhase::PostMatch,
    ];

    #[test]
    fn every_admin_access_code_is_in_the_english_catalog() {
        assert_catalogued::<AdminAccessError>();
    }

    #[test]
    fn prompts_wait_for_the_match_to_end_and_never_run_elevated() {
        for phase in ALL_PHASES {
            let blocked = matches!(phase, LivePhase::Pregame | LivePhase::InMatch);
            assert_eq!(can_prompt(false, phase), !blocked, "{phase:?}");
            assert!(!can_prompt(true, phase), "{phase:?}");
        }
    }

    #[test]
    fn an_elevated_game_is_reported_only_to_a_normal_user_app() {
        let normal = status(false, Route::NeedsPermission, LivePhase::Menus, true);
        assert!(normal.game_runs_as_admin);
        let elevated = status(true, Route::InProcess, LivePhase::Menus, true);
        assert!(!elevated.game_runs_as_admin);
        assert!(!status(false, Route::Helper, LivePhase::Menus, false).game_runs_as_admin);
    }

    #[test]
    fn status_carries_the_route_and_the_prompt_rule() {
        let s = status(false, Route::Service, LivePhase::InMatch, false);
        assert_eq!(
            s,
            AdminAccessStatus {
                elevated: false,
                route: AdminRoute::Service,
                can_prompt: false,
                game_runs_as_admin: false
            }
        );
        assert_eq!(status(true, Route::InProcess, LivePhase::Menus, false).route, AdminRoute::InProcess);
        assert!(status(false, Route::NeedsPermission, LivePhase::Queuing, false).can_prompt);
    }

    #[test]
    fn routes_serialize_in_camel_case() {
        let json = serde_json::to_value(AdminAccessStatus {
            elevated: false,
            route: AdminRoute::NeedsPermission,
            can_prompt: true,
            game_runs_as_admin: false,
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "elevated": false, "route": "needsPermission", "canPrompt": true, "gameRunsAsAdmin": false
            })
        );
        assert_eq!(AdminRoute::from(Route::Helper), AdminRoute::Helper);
        assert_eq!(AdminRoute::from(Route::InProcess), AdminRoute::InProcess);
    }

    #[test]
    fn other_platforms_report_nothing_to_allow() {
        assert_eq!(
            AdminAccessStatus::unsupported(),
            AdminAccessStatus {
                elevated: false,
                route: AdminRoute::InProcess,
                can_prompt: false,
                game_runs_as_admin: false
            }
        );
    }

    #[test]
    fn allow_is_refused_while_elevated_or_in_a_match() {
        assert_eq!(allow_refusal(true, LivePhase::Menus).unwrap().code(), "admin_access.already_elevated");
        assert_eq!(allow_refusal(false, LivePhase::Pregame).unwrap().code(), "admin_access.in_match");
        assert_eq!(allow_refusal(false, LivePhase::InMatch).unwrap().code(), "admin_access.in_match");
        for phase in [LivePhase::GameClosed, LivePhase::Menus, LivePhase::Queuing, LivePhase::PostMatch] {
            assert!(allow_refusal(false, phase).is_none(), "{phase:?}");
        }
    }

    #[test]
    fn prompt_outcomes_map_to_the_ui_outcome() {
        assert_eq!(outcome(Outcome::Applied), AdminAccessOutcome::Applied);
        assert_eq!(outcome(Outcome::Cancelled), AdminAccessOutcome::Cancelled);
        let AdminAccessOutcome::Failed { error } = outcome(Outcome::Failed("Windows error 5".into())) else {
            panic!("a failure was not reported");
        };
        assert_eq!(error.to_string(), "admin_access.allow_failed: Windows error 5");
    }

    #[test]
    fn always_allow_failures_get_their_own_codes() {
        let AdminAccessOutcome::Failed { error } = outcome(Outcome::Failed(NEEDS_INSTALLED_APP.into())) else {
            panic!("a failure was not reported");
        };
        assert_eq!(error.to_string(), "admin_access.always_allow_needs_install");
        let blocked = format!("{SERVICE_INSTALL_FAILED}Windows error 5");
        let AdminAccessOutcome::Failed { error } = outcome(Outcome::Failed(blocked)) else {
            panic!("a failure was not reported");
        };
        assert_eq!(error.to_string(), "admin_access.always_allow_blocked: Windows error 5");
        let AdminAccessOutcome::Failed { error } = outcome(Outcome::Failed("service_install_failed".into())) else {
            panic!("a failure was not reported");
        };
        assert_eq!(error.code(), "admin_access.allow_failed");
    }

    #[test]
    fn outcomes_serialize_with_a_status_tag_and_no_detail() {
        let failed = outcome(Outcome::Failed("Windows error 5".into()));
        assert_eq!(
            serde_json::to_value(failed).unwrap(),
            serde_json::json!({ "status": "failed", "error": { "code": "admin_access.allow_failed", "params": {} } })
        );
        assert_eq!(
            serde_json::to_value(AdminAccessOutcome::Cancelled).unwrap(),
            serde_json::json!({ "status": "cancelled" })
        );
    }

    #[test]
    fn remove_is_refused_while_elevated_and_keeps_the_failure_detail() {
        let mut called = false;
        let err = remove_result(true, || {
            called = true;
            Ok(())
        })
        .unwrap_err();
        assert_eq!(err.code(), "admin_access.already_elevated");
        assert!(!called, "revoke ran while elevated");
        assert_eq!(remove_result(false, || Ok(())), Ok(()));
        let err = remove_result(false, || Err("Always allow is not turned on.".into())).unwrap_err();
        assert_eq!(err.to_string(), "admin_access.remove_failed: Always allow is not turned on.");
    }
}
