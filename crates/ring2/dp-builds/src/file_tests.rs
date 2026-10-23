use source2_kv3::{Compression, Document, Header, Object, Value, Version, GENERIC_FORMAT};

use crate::file::{peek_build_id, BuildsFile, FileError, Section, LOCAL_ID_LIMIT};

const CUSTOM_FORMAT: [u8; 16] =
    [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x01];

fn varint(mut v: u64, out: &mut Vec<u8>) {
    while v >= 0x80 {
        out.push((v as u8) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

/// A `HeroBuildResult`: field 1 `CMsgHeroBuild { 1: hero_build_id, 5: name }`, then 3 num_favorites.
fn blob(id: u32, name: &str) -> Vec<u8> {
    let mut inner = vec![0x08];
    varint(u64::from(id), &mut inner);
    inner.push(0x2a);
    varint(name.len() as u64, &mut inner);
    inner.extend_from_slice(name.as_bytes());
    let mut out = vec![0x0a];
    varint(inner.len() as u64, &mut out);
    out.extend(inner);
    out.extend([0x18, 0x00]);
    out
}

fn blobs(items: &[(u32, &str)]) -> Value {
    Value::array(items.iter().map(|&(id, name)| Value::blob(blob(id, name))).collect())
}

fn root_with(favorites: &[(u32, &str)], unpublished: &[(u32, &str)], saved: &[(u32, &str)]) -> Object {
    let mut last = Object::new();
    last.insert("hero_astro", 57u32);
    last.insert("hero_inferno", 1040u32);
    let mut root = Object::new();
    root.insert("LastUsedBuilds", last);
    root.insert("Favorites", blobs(favorites));
    root.insert("Unpublished", blobs(unpublished));
    root.insert("SavedLastUsed", blobs(saved));
    root
}

fn fixture_root() -> Object {
    root_with(&[(12, "own fav"), (283_398, "public fav")], &[(57, "a"), (59, "b")], &[(916_319, "published")])
}

fn binary(root: Object, compression: Compression, format: [u8; 16]) -> Vec<u8> {
    let mut doc = Document::new(root);
    doc.options.compression = compression;
    doc.options.format = format;
    doc.to_bytes().unwrap()
}

fn file_from(root: Object) -> BuildsFile {
    BuildsFile::parse(&binary(root, Compression::Zstd, GENERIC_FORMAT)).unwrap()
}

fn ids(file: &BuildsFile, section: Section) -> Vec<Option<u32>> {
    file.entries(section).into_iter().map(peek_build_id).collect()
}

fn reparse(file: &BuildsFile) -> Document {
    Document::from_bytes(&file.to_bytes().unwrap()).unwrap()
}

fn root_keys(doc: &Document) -> Vec<String> {
    doc.root.as_object().unwrap().keys().map(str::to_owned).collect()
}

#[test]
fn unknown_root_keys_and_key_order_survive_an_edit() {
    let mut root = Object::new();
    for (k, v) in fixture_root().iter() {
        root.push(k, v.clone());
        if k == "Favorites" {
            root.push("Mystery", "keep me");
        }
    }
    let mut file = file_from(root);
    file.upsert_sorted(Section::Unpublished, blob(58, "new")).unwrap();

    let doc = reparse(&file);
    assert_eq!(root_keys(&doc), ["LastUsedBuilds", "Favorites", "Mystery", "Unpublished", "SavedLastUsed"]);
    assert_eq!(doc.root.get("Mystery").and_then(Value::as_str), Some("keep me"));
}

#[test]
fn untouched_blobs_stay_byte_equal() {
    let mut odd = blob(283_398, "public fav");
    odd.push(0xff);
    let mut root = fixture_root();
    root.insert("Favorites", Value::array(vec![Value::blob(blob(12, "own fav")), Value::blob(odd.clone())]));
    let mut file = file_from(root);
    file.upsert_sorted(Section::Unpublished, blob(60, "new")).unwrap();

    let again = BuildsFile::parse(&file.to_bytes().unwrap()).unwrap();
    assert_eq!(again.entries(Section::Favorites), [blob(12, "own fav").as_slice(), odd.as_slice()]);
    assert_eq!(again.entries(Section::SavedLastUsed), [blob(916_319, "published").as_slice()]);
    assert_eq!(
        again.entries(Section::Unpublished),
        [blob(57, "a").as_slice(), blob(59, "b").as_slice(), blob(60, "new").as_slice()]
    );
}

#[test]
fn last_used_values_that_point_at_nothing_are_kept() {
    let mut file = file_from(fixture_root());
    file.set_last_used("hero_astro", 60);

    let again = BuildsFile::parse(&file.to_bytes().unwrap()).unwrap();
    assert_eq!(again.last_used("hero_inferno"), Some(1040));
    assert_eq!(again.last_used("hero_astro"), Some(60));
    assert_eq!(again.last_used("hero_missing"), None);
}

#[test]
fn set_last_used_keeps_key_order_and_appends_new_heroes() {
    let mut file = file_from(fixture_root());
    file.set_last_used("hero_astro", 61);
    file.set_last_used("hero_wraith", 62);

    let doc = reparse(&file);
    let last = doc.root.get("LastUsedBuilds").and_then(Value::as_object).unwrap();
    let pairs: Vec<_> = last.iter().map(|(k, v)| (k.to_owned(), v.as_u32())).collect();
    assert_eq!(
        pairs,
        [
            ("hero_astro".to_owned(), Some(61)),
            ("hero_inferno".to_owned(), Some(1040)),
            ("hero_wraith".to_owned(), Some(62))
        ]
    );
}

#[test]
fn text_input_is_written_as_v5_zstd_binary() {
    let mut doc = Document::new(fixture_root());
    doc.options.format = CUSTOM_FORMAT;
    let text = format!("\u{feff}{}", doc.to_text().unwrap());

    let file = BuildsFile::parse(text.as_bytes()).unwrap();
    assert_eq!(ids(&file, Section::Unpublished), [Some(57), Some(59)]);
    let out = file.to_bytes().unwrap();
    let header = Header::parse(&out).unwrap();
    assert_eq!(header.version, Version::V5);
    assert_eq!(header.compression, Compression::Zstd);
    assert_eq!(header.format, CUSTOM_FORMAT);
    assert_eq!(BuildsFile::parse(&out).unwrap().entries(Section::Favorites), file.entries(Section::Favorites));
}

#[test]
fn every_binary_compression_is_written_as_zstd_with_its_format_kept() {
    for compression in [Compression::None, Compression::Lz4, Compression::Zstd] {
        let file = BuildsFile::parse(&binary(fixture_root(), compression, CUSTOM_FORMAT)).unwrap();
        let header = Header::parse(&file.to_bytes().unwrap()).unwrap();
        assert_eq!(
            (header.version, header.compression, header.format),
            (Version::V5, Compression::Zstd, CUSTOM_FORMAT)
        );
        assert_eq!(ids(&file, Section::Unpublished), [Some(57), Some(59)]);
    }
}

#[test]
fn next_local_id_is_one_above_the_highest_local_id() {
    let file = file_from(root_with(&[], &[(57, "a"), (59, "b")], &[]));
    assert_eq!(file.next_local_id(), Some(60));
}

#[test]
fn next_local_id_ignores_ids_at_or_above_the_limit() {
    let file = file_from(root_with(&[(LOCAL_ID_LIMIT, "gc")], &[(57, "a"), (1_500, "gc")], &[]));
    assert_eq!(file.next_local_id(), Some(58));
}

#[test]
fn next_local_id_counts_favorites_but_not_saved_last_used() {
    let file = file_from(root_with(&[(70, "own fav")], &[(57, "a")], &[(80, "saved")]));
    assert_eq!(file.next_local_id(), Some(71));
}

#[test]
fn next_local_id_starts_at_one() {
    let file = file_from(root_with(&[], &[], &[(916_319, "published")]));
    assert_eq!(file.next_local_id(), Some(1));
}

#[test]
fn next_local_id_is_none_when_the_local_range_is_full() {
    let file = file_from(root_with(&[], &[(LOCAL_ID_LIMIT - 1, "last")], &[]));
    assert_eq!(file.next_local_id(), None);
}

#[test]
fn upsert_inserts_in_id_order() {
    let mut file = file_from(fixture_root());
    for id in [58, 1, 700] {
        file.upsert_sorted(Section::Unpublished, blob(id, "new")).unwrap();
    }
    assert_eq!(ids(&file, Section::Unpublished), [Some(1), Some(57), Some(58), Some(59), Some(700)]);
    assert_eq!(file.get(Section::Unpublished, 58), Some(blob(58, "new").as_slice()));
}

#[test]
fn upsert_replaces_an_existing_id_in_place() {
    let mut file = file_from(fixture_root());
    file.upsert_sorted(Section::Unpublished, blob(57, "edited")).unwrap();
    assert_eq!(file.entries(Section::Unpublished), [blob(57, "edited").as_slice(), blob(59, "b").as_slice()]);
    assert_eq!(file.entries(Section::Favorites).len(), 2);
}

#[test]
fn upsert_refuses_a_blob_without_an_id() {
    let mut file = file_from(fixture_root());
    assert!(matches!(file.upsert_sorted(Section::Unpublished, vec![0x18, 0x00]), Err(FileError::NoBuildId)));
    assert_eq!(file.entries(Section::Unpublished).len(), 2);
}

#[test]
fn remove_drops_only_the_matching_build() {
    let mut file = file_from(fixture_root());
    assert!(file.remove(Section::Unpublished, 57));
    assert!(!file.remove(Section::Unpublished, 57));
    assert!(!file.remove(Section::Unpublished, 12));
    assert_eq!(ids(&file, Section::Unpublished), [Some(59)]);
    assert_eq!(ids(&file, Section::Favorites), [Some(12), Some(283_398)]);
    assert_eq!(file.get(Section::Unpublished, 57), None);
}

#[test]
fn empty_has_the_game_shape_and_round_trips() {
    let file = BuildsFile::empty();
    let out = file.to_bytes().unwrap();
    let header = Header::parse(&out).unwrap();
    assert_eq!((header.version, header.compression, header.format), (Version::V5, Compression::Zstd, GENERIC_FORMAT));

    let doc = Document::from_bytes(&out).unwrap();
    assert_eq!(root_keys(&doc), ["LastUsedBuilds", "Favorites", "Unpublished", "SavedLastUsed"]);
    assert!(doc.root.get("LastUsedBuilds").and_then(Value::as_object).is_some_and(Object::is_empty));
    for section in Section::ALL {
        assert_eq!(doc.root.get(section.key()).and_then(Value::as_array).map(<[Value]>::len), Some(0));
    }

    let mut again = BuildsFile::parse(&out).unwrap();
    assert_eq!(again.next_local_id(), Some(1));
    again.upsert_sorted(Section::Unpublished, blob(1, "first")).unwrap();
    again.set_last_used("hero_astro", 1);
    let again = BuildsFile::parse(&again.to_bytes().unwrap()).unwrap();
    assert_eq!(again.get(Section::Unpublished, 1), Some(blob(1, "first").as_slice()));
    assert_eq!(again.last_used("hero_astro"), Some(1));
}

#[test]
fn peek_reads_the_id_of_a_well_formed_blob() {
    assert_eq!(peek_build_id(&blob(283_398, "x")), Some(283_398));
    let mut undecodable = blob(57, "x");
    undecodable.extend([0x0f, 0xff]);
    assert_eq!(peek_build_id(&undecodable), Some(57));
}

#[test]
fn peek_returns_none_on_truncated_or_foreign_blobs() {
    let full = blob(283_398, "a long enough name");
    for len in 0..full.len() - 2 {
        assert_eq!(peek_build_id(&full[..len]), None, "prefix of {len} bytes");
    }
    assert_eq!(peek_build_id(&[0x18, 0x00]), None);
    assert_eq!(peek_build_id(&[0x0a, 0x02, 0x10, 0x05]), None);
    assert_eq!(peek_build_id(&[0xff; 12]), None);
    assert_eq!(peek_build_id(&[0x0a, 0x0b, 0x08, 0xff, 0xff, 0xff, 0xff, 0x7f, 0, 0, 0, 0, 0]), None);
}

#[test]
fn parse_rejects_bad_input_with_typed_errors() {
    assert!(matches!(BuildsFile::parse(b"not kv3 at all"), Err(FileError::Kv3(_))));
    assert!(matches!(BuildsFile::parse(b"<!-- \xff\xfe"), Err(FileError::NotUtf8)));

    let array_root = Document::new(Value::array(vec![])).to_bytes().unwrap();
    assert!(matches!(BuildsFile::parse(&array_root), Err(FileError::RootNotObject)));

    let mut bad = fixture_root();
    bad.insert("Favorites", "nope");
    assert!(matches!(
        BuildsFile::parse(&binary(bad, Compression::Zstd, GENERIC_FORMAT)),
        Err(FileError::WrongType { key: "Favorites" })
    ));

    let mut bad = fixture_root();
    bad.insert("LastUsedBuilds", 3u32);
    assert!(matches!(
        BuildsFile::parse(&binary(bad, Compression::Zstd, GENERIC_FORMAT)),
        Err(FileError::WrongType { key: "LastUsedBuilds" })
    ));
}

/// Runs only when `DP_BUILDS_SAMPLES` names a directory of real `cached_hero_builds.kv3` copies.
#[test]
fn sample_files_round_trip_blob_for_blob() {
    let Some(dir) = std::env::var_os("DP_BUILDS_SAMPLES") else { return };
    let mut checked = 0;
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|e| e != "kv3") {
            continue;
        }
        let bytes = std::fs::read(&path).unwrap();
        let file = BuildsFile::parse(&bytes).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        let out = file.to_bytes().unwrap();
        let again = BuildsFile::parse(&out).unwrap();
        for section in Section::ALL {
            assert_eq!(again.entries(section), file.entries(section), "{} {section:?}", path.display());
        }
        let (before, after) = (Document::from_bytes(&bytes).ok(), Document::from_bytes(&out).unwrap());
        if let Some(before) = before {
            assert_eq!(after.root, before.root, "{}", path.display());
        }
        checked += 1;
    }
    eprintln!("checked {checked} sample files");
    assert!(checked > 0);
}

/// Runs only when `DP_BUILDS_SAMPLES` names a directory of real `cached_hero_builds.kv3` copies.
#[test]
fn sample_blobs_decode_and_encode_byte_for_byte() {
    let Some(dir) = std::env::var_os("DP_BUILDS_SAMPLES") else { return };
    let mut checked = 0;
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|e| e != "kv3") {
            continue;
        }
        let file = BuildsFile::parse(&std::fs::read(&path).unwrap()).unwrap();
        for section in Section::ALL {
            for blob in file.entries(section) {
                let decoded = crate::wire::HeroBuildResult::decode(blob)
                    .unwrap_or_else(|e| panic!("{} {section:?}: {e}", path.display()));
                assert_eq!(decoded.encode(), blob, "{} {section:?}", path.display());
                checked += 1;
            }
        }
    }
    eprintln!("checked {checked} sample blobs");
    assert!(checked > 0);
}
