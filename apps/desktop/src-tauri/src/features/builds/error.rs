use crate::features::error::{error_codes, AppError};
use dp_builds::backup::WriteError;
use dp_builds::file::FileError;
use dp_builds::history::HistoryError;
use dp_builds::model::AbilityOrderError;
use dp_builds::paths::PathError;
use dp_builds::queue::QueueError;
use dp_builds::save::SaveError;

error_codes! {
    pub enum BuildsError in "builds" {
        NoAccount = "no_account",
        NoUserdata = "no_userdata",
        ReadFailed = "read_failed",
        BadFile = "bad_file",
        NoBackupName = "no_backup_name",
        BackupFailed = "backup_failed",
        WriteFailed = "write_failed",
        BadBase = "bad_base",
        InvalidAbilityOrder = "invalid_ability_order",
        AbilitiesUnknown = "abilities_unknown",
        PublishedDeleteInGame = "published_delete_in_game",
        UnknownHero = "unknown_hero",
        NoLocalId = "no_local_id",
        BuildNotFound = "build_not_found",
        HistoryFailed = "history_failed",
        VersionNotFound = "version_not_found",
        QueueFailed = "queue_failed",
    }
}

/// `GameRunning` never reaches the UI as an error: callers queue the save instead.
pub fn save_error_key(error: &SaveError) -> BuildsError {
    match error {
        SaveError::GameRunning | SaveError::Read(_) => BuildsError::ReadFailed,
        SaveError::File(_) => BuildsError::BadFile,
        SaveError::Write(e) => write_error_key(e),
    }
}

fn write_error_key(error: &WriteError) -> BuildsError {
    match error {
        WriteError::NoBackupName => BuildsError::NoBackupName,
        WriteError::BackupFailed(_) => BuildsError::BackupFailed,
        WriteError::WriteFailed { .. } => BuildsError::WriteFailed,
    }
}

impl From<PathError> for AppError {
    fn from(error: PathError) -> Self {
        AppError::new(match error {
            PathError::NoAccount => BuildsError::NoAccount,
            PathError::NoUserdata => BuildsError::NoUserdata,
        })
    }
}

impl From<SaveError> for AppError {
    fn from(error: SaveError) -> Self {
        match error {
            SaveError::Write(e) => e.into(),
            other => AppError::new(save_error_key(&other)).detail(&other),
        }
    }
}

impl From<WriteError> for AppError {
    fn from(error: WriteError) -> Self {
        let err = AppError::new(write_error_key(&error));
        let err = match &error {
            WriteError::WriteFailed { backup: Some(backup), .. } => err.param("backup", backup.display()),
            _ => err,
        };
        err.detail(&error)
    }
}

impl From<FileError> for AppError {
    fn from(error: FileError) -> Self {
        AppError::new(BuildsError::BadFile).detail(error)
    }
}

impl From<QueueError> for AppError {
    fn from(error: QueueError) -> Self {
        AppError::new(BuildsError::QueueFailed).detail(error)
    }
}

impl From<HistoryError> for AppError {
    fn from(error: HistoryError) -> Self {
        AppError::new(BuildsError::HistoryFailed).detail(error)
    }
}

impl From<AbilityOrderError> for AppError {
    fn from(error: AbilityOrderError) -> Self {
        let step = match error {
            AbilityOrderError::UnknownAbility { step }
            | AbilityOrderError::UnknownCurrency { step }
            | AbilityOrderError::WrongCost { step, .. }
            | AbilityOrderError::UnknownCost { step }
            | AbilityOrderError::AlreadyUnlocked { step }
            | AbilityOrderError::UltimateBeforeOthers { step }
            | AbilityOrderError::NotUnlocked { step }
            | AbilityOrderError::AlreadyMaxed { step } => step,
        };
        AppError::new(BuildsError::InvalidAbilityOrder).param("step", step + 1).detail(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::error::{assert_catalogued, ErrorKey};
    use std::path::PathBuf;

    fn io() -> std::io::Error {
        std::io::Error::other("x")
    }

    #[test]
    fn every_builds_code_is_in_the_english_catalog() {
        assert_catalogued::<BuildsError>();
    }

    #[test]
    fn path_errors_map_to_their_own_codes() {
        assert_eq!(AppError::from(PathError::NoAccount).code(), "builds.no_account");
        assert_eq!(AppError::from(PathError::NoUserdata).code(), "builds.no_userdata");
    }

    #[test]
    fn write_errors_map_to_their_own_codes() {
        assert_eq!(AppError::from(WriteError::NoBackupName).code(), "builds.no_backup_name");
        assert_eq!(AppError::from(WriteError::BackupFailed(io())).code(), "builds.backup_failed");
        let failed = WriteError::WriteFailed { backup: Some(PathBuf::from("b")), source: io() };
        assert_eq!(AppError::from(failed).code(), "builds.write_failed");
        let failed = WriteError::WriteFailed { backup: None, source: io() };
        assert_eq!(AppError::from(failed).code(), "builds.write_failed");
    }

    #[test]
    fn save_errors_map_through_their_cause() {
        assert_eq!(AppError::from(SaveError::Read(io())).code(), "builds.read_failed");
        assert_eq!(AppError::from(SaveError::File(FileError::RootNotObject)).code(), "builds.bad_file");
        assert_eq!(AppError::from(SaveError::Write(WriteError::BackupFailed(io()))).code(), "builds.backup_failed");
        assert_eq!(save_error_key(&SaveError::Write(WriteError::NoBackupName)).code(), "builds.no_backup_name");
        assert_eq!(save_error_key(&SaveError::File(FileError::NoBuildId)).code(), "builds.bad_file");
    }

    #[test]
    fn store_errors_map_to_their_store() {
        assert_eq!(AppError::from(QueueError::Io(io())).code(), "builds.queue_failed");
        assert_eq!(AppError::from(HistoryError::Io(io())).code(), "builds.history_failed");
        assert_eq!(AppError::from(FileError::NotUtf8).code(), "builds.bad_file");
    }

    #[test]
    fn an_ability_order_error_names_its_step() {
        let err = AppError::from(AbilityOrderError::NotUnlocked { step: 3 });
        assert_eq!(err.code(), "builds.invalid_ability_order");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["params"]["step"], "4", "one-based for the message");
    }
}
