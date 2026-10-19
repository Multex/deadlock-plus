use deadlock_replay::{decompress_capped, meta, Error};
use serde_json::Value;

use crate::detail_json;

pub use deadlock_reader::replay_meta_url;
pub use deadlock_replay::DEFAULT_MAX_DECOMPRESSED as MAX_META_BYTES;

/// A `.meta.bz2` off Valve's replay CDN as the same API-shaped JSON `detail_json` gives for a capture.
/// Decompression stops at `cap` bytes.
pub fn meta_detail(payload: &[u8], cap: usize) -> Result<Value, Error> {
    let wrapper = meta::parse(&decompress_capped(payload, cap)?)?;
    Ok(detail_json(&meta::contents(&wrapper)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `deadlock-replay`'s own fixture: a `CMsgMatchMetaData` for match 42,000,000, one 1,800 s match with one
    /// player, under bzip2.
    const FIXTURE_BZ2: &[u8] = &[
        0x42, 0x5a, 0x68, 0x39, 0x31, 0x41, 0x59, 0x26, 0x53, 0x59, 0xa6, 0xc6, 0xc1, 0xa8, 0x00, 0x00, 0x06, 0x7d,
        0x7b, 0xbc, 0xe1, 0xdc, 0x40, 0x10, 0x15, 0x40, 0x10, 0x41, 0x00, 0x40, 0x00, 0x48, 0x40, 0x02, 0x50, 0x00,
        0x40, 0x40, 0x02, 0x40, 0x00, 0x00, 0x00, 0x84, 0x10, 0x20, 0x00, 0x50, 0xc3, 0x04, 0xc0, 0x98, 0x08, 0x68,
        0xc9, 0xa6, 0x04, 0x50, 0x03, 0x10, 0x1a, 0x06, 0x4f, 0x29, 0xe9, 0x3d, 0x35, 0x2d, 0x7a, 0xa7, 0xde, 0x11,
        0xea, 0xb8, 0x8f, 0x31, 0x83, 0x59, 0xe9, 0x13, 0xc8, 0xc1, 0xac, 0x8e, 0x42, 0x10, 0x15, 0x6c, 0xc8, 0xe4,
        0x4a, 0x0e, 0x30, 0x49, 0xa3, 0xa9, 0x90, 0x4d, 0x6b, 0x0f, 0xc5, 0xdc, 0x91, 0x4e, 0x14, 0x24, 0x29, 0xb1,
        0xb0, 0x6a, 0x00,
    ];

    #[test]
    fn a_cdn_file_reads_as_the_match_with_its_players() {
        let json = meta_detail(FIXTURE_BZ2, MAX_META_BYTES).unwrap();
        let info = &json["match_info"];
        assert_eq!(info["match_id"], 42_000_000);
        assert_eq!(info["duration_s"], 1_800);
        let players = info["players"].as_array().unwrap();
        assert_eq!(players.len(), 1);
        assert_eq!(players[0]["account_id"], 123_456_789);
        assert_eq!(players[0]["team"], 1);
    }

    #[test]
    fn a_cdn_file_gives_exactly_what_a_capture_of_the_same_match_gives() {
        let wrapper = deadlock_replay::meta::from_bz2(FIXTURE_BZ2).unwrap();
        let contents = deadlock_replay::meta::contents(&wrapper).unwrap();
        assert_eq!(meta_detail(FIXTURE_BZ2, MAX_META_BYTES).unwrap(), detail_json(&contents));
    }

    #[test]
    fn a_file_that_decompresses_past_the_cap_is_refused() {
        let err = meta_detail(FIXTURE_BZ2, 16).unwrap_err();
        assert_eq!(err, Error::TooLarge { cap: 16 });
    }

    #[test]
    fn something_that_is_not_bzip2_is_refused() {
        let err = meta_detail(b"<html>404 Not Found</html>", MAX_META_BYTES).unwrap_err();
        assert_eq!(err, Error::NotBzip2);
    }

    #[test]
    fn a_cut_short_file_is_refused() {
        assert!(meta_detail(&FIXTURE_BZ2[..40], MAX_META_BYTES).is_err());
    }
}
