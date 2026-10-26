use std::path::Path;

use deadlock_data::vdata::ARCHIVE;
use source2::resource::Resource;
use source2::vpk::{Error as VpkError, Vpk};

/// A music track the Dispatch video may play, and the `.vsnd_c` layers that make it up. The frontend mixes the
/// layers; only these paths are ever read, so the frontend never names a file in the archive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MusicTrack {
    pub id: &'static str,
    pub layers: &'static [&'static str],
}

pub const MUSIC_TRACKS: [MusicTrack; 4] = [
    MusicTrack { id: "postgame", layers: &["sounds/music/music_postgame_155bpm.vsnd_c"] },
    MusicTrack {
        id: "title",
        layers: &["sounds/music/music_title_155bpm.vsnd_c", "sounds/music/music_title_fx_155bpm.vsnd_c"],
    },
    MusicTrack {
        id: "koth",
        layers: &[
            "sounds/music/music_koth_capture_160bpm.vsnd_c",
            "sounds/music/music_koth_capture_contest_160bpm.vsnd_c",
            "sounds/music/music_koth_capture_block_160bpm.vsnd_c",
        ],
    },
    MusicTrack { id: "menu", layers: &["sounds/music/music_menu_lp.vsnd_c"] },
];

pub fn music_track(id: &str) -> Option<&'static MusicTrack> {
    MUSIC_TRACKS.iter().find(|t| t.id == id)
}

fn is_mp3_start(bytes: &[u8]) -> bool {
    bytes.starts_with(b"ID3") || (bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] & 0xE0 == 0xE0)
}

/// The MP3 stream a compiled `.vsnd_c` carries after its resource blocks, outside the resource's own size field.
pub fn embedded_mp3(vsnd_c: &[u8]) -> Result<Vec<u8>, String> {
    let audio = Resource::parse(vsnd_c).map_err(|e| e.to_string())?.trailing;
    if audio.is_empty() {
        return Err("no audio after the resource blocks".into());
    }
    if !is_mp3_start(&audio) {
        return Err(format!(
            "audio after the resource blocks is not MP3 (starts {:02X?})",
            &audio[..audio.len().min(4)]
        ));
    }
    Ok(audio)
}

