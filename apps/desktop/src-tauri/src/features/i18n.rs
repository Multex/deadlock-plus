use serde_json::Value;
use std::sync::{Mutex, OnceLock};

const DEFAULT_LOCALE: &str = "en";

const AREAS: [&str; 6] = ["app", "builds", "live", "matches", "settings", "tools"];

macro_rules! embed_areas {
    ($code:literal) => {
        [
            include_str!(concat!("../../../../../locales/app/", $code, ".json")),
            include_str!(concat!("../../../../../locales/builds/", $code, ".json")),
            include_str!(concat!("../../../../../locales/live/", $code, ".json")),
            include_str!(concat!("../../../../../locales/matches/", $code, ".json")),
            include_str!(concat!("../../../../../locales/settings/", $code, ".json")),
            include_str!(concat!("../../../../../locales/tools/", $code, ".json")),
        ]
    };
}

macro_rules! embed_locales {
    ($($code:literal),* $(,)?) => {
        [$(($code, embed_areas!($code))),*]
    };
}

const SOURCES: [(&str, [&str; AREAS.len()]); 20] = embed_locales![
    "en", "af", "cs", "de", "es", "fr", "hu", "id", "it", "ja", "ko", "pl", "pt", "pt-BR", "ru", "th", "tr", "uk",
    "zh-CN", "zh-TW",
];

/// Parsed on first use so a session only pays for the languages it actually shows. Each area file holds whole
/// top-level namespaces, so joining their objects gives the full catalog.
fn catalog(code: &str) -> Option<&'static Value> {
    static PARSED: [OnceLock<Value>; SOURCES.len()] = [const { OnceLock::new() }; SOURCES.len()];
    let index = SOURCES.iter().position(|(c, _)| *c == code)?;
    Some(PARSED[index].get_or_init(|| {
        let mut merged = serde_json::Map::new();
        for (area, source) in AREAS.iter().zip(SOURCES[index].1) {
            match serde_json::from_str(source) {
                Ok(Value::Object(namespaces)) => merged.extend(namespaces),
                Ok(_) => panic!("locales/{area}/{code}.json is not an object"),
                Err(e) => panic!("locales/{area}/{code}.json is invalid: {e}"),
            }
        }
        Value::Object(merged)
    }))
}

fn lookup<'a>(catalog: &'a Value, key: &str) -> Option<&'a str> {
    let text = key.split('.').try_fold(catalog, |node, part| node.get(part))?.as_str()?;
    (!text.trim().is_empty()).then_some(text)
}

