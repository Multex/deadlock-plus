use base64::Engine;

use super::code::*;
use super::wire::{Details, HeroBuild, ModCategory, ModEntry, WireError};

/// The user's own build, from the game's "Copy build to clipboard".
const SAMPLE: &str = include_str!("../tests/fixtures/build_code.txt");

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

fn frame(code: &str) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD.decode(code.trim()).unwrap()
}

/// (single segment, checksum, declared content size) from a zstd frame header (RFC 8878 3.1.1.1).
fn header(f: &[u8]) -> (bool, bool, Option<u64>) {
    let fhd = f[4];
    let single = fhd & 0x20 != 0;
    let dict_bytes = [0, 1, 2, 4][usize::from(fhd & 3)];
    let at = 5 + usize::from(!single) + dict_bytes;
    let le = |n: usize| f[at..at + n].iter().rev().fold(0u64, |v, &b| (v << 8) | u64::from(b));
    let size = match fhd >> 6 {
        0 if single => Some(le(1)),
        0 => None,
        1 => Some(le(2) + 256),
        2 => Some(le(4)),
        _ => Some(le(8)),
    };
    (single, fhd & 0x04 != 0, size)
}

fn local_build() -> HeroBuild {
    HeroBuild {
        hero_build_id: Some(60),
        hero_id: Some(2),
        author_account_id: Some(387_246_372),
        last_updated_timestamp: Some(1_792_000_000),
        name: Some("Mine".into()),
        description: Some("Notes".into()),
        language: Some(0),
        version: Some(0),
        origin_build_id: Some(398_750),
        details: Some(Details {
            mod_categories: vec![ModCategory {
                mods: vec![ModEntry { ability_id: Some(1_234), ..Default::default() }],
                name: Some("Early".into()),
                ..Default::default()
            }],
            ..Default::default()
        }),
        tags: vec![3],
        publish_timestamp: Some(1_791_000_000),
        ..Default::default()
    }
}

#[test]
fn the_games_code_decodes() {
    let build = decode_code(SAMPLE).unwrap();
    assert_eq!(build.hero_build_id, Some(60));
    assert_eq!(build.hero_id, Some(2));
    assert_eq!(build.author_account_id, Some(387_246_372));
    assert_eq!(build.name.as_deref(), Some("Copy of [FLINT SEVEN SOLVED - 21 OCTOBER]"));
    assert_eq!((build.language, build.version), (Some(0), Some(0)));
    assert!(build.origin_build_id.is_some());
    assert!(!build.details.unwrap().mod_categories.is_empty());
}

#[test]
fn the_games_build_re_encodes_byte_for_byte() {
    let raw = unpack(SAMPLE).unwrap();
    assert_eq!(raw.len(), 1370, "the frame header's content size");
    assert_eq!(HeroBuild::decode(&raw).unwrap().encode(), raw);
}

#[test]
fn an_encoded_build_decodes_to_itself() {
    let build = decode_code(SAMPLE).unwrap();
    assert_eq!(decode_code(&encode_code(&build)).unwrap(), build);
    assert_eq!(decode_code(&encode_code(&local_build())).unwrap(), local_build());
}

#[test]
fn the_code_is_one_standard_zstd_frame_shaped_like_the_games() {
    let build = local_build();
    let code = encode_code(&build);
    assert!(code.bytes().all(|b| b.is_ascii_alphanumeric() || b"+/=".contains(&b)), "{code}");
    assert_eq!(code.len() % 4, 0, "padded");
    let ours = frame(&code);
    let games = frame(SAMPLE);
    assert_eq!(ours[..4], ZSTD_MAGIC);
    // Single segment, no checksum, the content size declared: the shape of the game's own frame.
    assert_eq!(header(&games), (true, false, Some(1370)));
    assert_eq!(header(&ours), (true, false, Some(build.encode().len() as u64)));
    assert_eq!(unpack(&code).unwrap(), build.encode());
}

#[test]
fn whitespace_around_and_inside_the_code_is_ignored() {
    let wrapped = format!("  \r\n{}\n{}\t ", &SAMPLE.trim()[..40], &SAMPLE.trim()[40..]);
    assert_eq!(decode_code(&wrapped).unwrap(), decode_code(SAMPLE).unwrap());
}

#[test]
fn a_code_without_padding_still_decodes() {
    let build = HeroBuild { hero_id: Some(7), ..Default::default() };
    let code = (0..3)
        .map(|n| encode_code(&HeroBuild { name: Some("x".repeat(n)), ..build.clone() }))
        .find(|c| c.ends_with('='))
        .expect("one of three lengths needs padding");
    let decoded = decode_code(code.trim_end_matches('=')).unwrap();
    assert_eq!(decoded.hero_id, Some(7));
}

#[test]
fn bad_codes_say_which_layer_failed() {
    assert_eq!(decode_code(""), Err(CodeError::Empty));
    assert_eq!(decode_code(" \n "), Err(CodeError::Empty));
    assert_eq!(decode_code("not a build code!"), Err(CodeError::NotBase64));
    assert_eq!(decode_code("aGVsbG8gd29ybGQ="), Err(CodeError::NotZstd));
    let truncated = &SAMPLE.trim()[..400];
    assert_eq!(decode_code(truncated), Err(CodeError::NotZstd));
    assert_eq!(decode_code(&pack(&[0x08])), Err(CodeError::BadBuild(WireError::Truncated)));
    assert_eq!(decode_code(&pack(&[])), Err(CodeError::NoHero));
}

#[test]
fn a_code_that_unpacks_past_any_build_size_is_refused() {
    assert_eq!(decode_code(&pack(&vec![0; 2 << 20])), Err(CodeError::NotZstd));
}

#[test]
fn a_local_build_exports_as_the_game_copies_it() {
    let out = for_export(&local_build(), Some(11), 1_800_000_000);
    let expected =
        HeroBuild { author_account_id: Some(11), last_updated_timestamp: Some(1_800_000_000), ..local_build() };
    assert_eq!(out, expected);
}

#[test]
fn a_published_build_exports_as_a_local_copy_pointing_at_it() {
    let published = HeroBuild {
        hero_build_id: Some(446_250),
        version: Some(4),
        origin_build_id: Some(398_750),
        development_build: Some(false),
        ..local_build()
    };
    let out = for_export(&published, Some(11), 5);
    assert_eq!(out.hero_build_id, None);
    assert_eq!(out.origin_build_id, Some(446_250));
    assert_eq!(out.version, Some(0));
    assert_eq!((out.name, out.description, out.details), (published.name, published.description, published.details));
    assert_eq!((out.tags, out.publish_timestamp), (published.tags, published.publish_timestamp));
}

#[test]
fn an_export_without_a_known_account_keeps_the_builds_author() {
    assert_eq!(for_export(&local_build(), None, 5).author_account_id, Some(387_246_372));
}

#[test]
fn a_draft_with_no_id_exports_without_one() {
    let draft = HeroBuild { hero_build_id: Some(0), origin_build_id: None, ..local_build() };
    let out = for_export(&draft, Some(11), 5);
    assert_eq!((out.hero_build_id, out.origin_build_id), (None, None));
}
