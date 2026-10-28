use serde::Serialize;
use std::collections::BTreeMap;
use std::fmt::{self, Display};
use ts_rs::TS;

pub trait ErrorKey: Copy + 'static {
    const FEATURE: &'static str;
    #[cfg(test)]
    const ALL: &'static [Self];
    fn name(self) -> &'static str;

    fn code(self) -> String {
        format!("{}.{}", Self::FEATURE, self.name())
    }
}

/// Declares a feature's error codes. Each variant carries its snake_case catalog name; the catalog key is
/// `errors.<feature>.<name>`.
macro_rules! error_codes {
    ($(#[$meta:meta])* $vis:vis enum $enum:ident in $feature:literal { $($variant:ident = $name:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        $vis enum $enum {
            $($variant),+
        }

        impl $crate::features::error::ErrorKey for $enum {
            const FEATURE: &'static str = $feature;
            #[cfg(test)]
            const ALL: &'static [Self] = &[$(Self::$variant),+];

            fn name(self) -> &'static str {
                match self {
                    $(Self::$variant => $name),+
                }
            }
        }
    };
}
pub(crate) use error_codes;

error_codes! {
    pub enum CommonError in "common" {
        Io = "io",
        Network = "network",
        Internal = "internal",
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct AppError {
    code: String,
    params: BTreeMap<String, String>,
    #[serde(skip)]
    #[ts(skip)]
    detail: Option<String>,
}

impl AppError {
    pub fn new(key: impl ErrorKey) -> Self {
        Self { code: key.code(), params: BTreeMap::new(), detail: None }
    }

    pub fn param(mut self, name: &str, value: impl ToString) -> Self {
        self.params.insert(name.to_string(), value.to_string());
        self
    }

    /// Raw English detail for the logs. It is never sent to the UI.
    pub fn detail(self, detail: impl Display) -> Self {
        let quiet = self.quiet_detail(detail);
        log::warn!("{quiet}");
        quiet
    }

    /// `detail` without the WARN line, for expected flow control such as a local budget refusal.
    /// The caller decides what, if anything, to log.
    pub fn quiet_detail(mut self, detail: impl Display) -> Self {
        self.detail = Some(detail.to_string());
        self
    }

    #[cfg(test)]
    pub fn code(&self) -> &str {
        &self.code
    }

    pub fn io(source: impl Display) -> Self {
        Self::new(CommonError::Io).detail(source)
    }

    pub fn network(source: impl Display) -> Self {
        Self::new(CommonError::Network).detail(source)
    }

    pub fn internal(source: impl Display) -> Self {
        Self::new(CommonError::Internal).detail(source)
    }
}

impl Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(f, "{}: {detail}", self.code),
            None => f.write_str(&self.code),
        }
    }
}

impl std::error::Error for AppError {}

impl<K: ErrorKey> From<K> for AppError {
    fn from(key: K) -> Self {
        Self::new(key)
    }
}

#[cfg(test)]
const CATALOG: &str = include_str!("../../../../../locales/app/en.json");

#[cfg(test)]
pub(crate) fn assert_catalogued<K: ErrorKey>() {
    let catalog: serde_json::Value = serde_json::from_str(CATALOG).expect("locales/app/en.json is valid JSON");
    for key in K::ALL {
        let present = catalog["errors"][K::FEATURE][key.name()].as_str().is_some_and(|text| !text.is_empty());
        assert!(present, "missing catalog key errors.{}.{}", K::FEATURE, key.name());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_params_without_detail() {
        let err = AppError::new(CommonError::Io).param("what", "log folder").detail("os error 5");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json, serde_json::json!({ "code": "common.io", "params": { "what": "log folder" } }));
    }

    #[test]
    fn code_is_feature_dot_snake_case_name() {
        assert_eq!(CommonError::Network.code(), "common.network");
        assert_eq!(CommonError::Internal.code(), "common.internal");
    }

    #[test]
    fn display_includes_code_and_detail_for_logs() {
        let err = AppError::new(CommonError::Network).detail("timed out");
        assert_eq!(err.to_string(), "common.network: timed out");
        assert_eq!(AppError::new(CommonError::Internal).to_string(), "common.internal");
    }

    #[test]
    fn a_quiet_detail_reads_like_a_logged_one() {
        let quiet = AppError::new(CommonError::Network).quiet_detail("budget is low");
        assert_eq!(quiet, AppError::new(CommonError::Network).detail("budget is low"));
        assert_eq!(quiet.to_string(), "common.network: budget is low");
    }

    #[test]
    fn generic_constructors_keep_the_source_text_as_detail() {
        let err = AppError::io("permission denied");
        assert_eq!(err.to_string(), "common.io: permission denied");
        assert_eq!(AppError::network("dns").code(), "common.network");
        assert_eq!(AppError::internal("oops").code(), "common.internal");
    }

    #[test]
    fn every_common_code_is_in_the_english_catalog() {
        assert_catalogued::<CommonError>();
    }

    #[test]
    #[should_panic(expected = "missing catalog key")]
    fn assert_catalogued_fails_for_a_code_with_no_entry() {
        #[derive(Clone, Copy)]
        enum Ghost {
            Unwritten,
        }
        impl ErrorKey for Ghost {
            const FEATURE: &'static str = "ghost";
            const ALL: &'static [Self] = &[Ghost::Unwritten];
            fn name(self) -> &'static str {
                "unwritten"
            }
        }
        assert_catalogued::<Ghost>();
    }
}
