use crate::features::error::error_codes;

error_codes! {
    pub enum GcError in "gc" {
        SteamNotFound = "steam_not_found",
        NoLogin = "no_login",
        GameRunning = "game_running",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::error::{assert_catalogued, AppError};

    #[test]
    fn every_gc_code_is_in_the_english_catalog() {
        assert_catalogued::<GcError>();
    }

    #[test]
    fn codes_are_prefixed_with_the_feature() {
        assert_eq!(AppError::from(GcError::SteamNotFound).code(), "gc.steam_not_found");
        assert_eq!(AppError::from(GcError::NoLogin).code(), "gc.no_login");
    }
}
