use base64::engine::general_purpose::STANDARD_PAD_INDIFFERENT as BASE64;
use base64::Engine;

use crate::file::LOCAL_ID_LIMIT;
use crate::wire::{HeroBuild, WireError};

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

/// Far above any real build (the game's own are ~1.5 KB); caps what a forged size header can make us allocate.
const MAX_BUILD_BYTES: usize = 1 << 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodeError {
    Empty,
    NotBase64,
    NotZstd,
    BadBuild(WireError),
    NoHero,
}

impl std::fmt::Display for CodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CodeError::Empty => write!(f, "the build code is empty"),
            CodeError::NotBase64 => write!(f, "the build code is not base64"),
            CodeError::NotZstd => write!(f, "the build code is not one zstd frame of a build"),
            CodeError::BadBuild(e) => write!(f, "the build code holds no valid build: {e}"),
            CodeError::NoHero => write!(f, "the build code's build has no hero"),
        }
    }
}

impl std::error::Error for CodeError {}

/// Reads a code from the game's "Copy build to clipboard": base64 of one zstd frame of a raw
/// `CMsgHeroBuild`. Whitespace anywhere is ignored (chat apps wrap long codes), and padding is optional.
pub fn decode_code(code: &str) -> Result<HeroBuild, CodeError> {
    let raw = unpack(code)?;
    let build = HeroBuild::decode(&raw).map_err(CodeError::BadBuild)?;
    if build.hero_id.is_none() {
        return Err(CodeError::NoHero);
    }
    Ok(build)
}

/// The code the game's "Create New Build" accepts for `build`.
#[must_use]
pub fn encode_code(build: &HeroBuild) -> String {
    pack(&build.encode())
}

/// `build` in the shape the game copies a local build: a local id kept (a GC id becomes the origin
/// and the id is dropped, as `copy_as_new` does), version 0, the exporting account as author, and
/// the time of export. Name, description, contents, tags and unknown fields stay.
#[must_use]
pub fn for_export(build: &HeroBuild, author_account_id: Option<u32>, now_unix: u32) -> HeroBuild {
    let id = build.hero_build_id.filter(|&id| id != 0);
    let (local_id, origin_build_id) = match id {
        Some(gc) if gc >= LOCAL_ID_LIMIT => (None, Some(gc)),
        local => (local, build.origin_build_id),
    };
    HeroBuild {
        hero_build_id: local_id,
        author_account_id: author_account_id.or(build.author_account_id),
        last_updated_timestamp: Some(now_unix),
        version: Some(0),
        origin_build_id,
        ..build.clone()
    }
}

pub(crate) fn unpack(code: &str) -> Result<Vec<u8>, CodeError> {
    let text: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    if text.is_empty() {
        return Err(CodeError::Empty);
    }
    let frame = BASE64.decode(text).map_err(|_| CodeError::NotBase64)?;
    if frame.get(..4) != Some(&ZSTD_MAGIC) {
        return Err(CodeError::NotZstd);
    }
    let mut raw = Vec::new();
    zstd_rs::Decompressor::new().decompress(&frame, None, MAX_BUILD_BYTES, &mut raw).map_err(|_| CodeError::NotZstd)?;
    Ok(raw)
}

pub(crate) fn pack(raw: &[u8]) -> String {
    // The game's codes are reference zstd at level 19: single segment, content size, no checksum.
    let mut frame = Vec::new();
    let compressed =
        zstd_rs::Compressor::new(zstd_rs::CompressionConfig::HIGH).and_then(|mut c| c.compress(raw, None, &mut frame));
    if let Err(e) = compressed {
        unreachable!("a built-in zstd config is valid: {e}");
    }
    BASE64.encode(frame)
}
