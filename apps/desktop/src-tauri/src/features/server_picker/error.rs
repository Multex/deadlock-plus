use crate::features::error::{error_codes, AppError};
use dp_helper::op::HELPER_OUT_OF_DATE;
use dp_server_picker::sdr::SdrError;

#[cfg(windows)]
use dp_helper::routed::Routed;

error_codes! {
    /// Only the Windows privileged-helper routing reports `NeedsPermission`.
    #[cfg_attr(not(windows), allow(dead_code))]
    pub enum ServerPickerError in "server_picker" {
        UnknownGame = "unknown_game",
        InvalidRequest = "invalid_request",
        NoRelayData = "no_relay_data",
        BlockFailed = "block_failed",
        UnblockFailed = "unblock_failed",
        ListBlockedFailed = "list_blocked_failed",
        SyncFailed = "sync_failed",
        ExternalScanFailed = "external_scan_failed",
        ExternalImportFailed = "external_import_failed",
        NeedsPermission = "needs_permission",
        HelperOutOfDate = "helper_out_of_date",
    }
}

impl From<SdrError> for AppError {
    fn from(error: SdrError) -> Self {
        match error {
            SdrError::Request(e) => AppError::network(e),
            SdrError::Empty => AppError::new(ServerPickerError::NoRelayData),
        }
    }
}

pub fn unknown_game(game_id: &str) -> AppError {
    AppError::new(ServerPickerError::UnknownGame).detail(format!("unknown game id: {game_id}"))
}

pub fn invalid_request(reason: String) -> AppError {
    AppError::new(ServerPickerError::InvalidRequest).detail(reason)
}

pub fn sync_error(detail: String) -> AppError {
    match detail.as_str() {
        HELPER_OUT_OF_DATE => AppError::new(ServerPickerError::HelperOutOfDate),
        _ => AppError::new(ServerPickerError::SyncFailed).detail(detail),
    }
}

#[cfg(windows)]
pub fn routed_error(error: Routed, failed: ServerPickerError) -> AppError {
    match error {
        Routed::NeedsPermission => AppError::new(ServerPickerError::NeedsPermission),
        Routed::Failed(detail) if detail == HELPER_OUT_OF_DATE => AppError::new(ServerPickerError::HelperOutOfDate),
        Routed::Failed(detail) => AppError::new(failed).detail(detail),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::error::assert_catalogued;
    use crate::features::server_picker::commands;

    #[test]
    fn every_server_picker_code_is_in_the_english_catalog() {
        assert_catalogued::<ServerPickerError>();
    }

    #[test]
    fn an_empty_relay_list_maps_to_its_own_code() {
        assert_eq!(AppError::from(SdrError::Empty).code(), "server_picker.no_relay_data");
    }

    #[test]
    fn an_unknown_game_keeps_the_id_out_of_the_code() {
        assert_eq!(unknown_game("nope").code(), "server_picker.unknown_game");
    }

    #[cfg(windows)]
    #[test]
    fn a_missing_grant_maps_to_its_own_code_without_detail() {
        let err = routed_error(Routed::NeedsPermission, ServerPickerError::BlockFailed);
        assert_eq!(err.code(), "server_picker.needs_permission");
        assert_eq!(err.to_string(), "server_picker.needs_permission");
    }

    #[cfg(windows)]
    #[test]
    fn a_routed_failure_keeps_the_callers_code_and_the_detail() {
        let err = routed_error(Routed::Failed("rule add failed".into()), ServerPickerError::UnblockFailed);
        assert_eq!(err.to_string(), "server_picker.unblock_failed: rule add failed");
        let err = routed_error(Routed::Failed("x".into()), ServerPickerError::ExternalImportFailed);
        assert_eq!(err.code(), "server_picker.external_import_failed");
    }

    #[cfg(windows)]
    #[test]
    fn an_out_of_date_helper_gets_its_own_code_on_every_routed_call() {
        for failed in [ServerPickerError::BlockFailed, ServerPickerError::UnblockFailed] {
            let err = routed_error(Routed::Failed(HELPER_OUT_OF_DATE.into()), failed);
            assert_eq!(err.to_string(), "server_picker.helper_out_of_date");
        }
    }

    #[test]
    fn a_sync_failure_keeps_the_detail_unless_the_helper_is_out_of_date() {
        assert_eq!(sync_error(HELPER_OUT_OF_DATE.into()).to_string(), "server_picker.helper_out_of_date");
        assert_eq!(sync_error("timed out".into()).to_string(), "server_picker.sync_failed: timed out");
    }

    #[test]
    fn blocking_a_bad_group_id_is_refused_before_touching_the_firewall() {
        let request = commands::BlockGroupRequest {
            id: "../evil".into(),
            description: "x".into(),
            relay_ips: vec!["155.133.248.1".into()],
        };
        let err = tauri::async_runtime::block_on(commands::block_server_groups(vec![request])).unwrap_err();
        assert_eq!(err.code(), "server_picker.invalid_request");
    }

    #[test]
    fn unblocking_a_bad_group_id_is_refused_before_touching_the_firewall() {
        let err = tauri::async_runtime::block_on(commands::unblock_server_groups(vec!["../evil".into()])).unwrap_err();
        assert_eq!(err.code(), "server_picker.invalid_request");
    }

    #[test]
    fn listing_a_bad_group_id_is_refused_before_touching_the_firewall() {
        let err = tauri::async_runtime::block_on(commands::list_blocked_group_ids(vec!["../evil".into()])).unwrap_err();
        assert_eq!(err.code(), "server_picker.invalid_request");
    }
}
