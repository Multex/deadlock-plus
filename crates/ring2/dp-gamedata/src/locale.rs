pub fn game_language(locale: &str) -> &'static str {
    let normalised = locale.replace('_', "-").to_ascii_lowercase();
    let (base, region) = normalised.split_once('-').unwrap_or((&normalised, ""));
    match (base, region) {
        ("pt", "br") => "brazilian",
        ("pt", _) => "portuguese",
        ("zh", "tw" | "hk" | "mo" | "hant") => "tchinese",
        ("zh", _) => "schinese",
        ("es", "419" | "mx" | "ar" | "cl" | "co" | "pe" | "ve" | "latn") => "latam",
        ("cs", _) => "czech",
        ("de", _) => "german",
        ("es", _) => "spanish",
        ("fr", _) => "french",
        ("hu", _) => "hungarian",
        ("id", _) => "indonesian",
        ("it", _) => "italian",
        ("ja", _) => "japanese",
        ("ko", _) => "koreana",
        ("pl", _) => "polish",
        ("ru", _) => "russian",
        ("th", _) => "thai",
        ("tr", _) => "turkish",
        ("uk", _) => "ukrainian",
        _ => deadlock_data::DEFAULT_LANGUAGE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn locale_codes() -> Vec<String> {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../locales/app");
        let mut codes: Vec<String> = std::fs::read_dir(&dir)
            .expect("locales/app dir exists")
            .filter_map(|e| {
                let path = e.ok()?.path();
                (path.extension()? == "json").then(|| path.file_stem()?.to_str().map(str::to_string))?
            })
            .collect();
        codes.sort();
        codes
    }

    #[test]
    fn every_app_locale_maps_to_a_shipped_game_language() {
        let codes = locale_codes();
        assert!(codes.len() >= 20, "found {codes:?}");
        for code in codes {
            let lang = game_language(&code);
            assert!(deadlock_data::LANGUAGES.contains(&lang), "{code} -> {lang}");
        }
    }

    #[test]
    fn locales_with_a_game_language_do_not_fall_back_to_english() {
        let expected = [
            ("cs", "czech"),
            ("de", "german"),
            ("es", "spanish"),
            ("fr", "french"),
            ("hu", "hungarian"),
            ("id", "indonesian"),
            ("it", "italian"),
            ("ja", "japanese"),
            ("ko", "koreana"),
            ("pl", "polish"),
            ("pt", "portuguese"),
            ("pt-BR", "brazilian"),
            ("ru", "russian"),
            ("th", "thai"),
            ("tr", "turkish"),
            ("uk", "ukrainian"),
            ("zh-CN", "schinese"),
            ("zh-TW", "tchinese"),
        ];
        for (code, lang) in expected {
            assert_eq!(game_language(code), lang, "{code}");
        }
    }

    #[test]
    fn locales_without_a_game_language_use_english() {
        assert_eq!(game_language("en"), "english");
        assert_eq!(game_language("af"), "english");
        assert_eq!(game_language("xx"), "english");
        assert_eq!(game_language(""), "english");
    }

    #[test]
    fn region_variants_fall_back_to_their_base_language() {
        assert_eq!(game_language("de-AT"), "german");
        assert_eq!(game_language("fr-CA"), "french");
        assert_eq!(game_language("pt-PT"), "portuguese");
        assert_eq!(game_language("zh-HK"), "tchinese");
        assert_eq!(game_language("zh"), "schinese");
        assert_eq!(game_language("es-419"), "latam");
    }

    #[test]
    fn matching_ignores_case_and_underscores() {
        assert_eq!(game_language("PT_br"), "brazilian");
        assert_eq!(game_language("zh_tw"), "tchinese");
    }
}
