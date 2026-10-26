use source2::ext::ResourceTexture;
use source2::resource::Resource;

/// Turns one compiled Panorama image (`.vtex_c` or `.vsvg_c`) into the bytes of a file a browser can show:
/// PNG for a texture, the SVG source for a vector image.
pub(crate) fn browser_image(compiled_path: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let resource = Resource::parse(bytes).map_err(|e| format!("{compiled_path}: {e}"))?;
    if is_vector(compiled_path) {
        let data = resource.data().ok_or_else(|| format!("{compiled_path}: no DATA block"))?;
        return svg_source(data).map(<[u8]>::to_vec).ok_or_else(|| format!("{compiled_path}: no SVG source"));
    }
    decoded_image(compiled_path, bytes)?.to_png().map_err(|e| format!("{compiled_path}: {e}"))
}

/// The top mip of a compiled texture as 8-bit RGBA.
pub(crate) fn decoded_image(compiled_path: &str, bytes: &[u8]) -> Result<deadlock_data::art::Image, String> {
    let resource = Resource::parse(bytes).map_err(|e| format!("{compiled_path}: {e}"))?;
    let image = resource.decode_texture_rgba8(0).map_err(|e| format!("{compiled_path}: {e}"))?;
    Ok(deadlock_data::art::Image { width: image.width, height: image.height, rgba: image.rgba })
}

/// Whether the compiled image is a vector one, which is stored as `.svg`.
pub(crate) fn is_vector(compiled_path: &str) -> bool {
    compiled_path.ends_with(".vsvg_c")
}

/// The CSS source of a compiled Panorama stylesheet (`.vcss_c`).
pub(crate) fn stylesheet(compiled_path: &str, bytes: &[u8]) -> Result<String, String> {
    let resource = Resource::parse(bytes).map_err(|e| format!("{compiled_path}: {e}"))?;
    let data = resource.data().ok_or_else(|| format!("{compiled_path}: no DATA block"))?;
    let source = source_text(data).ok_or_else(|| format!("{compiled_path}: no stylesheet source"))?;
    String::from_utf8(source.to_vec()).map_err(|e| format!("{compiled_path}: {e}"))
}

fn svg_source(data: &[u8]) -> Option<&[u8]> {
    let source = source_text(data)?;
    let text = source.trim_ascii_start();
    (text.starts_with(b"<svg") || text.starts_with(b"<?xml")).then_some(source)
}

/// A `.vsvg_c` or `.vcss_c` `DATA` block is a `u32` CRC, a `u16` count of referenced files (each a
/// NUL-terminated name and two `u32`s), then the source verbatim.
fn source_text(data: &[u8]) -> Option<&[u8]> {
    let count = u16::from_le_bytes(data.get(4..6)?.try_into().ok()?);
    let mut at = 6;
    for _ in 0..count {
        at += data.get(at..)?.iter().position(|&b| b == 0)? + 1 + 8;
    }
    let source = data.get(at..)?;
    let end = source.iter().rposition(|&b| b != 0).map_or(0, |i| i + 1);
    Some(&source[..end])
}

#[cfg(test)]
pub(crate) mod tests {
    use source2::resource::{Block, BlockKind, Resource};

    use super::*;

    const FORMAT_BGRA8888: u8 = 28;

    const SVG: &str =
        "<svg width=\"2\" height=\"2\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0H2V2Z\"/></svg>\n";

    /// A compiled `.vsvg_c` as the game ships it: `DATA` holds a CRC, a count of named references
    /// (each a NUL-terminated name and two `u32`s), then the SVG source.
    pub(crate) fn vsvg(references: &[&str], svg: &str) -> Vec<u8> {
        let mut data = 0xDEAD_BEEFu32.to_le_bytes().to_vec();
        data.extend_from_slice(&u16::try_from(references.len()).unwrap().to_le_bytes());
        for name in references {
            data.extend_from_slice(name.as_bytes());
            data.push(0);
            data.extend_from_slice(&[0; 8]);
        }
        data.extend_from_slice(svg.as_bytes());
        Resource::new().with_block(Block::new(BlockKind::DATA, data)).to_bytes().unwrap()
    }

    /// A 2x2 uncompressed BGRA texture, the smallest `.vtex_c` the decoder reads.
    pub(crate) fn vtex_2x2() -> Vec<u8> {
        let mut head = Vec::new();
        head.extend_from_slice(&1u16.to_le_bytes());
        head.extend_from_slice(&0u16.to_le_bytes());
        for r in [0.0f32; 4] {
            head.extend_from_slice(&r.to_le_bytes());
        }
        head.extend_from_slice(&2u16.to_le_bytes());
        head.extend_from_slice(&2u16.to_le_bytes());
        head.extend_from_slice(&1u16.to_le_bytes());
        head.push(FORMAT_BGRA8888);
        head.push(1);
        head.extend_from_slice(&0u32.to_le_bytes());
        head.extend_from_slice(&8u32.to_le_bytes());
        head.extend_from_slice(&0u32.to_le_bytes());
        let pixels = vec![10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 0, 100, 110, 120, 7];
        Resource::new().with_block(Block::new(BlockKind::DATA, head)).with_trailing(pixels).to_bytes().unwrap()
    }

    fn png_size(bytes: &[u8]) -> (u32, u32) {
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n", "a PNG signature");
        assert_eq!(&bytes[12..16], b"IHDR");
        let be = |at: usize| u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap());
        (be(16), be(20))
    }

    #[test]
    fn a_vector_image_becomes_its_svg_source() {
        let out = browser_image("panorama/images/shop/tier_corner_cap.vsvg_c", &vsvg(&[], SVG)).unwrap();
        assert_eq!(String::from_utf8(out).unwrap(), SVG);
    }

    #[test]
    fn named_references_before_the_svg_are_skipped() {
        let compiled = vsvg(&["panorama/images/a.vtex", "b"], SVG);
        let out = browser_image("panorama/images/builds/x.vsvg_c", &compiled).unwrap();
        assert_eq!(String::from_utf8(out).unwrap(), SVG);
    }

    #[test]
    fn a_vector_image_without_svg_source_is_an_error() {
        let compiled = vsvg(&[], "not an svg");
        assert!(browser_image("panorama/images/x.vsvg_c", &compiled).is_err());
        assert!(browser_image("panorama/images/x.vsvg_c", b"garbage").is_err());
    }

    #[test]
    fn a_texture_becomes_a_png_of_its_size() {
        let out = browser_image("panorama/images/shop/card_backer_psd.vtex_c", &vtex_2x2()).unwrap();
        assert_eq!(png_size(&out), (2, 2));
    }

    #[test]
    fn an_undecodable_texture_is_an_error() {
        assert!(browser_image("panorama/images/x_psd.vtex_c", b"garbage").is_err());
        assert!(browser_image("panorama/images/x_psd.vtex_c", &vsvg(&[], SVG)).is_err());
    }

    #[test]
    fn vector_images_are_told_apart_by_their_compiled_extension() {
        assert!(is_vector("panorama/images/shop/tier_corner_cap.vsvg_c"));
        assert!(!is_vector("panorama/images/shop/card_backer_psd.vtex_c"));
    }
}