/// One layer of a whitelisted track as MP3 bytes. `None` when there is no install, or the archive or the file is
/// missing from it: the export then goes silent.
pub fn read_music_layer(citadel_dir: Option<&Path>, id: &str, layer: usize) -> Result<Option<Vec<u8>>, String> {
    let track = music_track(id).ok_or_else(|| format!("unknown music track {id:?}"))?;
    let path = track.layers.get(layer).ok_or_else(|| format!("music track {id} has no layer {layer}"))?;
    let Some(archive) = citadel_dir.map(|d| d.join(ARCHIVE)).filter(|a| a.is_file()) else { return Ok(None) };
    let vpk = Vpk::open(&archive).map_err(|e| format!("{}: {e}", archive.display()))?;
    match vpk.read_path(path) {
        Ok(bytes) => embedded_mp3(&bytes).map(Some).map_err(|e| format!("{path}: {e}")),
        Err(VpkError::NotFound(_)) => Ok(None),
        Err(e) => Err(format!("{path}: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::catalog::{Install, SteamInstall};

    const MP3: [u8; 8] = [0xFF, 0xFB, 0x90, 0x64, 1, 2, 3, 4];

    /// A compiled resource laid out as a real `.vsnd_c`: header, one-entry block table, a DATA block, then `tail`.
    fn vsnd_c(tail: &[u8]) -> Vec<u8> {
        let block = b"kv3-ish data block bytes";
        let table_start = 16u32;
        let block_start = table_start + 12;
        let end = block_start + block.len() as u32;
        let mut out = Vec::new();
        out.extend_from_slice(&end.to_le_bytes());
        out.extend_from_slice(&12u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&8u32.to_le_bytes());
        out.extend_from_slice(&1u32.to_le_bytes());
        out.extend_from_slice(b"DATA");
        out.extend_from_slice(&(block_start - (table_start + 4)).to_le_bytes());
        out.extend_from_slice(&(block.len() as u32).to_le_bytes());
        out.extend_from_slice(block);
        out.extend_from_slice(tail);
        out
    }

    #[test]
    fn the_mp3_after_the_resource_blocks_is_returned() {
        assert_eq!(embedded_mp3(&vsnd_c(&MP3)).unwrap(), MP3);
    }

    #[test]
    fn an_mp3_with_an_id3_tag_is_returned_whole() {
        let tagged = [b"ID3".as_slice(), &[4, 0, 0, 0, 0, 0, 0], &MP3].concat();
        assert_eq!(embedded_mp3(&vsnd_c(&tagged)).unwrap(), tagged);
    }

    #[test]
    fn a_resource_with_nothing_after_its_blocks_is_an_error() {
        assert!(embedded_mp3(&vsnd_c(&[])).unwrap_err().contains("no audio"));
    }

    #[test]
    fn bytes_after_the_blocks_that_are_not_mp3_are_an_error() {
        assert!(embedded_mp3(&vsnd_c(b"RIFF....WAVE")).unwrap_err().contains("not MP3"));
    }

    #[test]
    fn a_file_that_is_not_a_resource_is_an_error() {
        assert!(embedded_mp3(&MP3).is_err());
    }

    #[test]
    fn each_track_is_found_by_id_and_names_only_music_files() {
        for track in &MUSIC_TRACKS {
            assert_eq!(music_track(track.id), Some(track));
            assert!(!track.layers.is_empty());
            for path in track.layers {
                assert!(path.starts_with("sounds/music/") && path.ends_with(".vsnd_c"), "{path}");
            }
        }
        assert_eq!(music_track("koth").map(|t| t.layers.len()), Some(3));
        assert_eq!(music_track("sounds/music/music_menu_lp.vsnd_c"), None);
    }

    #[test]
    fn an_unknown_track_or_layer_is_refused_before_any_read() {
        let dir = PathBuf::from("does-not-exist");
        assert!(read_music_layer(Some(&dir), "../../pak01_dir", 0).unwrap_err().contains("unknown music track"));
        assert!(read_music_layer(Some(&dir), "koth", 3).unwrap_err().contains("no layer 3"));
    }

    #[test]
    fn no_install_or_no_archive_reads_as_no_music() {
        assert_eq!(read_music_layer(None, "postgame", 0), Ok(None));
        let dir = std::env::temp_dir().join(format!("dp-gamedata-music-missing-{}", std::process::id()));
        assert_eq!(read_music_layer(Some(&dir), "postgame", 0), Ok(None));
    }

    /// Reads every layer from the installed game. With `DP_MUSIC_DUMP` set, writes each as `<id>-<layer>.mp3`
    /// there for a look with ffprobe.
    #[test]
    #[ignore = "reads the installed game"]
    fn every_layer_reads_as_mp3_from_the_installed_game() {
        let dir = std::env::var_os("DEADLOCK_CITADEL_DIR").map(PathBuf::from).or_else(|| SteamInstall.citadel_dir());
        let Some(dir) = dir.filter(|d| d.join(ARCHIVE).is_file()) else {
            eprintln!("skipped: no installed Deadlock");
            return;
        };
        let dump = std::env::var_os("DP_MUSIC_DUMP").map(PathBuf::from);
        for track in &MUSIC_TRACKS {
            for layer in 0..track.layers.len() {
                let mp3 = read_music_layer(Some(&dir), track.id, layer).unwrap().expect("layer is in the archive");
                assert!(mp3.len() > 100_000, "{} layer {layer}: {} bytes", track.id, mp3.len());
                assert_eq!(mp3[0], 0xFF, "{} layer {layer}", track.id);
                assert_eq!(mp3[1] & 0xE0, 0xE0, "{} layer {layer}", track.id);
                if let Some(dump) = &dump {
                    std::fs::write(dump.join(format!("{}-{layer}.mp3", track.id)), &mp3).unwrap();
                }
            }
        }
    }
}
