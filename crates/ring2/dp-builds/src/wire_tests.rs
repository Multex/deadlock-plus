use super::wire::*;

fn varint(mut v: u64) -> Vec<u8> {
    let mut o = Vec::new();
    while v >= 0x80 {
        o.push((v as u8) | 0x80);
        v >>= 7;
    }
    o.push(v as u8);
    o
}

fn vi(n: u32, v: u64) -> Vec<u8> {
    let mut o = varint(u64::from(n) << 3);
    o.extend(varint(v));
    o
}

fn ld(n: u32, payload: &[u8]) -> Vec<u8> {
    let mut o = varint((u64::from(n) << 3) | 2);
    o.extend(varint(payload.len() as u64));
    o.extend_from_slice(payload);
    o
}

fn f32f(n: u32, v: f32) -> Vec<u8> {
    let mut o = varint((u64::from(n) << 3) | 5);
    o.extend_from_slice(&v.to_bits().to_le_bytes());
    o
}

fn cat(parts: &[Vec<u8>]) -> Vec<u8> {
    parts.concat()
}

fn mod_entry(extra: Vec<u8>) -> Vec<u8> {
    cat(&[vi(1, 7), ld(2, b"note"), vi(3, 0), extra])
}

fn build(entry_extra: Vec<u8>, build_extra: Vec<u8>) -> Vec<u8> {
    let category = cat(&[
        ld(1, &mod_entry(entry_extra)),
        ld(1, &mod_entry(Vec::new())),
        ld(2, b"Early"),
        f32f(4, 0.5),
        f32f(5, 0.0),
        vi(6, 0),
    ]);
    let currency = cat(&[vi(1, 3), vi(2, (-1i64) as u64), vi(3, 5), ld(4, b"x")]);
    let details = cat(&[ld(1, &category), ld(2, &ld(1, &currency))]);
    cat(&[
        vi(1, 0),
        vi(2, 42),
        ld(5, b"Name"),
        ld(10, &details),
        vi(11, 1),
        vi(11, 2),
        vi(11, 1),
        vi(12, 0),
        build_extra,
    ])
}

fn result(build_bytes: &[u8]) -> Vec<u8> {
    cat(&[ld(1, build_bytes), ld(2, &cat(&[vi(1, 0), vi(2, 1)])), vi(3, 0), vi(8, 3)])
}

#[test]
fn roundtrip_is_byte_identical_with_explicit_zeros() {
    let bytes = result(&build(Vec::new(), Vec::new()));
    let r = HeroBuildResult::decode(&bytes).unwrap();
    assert_eq!(r.num_favorites, Some(0));
    assert_eq!(r.hero_build.as_ref().unwrap().hero_build_id, Some(0));
    assert_eq!(r.preference.as_ref().unwrap().favorited, Some(false));
    assert_eq!(r.encode(), bytes);
}

#[test]
fn negative_int32_is_ten_byte_varint() {
    let change = CurrencyChange { currency_type: Some(-1), ..Default::default() };
    let ao = AbilityOrder { currency_changes: vec![change], unknown: Vec::new() };
    let r = HeroBuildResult {
        hero_build: Some(HeroBuild {
            details: Some(Details { ability_order: Some(ao), ..Default::default() }),
            ..Default::default()
        }),
        ..Default::default()
    };
    let enc = r.encode();
    let ten = [0x10, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01];
    assert!(enc.windows(ten.len()).any(|w| w == ten));
    assert_eq!(HeroBuildResult::decode(&enc).unwrap(), r);
}

#[test]
fn repeated_tags_keep_order_and_duplicates() {
    let bytes = result(&build(Vec::new(), Vec::new()));
    let r = HeroBuildResult::decode(&bytes).unwrap();
    assert_eq!(r.hero_build.unwrap().tags, vec![1, 2, 1]);
}

#[test]
fn unknown_fields_survive_rename() {
    let junk_build = cat(&[vi(99, 7)]);
    let junk_entry = cat(&[ld(99, b"abc")]);
    let bytes = result(&build(junk_entry.clone(), junk_build.clone()));
    let mut r = HeroBuildResult::decode(&bytes).unwrap();
    let hb = r.hero_build.as_mut().unwrap();
    assert_eq!(hb.unknown, junk_build);
    assert_eq!(hb.details.as_ref().unwrap().mod_categories[0].mods[0].unknown, junk_entry);
    assert_eq!(r.encode(), bytes);
    r.hero_build.as_mut().unwrap().name = Some("Renamed".into());
    let again = HeroBuildResult::decode(&r.encode()).unwrap();
    let hb = again.hero_build.unwrap();
    assert_eq!(hb.name.as_deref(), Some("Renamed"));
    assert_eq!(hb.unknown, junk_build);
    assert_eq!(hb.details.unwrap().mod_categories[0].mods[0].unknown, junk_entry);
}

#[test]
fn unknown_fields_are_emitted_after_known_ones() {
    let bytes = cat(&[vi(99, 1), vi(3, 4)]);
    let r = HeroBuildResult::decode(&bytes).unwrap();
    assert_eq!(r.encode(), cat(&[vi(3, 4), vi(99, 1)]));
}

#[test]
fn wrong_wire_type_is_an_error() {
    assert!(matches!(HeroBuildResult::decode(&ld(3, &[1])), Err(WireError::WrongWireType { .. })));
    assert!(matches!(HeroBuildResult::decode(&vi(1, 5)), Err(WireError::WrongWireType { .. })));
    assert!(matches!(HeroBuildResult::decode(&ld(1, &ld(4, b"abcd"))), Err(WireError::WrongWireType { .. })));
    assert!(matches!(HeroBuildResult::decode(&ld(1, &ld(11, &[1, 2]))), Err(WireError::WrongWireType { .. })));
}

#[test]
fn truncated_input_is_an_error() {
    assert_eq!(HeroBuildResult::decode(&[0x18]), Err(WireError::Truncated));
    assert_eq!(HeroBuildResult::decode(&[0x0a, 0x05, 0x01]), Err(WireError::Truncated));
    assert_eq!(HeroBuildResult::decode(&[0x0a, 0x80]), Err(WireError::Truncated));
    assert!(HeroBuildResult::decode(&[0x80; 11]).is_err());
    let bytes = result(&build(cat(&[vi(99, 300)]), Vec::new()));
    for cut in 0..bytes.len() {
        if let Ok(r) = HeroBuildResult::decode(&bytes[..cut]) {
            assert_ne!(r.encode(), bytes);
        }
    }
    assert!(HeroBuildResult::decode(&bytes[..bytes.len() - 1]).is_err());
}

#[test]
fn arbitrary_garbage_does_not_panic() {
    for seed in 0u32..2000 {
        let mut x = seed.wrapping_mul(2654435761).wrapping_add(1);
        let bytes: Vec<u8> = (0..(seed % 40))
            .map(|_| {
                x = x.wrapping_mul(1664525).wrapping_add(1013904223);
                (x >> 24) as u8
            })
            .collect();
        let _ = HeroBuildResult::decode(&bytes);
    }
}