fn interpolate(template: &str, params: &[(&str, &str)]) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('}') {
            Some(end) => {
                let name = &after[..end];
                match params.iter().find(|(n, _)| *n == name) {
                    Some((_, value)) => out.push_str(value),
                    None => out.push_str(&rest[start..start + end + 2]),
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn chain<'l, 'a>(locale: &'l str, all: impl Fn(&str) -> Option<&'a Value>) -> Vec<(&'l str, &'a Value)> {
    let base = locale.split('-').next().unwrap_or(locale);
    let mut out: Vec<(&str, &Value)> = Vec::new();
    for code in [locale, base, DEFAULT_LOCALE] {
        if let Some(catalog) = all(code) {
            if !out.iter().any(|(_, c)| std::ptr::eq(*c, catalog)) {
                out.push((code, catalog));
            }
        }
    }
    out
}

fn translate_with<'a>(
    all: impl Fn(&str) -> Option<&'a Value>,
    locale: &str,
    key: &str,
    params: &[(&str, &str)],
) -> String {
    for (_, catalog) in chain(locale, all) {
        if let Some(template) = lookup(catalog, key) {
            return interpolate(template, params);
        }
    }
    log::warn!("missing i18n key: {key}");
    key.to_string()
}

/// CLDR plural category for a whole number. Bare `pt` is the Portugal catalog (only `pt-BR` treats 0 as singular); unlisted locales use English rules.
fn plural_category(locale: &str, n: u64) -> &'static str {
    let (base, region) = locale.split_once('-').unwrap_or((locale, ""));
    let few_slavic = |n: u64| (2..=4).contains(&(n % 10)) && !(12..=14).contains(&(n % 100));
    match base {
        "ja" | "ko" | "th" | "id" | "zh" | "vi" => "other",
        "ru" | "uk" => match n {
            _ if n % 10 == 1 && n % 100 != 11 => "one",
            _ if few_slavic(n) => "few",
            _ => "many",
        },
        "pl" => match n {
            1 => "one",
            _ if few_slavic(n) => "few",
            _ => "many",
        },
        "cs" => match n {
            1 => "one",
            2..=4 => "few",
            _ => "other",
        },
        "fr" | "pt" | "es" | "it" => {
            let one = match base {
                "fr" => n <= 1,
                "pt" => n == 1 || (n == 0 && region == "BR"),
                _ => n == 1,
            };
            if one {
                "one"
            } else if n != 0 && n.is_multiple_of(1_000_000) {
                "many"
            } else {
                "other"
            }
        }
        _ => {
            if n == 1 {
                "one"
            } else {
                "other"
            }
        }
    }
}

fn translate_plural_with<'a>(
    all: impl Fn(&str) -> Option<&'a Value>,
    locale: &str,
    key: &str,
    count: u64,
    params: &[(&str, &str)],
) -> String {
    let count_text = count.to_string();
    let mut full: Vec<(&str, &str)> = vec![("count", count_text.as_str())];
    full.extend_from_slice(params);
    for (code, catalog) in chain(locale, all) {
        let category = plural_category(code, count);
        for suffix in [category, "other"] {
            if let Some(template) = lookup(catalog, &format!("{key}_{suffix}")) {
                return interpolate(template, &full);
            }
        }
    }
    log::warn!("missing i18n key: {key}");
    key.to_string()
}

pub fn translate_in(locale: &str, key: &str, params: &[(&str, &str)]) -> String {
    translate_with(catalog, locale, key, params)
}

#[allow(dead_code)]
pub fn translate_plural_in(locale: &str, key: &str, count: u64, params: &[(&str, &str)]) -> String {
    translate_plural_with(catalog, locale, key, count, params)
}

pub struct I18nState {
    locale: Mutex<String>,
}

impl Default for I18nState {
    fn default() -> Self {
        Self { locale: Mutex::new(DEFAULT_LOCALE.to_string()) }
    }
}

impl I18nState {
    pub fn locale(&self) -> String {
        self.locale.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Returns whether the locale changed. The frontend re-sends its language on every reload, so a repeat is a no-op.
    pub fn set(&self, locale: &str) -> bool {
        let mut current = self.locale.lock().unwrap_or_else(|e| e.into_inner());
        if *current == locale {
            return false;
        }
        *current = locale.to_string();
        true
    }

    pub fn tr(&self, key: &str, params: &[(&str, &str)]) -> String {
        translate_in(&self.locale(), key, params)
    }

    #[allow(dead_code)]
    pub fn tr_plural(&self, key: &str, count: u64, params: &[(&str, &str)]) -> String {
        translate_plural_in(&self.locale(), key, count, params)
    }
}

pub mod commands {
    use super::*;
    use tauri::{AppHandle, State};

