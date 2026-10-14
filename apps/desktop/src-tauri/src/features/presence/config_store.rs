use std::io;
use std::path::Path;

use dp_presence::Config;
use dp_versioned::{self, Migration};

use crate::features::error::{error_codes, AppError};

error_codes! {
    pub enum PresenceError in "presence" {
        ImportInvalid = "import_invalid",
        SaveFailed = "save_failed",
    }
}

pub const STORE_FILE: &str = "presence-config.json";
const MIGRATIONS: &[Migration] = &[];

/// An unreadable or newer-schema file reads as the default config; `save` still refuses to overwrite a newer one.
pub fn load(path: &Path) -> Config {
    match dp_versioned::read::<Config>(path, MIGRATIONS) {
        Ok(config) => config.unwrap_or_default(),
        Err(e) => {
            log::warn!("could not read {STORE_FILE}, using the defaults: {e}");
            Config::default()
        }
    }
}

pub fn save(path: &Path, config: &Config) -> io::Result<()> {
    dp_versioned::write(path, MIGRATIONS, config)
}

pub fn export(config: &Config) -> String {
    serde_json::to_string_pretty(config).unwrap_or_else(|_| "{}".to_owned())
}

pub fn import(text: &str) -> Result<Config, AppError> {
    let invalid = |detail: &dyn std::fmt::Display| AppError::new(PresenceError::ImportInvalid).detail(detail);
    let value: serde_json::Value = serde_json::from_str(text).map_err(|e| invalid(&e))?;
    if !value.is_object() {
        return Err(invalid(&"expected a JSON object"));
    }
    serde_json::from_value(value).map_err(|e| invalid(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_presence::{PartialSlot, StateId};

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-presence-config-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(STORE_FILE)
    }

    fn sample() -> Config {
        let mut c = Config::default();
        c.states.insert(StateId::Hideout, PartialSlot { details: Some("Chilling".into()), ..PartialSlot::default() });
        c
    }

    #[test]
    fn a_missing_file_loads_the_default() {
        assert_eq!(load(&temp("missing")), Config::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        let path = temp("round-trip");
        save(&path, &sample()).unwrap();
        assert_eq!(load(&path), sample());
    }

    #[test]
    fn a_corrupt_file_loads_the_default() {
        let path = temp("corrupt");
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), Config::default());
    }

    #[test]
    fn a_newer_schema_loads_the_default_and_is_not_overwritten() {
        let path = temp("newer");
        std::fs::write(&path, r#"{"schema_version":99,"data":{}}"#).unwrap();
        assert_eq!(load(&path), Config::default());
        assert!(save(&path, &sample()).is_err());
        assert!(std::fs::read_to_string(&path).unwrap().contains("99"));
    }

    #[test]
    fn export_then_import_round_trips() {
        assert_eq!(import(&export(&sample())).unwrap(), sample());
    }

    #[test]
    fn import_skips_what_this_build_does_not_know() {
        let c = import(r#"{"states":{"hideout":{"details":"Hi"},"future":{"details":"x"}}}"#).unwrap();
        assert_eq!(c.states.len(), 1);
    }

    #[test]
    fn import_rejects_text_that_is_not_a_config_object() {
        for bad in ["", "not json", "[]", "5", "null", "\"x\"", r#"{"states":5}"#] {
            assert_eq!(import(bad).unwrap_err().code(), "presence.import_invalid", "{bad:?}");
        }
    }

    #[test]
    fn every_presence_code_is_in_the_english_catalog() {
        crate::features::error::assert_catalogued::<PresenceError>();
    }
}