    #[tauri::command]
    pub fn set_language(locale: String, app: AppHandle, state: State<'_, I18nState>) {
        if state.set(&locale) {
            log::info!("language set to {locale}");
            crate::features::tray::apply_language(&app);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn translates_a_dotted_key() {
        assert_eq!(translate_in("en", "tray.quit", &[]), "Quit");
    }

    #[test]
    fn fills_placeholders_and_keeps_unknown_ones() {
        assert_eq!(interpolate("Hi {name}, {other}.", &[("name", "A")]), "Hi A, {other}.");
        assert_eq!(interpolate("open { brace", &[]), "open { brace");
    }

    #[test]
    fn unknown_locale_falls_back_to_en() {
        assert_eq!(translate_in("de-DE", "tray.quit", &[]), "Quit");
    }

    #[test]
    fn every_area_file_is_embedded() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../locales");
        let mut areas: Vec<String> = std::fs::read_dir(&dir)
            .expect("locales dir exists")
            .map(|entry| entry.expect("readable entry").path())
            .filter(|path| path.is_dir())
            .map(|path| path.file_name().and_then(|n| n.to_str()).expect("utf-8 dir name").to_string())
            // The website's copy lives beside the app's areas but never ships in the app.
            .filter(|area| area != "web")
            .collect();
        // The frontend loads these areas on demand and Rust never translates their keys, so embedding them
        // would only grow the binary.
        const FRONTEND_ONLY: [&str; 1] = ["dispatch"];
        areas.retain(|area| !FRONTEND_ONLY.contains(&area.as_str()));
        areas.sort();
        assert_eq!(areas, AREAS, "every locales/<area> dir is embedded");
        for area in AREAS {
            for entry in std::fs::read_dir(dir.join(area)).expect("area dir exists") {
                let path = entry.expect("readable entry").path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                let code = path.file_stem().and_then(|s| s.to_str()).expect("utf-8 file name");
                // Translator notes are Crowdin context, not a catalog.
                if code.ends_with(".notes") {
                    continue;
                }
                let on_disk: Value = serde_json::from_str(&std::fs::read_to_string(&path).expect("readable file"))
                    .expect("locale file is valid JSON");
                let embedded = catalog(code).unwrap_or_else(|| panic!("{code} is not embedded"));
                for (namespace, value) in on_disk.as_object().expect("area file is an object") {
                    assert_eq!(embedded.get(namespace), Some(value), "{area}/{code}.json {namespace}");
                }
            }
        }
    }

    #[test]
    fn translates_keys_from_every_area() {
        assert_eq!(translate_in("en", "tray.quit", &[]), "Quit");
        assert_eq!(translate_in("en", "storage.owners.deadlock.label", &[]), "Deadlock");
        let blurb = translate_in("ru", "storage.owners.deadlock.blurb", &[]);
        assert_eq!(
            Some(blurb.as_str()),
            lookup(catalog("ru").expect("ru is embedded"), "storage.owners.deadlock.blurb")
        );
        assert_ne!(blurb, translate_in("en", "storage.owners.deadlock.blurb", &[]));
    }

    #[test]
    fn translates_into_a_non_english_catalog() {
        let translated = lookup(catalog("af").expect("af is embedded"), "tray.quit").expect("af has tray.quit");
        assert_eq!(translate_in("af", "tray.quit", &[]), translated);
        assert_ne!(translated, "Quit");
    }

    #[test]
    fn missing_key_returns_the_key() {
        assert_eq!(translate_in("en", "nope.nothing", &[]), "nope.nothing");
    }

    #[test]
    fn setting_the_same_locale_twice_changes_once() {
        let state = I18nState::default();
        assert!(!state.set("en"));
        assert!(state.set("fr"));
        assert!(!state.set("fr"));
        assert_eq!(state.locale(), "fr");
    }

    #[test]
    fn state_translates_in_its_locale() {
        let state = I18nState::default();
        assert_eq!(state.tr("tray.show", &[]), "Show Deadlock+");
    }

    fn catalogs_of(entries: &[(&'static str, serde_json::Value)]) -> HashMap<&'static str, Value> {
        entries.iter().cloned().collect()
    }

    #[test]
    fn blank_string_falls_back_to_the_next_catalog() {
        let all = catalogs_of(&[
            ("en", serde_json::json!({ "a": { "b": "English" } })),
            ("de", serde_json::json!({ "a": { "b": "" } })),
        ]);
        assert_eq!(translate_with(|c| all.get(c), "de", "a.b", &[]), "English");
    }

    #[test]
    fn whitespace_only_string_counts_as_blank() {
        let all =
            catalogs_of(&[("en", serde_json::json!({ "k": "English" })), ("de", serde_json::json!({ "k": "  " }))]);
        assert_eq!(translate_with(|c| all.get(c), "de", "k", &[]), "English");
    }

    #[test]
    fn plural_categories_for_russian() {
        let cat = |n| plural_category("ru", n);
        assert_eq!([cat(1), cat(21), cat(101)], ["one"; 3]);
        assert_eq!([cat(2), cat(4), cat(22), cat(104)], ["few"; 4]);
        assert_eq!([cat(0), cat(5), cat(11), cat(12), cat(14), cat(100)], ["many"; 6]);
    }

    #[test]
    fn plural_categories_for_polish_and_czech() {
        assert_eq!(plural_category("pl", 1), "one");
        assert_eq!(plural_category("pl", 22), "few");
        assert_eq!(plural_category("pl", 12), "many");
        assert_eq!(plural_category("pl", 21), "many");
        assert_eq!(plural_category("cs", 1), "one");
        assert_eq!(plural_category("cs", 3), "few");
        assert_eq!(plural_category("cs", 5), "other");
    }

    #[test]
    fn plural_categories_for_romance_languages() {
        assert_eq!(plural_category("fr", 0), "one");
        assert_eq!(plural_category("fr", 1), "one");
        assert_eq!(plural_category("fr", 2), "other");
        assert_eq!(plural_category("fr", 1_000_000), "many");
        assert_eq!(plural_category("es", 1_000_000), "many");
        assert_eq!(plural_category("es", 0), "other");
        assert_eq!(plural_category("it", 1), "one");
        assert_eq!(plural_category("pt-BR", 0), "one");
        assert_eq!(plural_category("pt", 0), "other");
        assert_eq!(plural_category("pt", 1), "one");
    }

    #[test]
    fn plural_categories_for_one_other_and_other_only_languages() {
        for locale in ["en", "de", "hu", "tr", "af"] {
            assert_eq!(plural_category(locale, 1), "one", "{locale}");
            assert_eq!(plural_category(locale, 0), "other", "{locale}");
            assert_eq!(plural_category(locale, 2), "other", "{locale}");
        }
        for locale in ["ja", "ko", "th", "id", "zh-CN", "zh-TW"] {
            assert_eq!(plural_category(locale, 1), "other", "{locale}");
        }
    }

    #[test]
    fn plural_lookup_picks_the_locale_category() {
        let all = catalogs_of(&[
            ("en", serde_json::json!({ "n_one": "{count} file", "n_other": "{count} files" })),
            (
                "ru",
                serde_json::json!({ "n_one": "{count} файл", "n_few": "{count} файла", "n_many": "{count} файлов", "n_other": "{count} файла" }),
            ),
        ]);
        assert_eq!(translate_plural_with(|c| all.get(c), "ru", "n", 3, &[]), "3 файла");
        assert_eq!(translate_plural_with(|c| all.get(c), "ru", "n", 5, &[]), "5 файлов");
        assert_eq!(translate_plural_with(|c| all.get(c), "en", "n", 1, &[]), "1 file");
        assert_eq!(translate_plural_with(|c| all.get(c), "en", "n", 4, &[]), "4 files");
    }

    #[test]
    fn plural_lookup_falls_back_to_other_then_to_english() {
        let all = catalogs_of(&[
            ("en", serde_json::json!({ "n_one": "{count} file", "n_other": "{count} files" })),
            ("pl", serde_json::json!({ "n_one": "", "n_few": "", "n_many": "", "n_other": "{count} plików" })),
            ("cs", serde_json::json!({ "n_one": "", "n_few": "", "n_other": "" })),
        ]);
        assert_eq!(translate_plural_with(|c| all.get(c), "pl", "n", 3, &[]), "3 plików");
        assert_eq!(translate_plural_with(|c| all.get(c), "cs", "n", 1, &[]), "1 file");
        assert_eq!(translate_plural_with(|c| all.get(c), "cs", "n", 3, &[]), "3 files");
    }

    #[test]
    fn plural_lookup_missing_key_returns_the_key() {
        assert_eq!(translate_plural_with(|_| None, "en", "n", 2, &[]), "n");
    }
}
