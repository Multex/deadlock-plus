#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WireError {
    Truncated,
    VarintTooLong,
    UnsupportedWireType { message: &'static str, field: u32, wire: u8 },
    WrongWireType { message: &'static str, field: u32 },
    Overflow { message: &'static str, field: u32 },
    InvalidBool { message: &'static str, field: u32 },
    InvalidUtf8 { message: &'static str, field: u32 },
    DuplicateField { message: &'static str, field: u32 },
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct HeroBuildResult {
    pub hero_build: Option<HeroBuild>,
    pub preference: Option<Preference>,
    pub num_favorites: Option<u32>,
    pub num_ignores: Option<u32>,
    pub num_reports: Option<u32>,
    pub num_weekly_favorites: Option<u32>,
    pub num_daily_favorites: Option<u32>,
    pub rollup_category: Option<u32>,
    pub unknown: Vec<u8>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Preference {
    pub favorited: Option<bool>,
    pub ignored: Option<bool>,
    pub reported: Option<bool>,
    pub unknown: Vec<u8>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct HeroBuild {
    pub hero_build_id: Option<u32>,
    pub hero_id: Option<u32>,
    pub author_account_id: Option<u32>,
    pub last_updated_timestamp: Option<u32>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub language: Option<u32>,
    pub version: Option<u32>,
    pub origin_build_id: Option<u32>,
    pub details: Option<Details>,
    pub tags: Vec<u32>,
    pub development_build: Option<bool>,
    pub publish_timestamp: Option<u32>,
    pub unknown: Vec<u8>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Details {
    pub mod_categories: Vec<ModCategory>,
    pub ability_order: Option<AbilityOrder>,
    pub unknown: Vec<u8>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct ModCategory {
    pub mods: Vec<ModEntry>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub optional: Option<bool>,
    pub unknown: Vec<u8>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct ModEntry {
    pub ability_id: Option<u32>,
    pub annotation: Option<String>,
    pub required_flex_slots: Option<u32>,
    pub sell_priority: Option<u32>,
    pub imbue_target_ability_id: Option<u32>,
    pub unknown: Vec<u8>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct AbilityOrder {
    pub currency_changes: Vec<CurrencyChange>,
    pub unknown: Vec<u8>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct CurrencyChange {
    pub ability_id: Option<u32>,
    pub currency_type: Option<i32>,
    pub delta: Option<i32>,
    pub annotation: Option<String>,
    pub unknown: Vec<u8>,
}

impl std::fmt::Display for WireError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WireError::Truncated => write!(f, "truncated input"),
            WireError::VarintTooLong => write!(f, "varint longer than 10 bytes"),
            WireError::UnsupportedWireType { message, field, wire } => {
                write!(f, "{message}: field {field} has unsupported wire type {wire}")
            }
            WireError::WrongWireType { message, field } => {
                write!(f, "{message}: field {field} has the wrong wire type")
            }
            WireError::Overflow { message, field } => write!(f, "{message}: field {field} overflows its type"),
            WireError::InvalidBool { message, field } => write!(f, "{message}: field {field} is not a 0/1 bool"),
            WireError::InvalidUtf8 { message, field } => write!(f, "{message}: field {field} is not valid utf-8"),
            WireError::DuplicateField { message, field } => write!(f, "{message}: field {field} appears twice"),
        }
    }
}

impl std::error::Error for WireError {}

enum Value<'a> {
    Varint(u64),
    Len(&'a [u8]),
    Fixed32(u32),
    Other,
}

struct Field<'a> {
    num: u32,
    raw: &'a [u8],
    value: Value<'a>,
}

fn read_varint(b: &[u8], i: &mut usize) -> Result<u64, WireError> {
    let mut v = 0u64;
    for shift in 0..10 {
        let byte = *b.get(*i).ok_or(WireError::Truncated)?;
        *i += 1;
        v |= u64::from(byte & 0x7f) << (7 * shift);
        if byte & 0x80 == 0 {
            return Ok(v);
        }
    }
    Err(WireError::VarintTooLong)
}

fn take<'a>(b: &'a [u8], i: &mut usize, len: usize) -> Result<&'a [u8], WireError> {
    let end = i.checked_add(len).ok_or(WireError::Truncated)?;
    let s = b.get(*i..end).ok_or(WireError::Truncated)?;
    *i = end;
    Ok(s)
}

fn fields<'a>(msg: &'static str, b: &'a [u8]) -> Result<Vec<Field<'a>>, WireError> {
    let mut i = 0;
    let mut out = Vec::new();
    while i < b.len() {
        let start = i;
        let tag = read_varint(b, &mut i)?;
        let num = u32::try_from(tag >> 3).map_err(|_| WireError::Overflow { message: msg, field: 0 })?;
        let value = match tag & 7 {
            0 => Value::Varint(read_varint(b, &mut i)?),
            1 => {
                take(b, &mut i, 8)?;
                Value::Other
            }
            2 => {
                let len = usize::try_from(read_varint(b, &mut i)?).map_err(|_| WireError::Truncated)?;
                Value::Len(take(b, &mut i, len)?)
            }
            5 => {
                let s = take(b, &mut i, 4)?;
                Value::Fixed32(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
            }
            wire => return Err(WireError::UnsupportedWireType { message: msg, field: num, wire: wire as u8 }),
        };
        out.push(Field { num, raw: &b[start..i], value });
    }
    Ok(out)
}

fn as_u32(f: &Field, msg: &'static str) -> Result<u32, WireError> {
    match f.value {
        Value::Varint(v) => u32::try_from(v).map_err(|_| WireError::Overflow { message: msg, field: f.num }),
        _ => Err(WireError::WrongWireType { message: msg, field: f.num }),
    }
}

fn as_i32(f: &Field, msg: &'static str) -> Result<i32, WireError> {
    match f.value {
        Value::Varint(v) => Ok(v as i64 as i32),
        _ => Err(WireError::WrongWireType { message: msg, field: f.num }),
    }
}

fn as_bool(f: &Field, msg: &'static str) -> Result<bool, WireError> {
    match f.value {
        Value::Varint(0) => Ok(false),
        Value::Varint(1) => Ok(true),
        Value::Varint(_) => Err(WireError::InvalidBool { message: msg, field: f.num }),
        _ => Err(WireError::WrongWireType { message: msg, field: f.num }),
    }
}

fn as_f32(f: &Field, msg: &'static str) -> Result<f32, WireError> {
    match f.value {
        Value::Fixed32(v) => Ok(f32::from_bits(v)),
        _ => Err(WireError::WrongWireType { message: msg, field: f.num }),
    }
}

fn as_bytes<'a>(f: &Field<'a>, msg: &'static str) -> Result<&'a [u8], WireError> {
    match f.value {
        Value::Len(s) => Ok(s),
        _ => Err(WireError::WrongWireType { message: msg, field: f.num }),
    }
}

fn as_string(f: &Field, msg: &'static str) -> Result<String, WireError> {
    String::from_utf8(as_bytes(f, msg)?.to_vec()).map_err(|_| WireError::InvalidUtf8 { message: msg, field: f.num })
}

fn once<T>(slot: &mut Option<T>, v: T, msg: &'static str, f: &Field) -> Result<(), WireError> {
    if slot.is_some() {
        return Err(WireError::DuplicateField { message: msg, field: f.num });
    }
    *slot = Some(v);
    Ok(())
}

impl HeroBuildResult {
    const NAME: &'static str = "HeroBuildResult";

    pub fn decode(b: &[u8]) -> Result<Self, WireError> {
        let m = Self::NAME;
        let mut r = Self::default();
        for f in fields(m, b)? {
            match f.num {
                1 => once(&mut r.hero_build, HeroBuild::decode(as_bytes(&f, m)?)?, m, &f)?,
                2 => once(&mut r.preference, Preference::decode(as_bytes(&f, m)?)?, m, &f)?,
                3 => once(&mut r.num_favorites, as_u32(&f, m)?, m, &f)?,
                4 => once(&mut r.num_ignores, as_u32(&f, m)?, m, &f)?,
                5 => once(&mut r.num_reports, as_u32(&f, m)?, m, &f)?,
                6 => once(&mut r.num_weekly_favorites, as_u32(&f, m)?, m, &f)?,
                7 => once(&mut r.num_daily_favorites, as_u32(&f, m)?, m, &f)?,
                8 => once(&mut r.rollup_category, as_u32(&f, m)?, m, &f)?,
                _ => r.unknown.extend_from_slice(f.raw),
            }
        }
        Ok(r)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut o = Vec::new();
        if let Some(m) = &self.hero_build {
            put_bytes(&mut o, 1, &m.encode());
        }
        if let Some(m) = &self.preference {
            put_bytes(&mut o, 2, &m.encode());
        }
        put_u32(&mut o, 3, self.num_favorites);
        put_u32(&mut o, 4, self.num_ignores);
        put_u32(&mut o, 5, self.num_reports);
        put_u32(&mut o, 6, self.num_weekly_favorites);
        put_u32(&mut o, 7, self.num_daily_favorites);
        put_u32(&mut o, 8, self.rollup_category);
        o.extend_from_slice(&self.unknown);
        o
    }
}

impl Preference {
    const NAME: &'static str = "CMsgHeroBuildPreference";

    pub fn decode(b: &[u8]) -> Result<Self, WireError> {
        let m = Self::NAME;
        let mut p = Self::default();
        for f in fields(m, b)? {
            match f.num {
                1 => once(&mut p.favorited, as_bool(&f, m)?, m, &f)?,
                2 => once(&mut p.ignored, as_bool(&f, m)?, m, &f)?,
                3 => once(&mut p.reported, as_bool(&f, m)?, m, &f)?,
                _ => p.unknown.extend_from_slice(f.raw),
            }
        }
        Ok(p)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut o = Vec::new();
        put_bool(&mut o, 1, self.favorited);
        put_bool(&mut o, 2, self.ignored);
        put_bool(&mut o, 3, self.reported);
        o.extend_from_slice(&self.unknown);
        o
    }
}

impl HeroBuild {
    const NAME: &'static str = "CMsgHeroBuild";

    pub fn decode(b: &[u8]) -> Result<Self, WireError> {
        let m = Self::NAME;
        let mut h = Self::default();
        for f in fields(m, b)? {
            match f.num {
                1 => once(&mut h.hero_build_id, as_u32(&f, m)?, m, &f)?,
                2 => once(&mut h.hero_id, as_u32(&f, m)?, m, &f)?,
                3 => once(&mut h.author_account_id, as_u32(&f, m)?, m, &f)?,
                4 => once(&mut h.last_updated_timestamp, as_u32(&f, m)?, m, &f)?,
                5 => once(&mut h.name, as_string(&f, m)?, m, &f)?,
                6 => once(&mut h.description, as_string(&f, m)?, m, &f)?,
                7 => once(&mut h.language, as_u32(&f, m)?, m, &f)?,
                8 => once(&mut h.version, as_u32(&f, m)?, m, &f)?,
                9 => once(&mut h.origin_build_id, as_u32(&f, m)?, m, &f)?,
                10 => once(&mut h.details, Details::decode(as_bytes(&f, m)?)?, m, &f)?,
                11 => h.tags.push(as_u32(&f, m)?),
                12 => once(&mut h.development_build, as_bool(&f, m)?, m, &f)?,
                13 => once(&mut h.publish_timestamp, as_u32(&f, m)?, m, &f)?,
                _ => h.unknown.extend_from_slice(f.raw),
            }
        }
        Ok(h)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut o = Vec::new();
        put_u32(&mut o, 1, self.hero_build_id);
        put_u32(&mut o, 2, self.hero_id);
        put_u32(&mut o, 3, self.author_account_id);
        put_u32(&mut o, 4, self.last_updated_timestamp);
        put_str(&mut o, 5, self.name.as_deref());
        put_str(&mut o, 6, self.description.as_deref());
        put_u32(&mut o, 7, self.language);
        put_u32(&mut o, 8, self.version);
        put_u32(&mut o, 9, self.origin_build_id);
        if let Some(d) = &self.details {
            put_bytes(&mut o, 10, &d.encode());
        }
        for t in &self.tags {
            put_u32(&mut o, 11, Some(*t));
        }
        put_bool(&mut o, 12, self.development_build);
        put_u32(&mut o, 13, self.publish_timestamp);
        o.extend_from_slice(&self.unknown);
        o
    }
}

impl Details {
    const NAME: &'static str = "CMsgHeroBuild.Details_V0";

    pub fn decode(b: &[u8]) -> Result<Self, WireError> {
        let m = Self::NAME;
        let mut d = Self::default();
        for f in fields(m, b)? {
            match f.num {
                1 => d.mod_categories.push(ModCategory::decode(as_bytes(&f, m)?)?),
                2 => once(&mut d.ability_order, AbilityOrder::decode(as_bytes(&f, m)?)?, m, &f)?,
                _ => d.unknown.extend_from_slice(f.raw),
            }
        }
        Ok(d)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut o = Vec::new();
        for c in &self.mod_categories {
            put_bytes(&mut o, 1, &c.encode());
        }
        if let Some(a) = &self.ability_order {
            put_bytes(&mut o, 2, &a.encode());
        }
        o.extend_from_slice(&self.unknown);
        o
    }
}

impl ModCategory {
    const NAME: &'static str = "CMsgHeroBuild.BuildModCategory";

    pub fn decode(b: &[u8]) -> Result<Self, WireError> {
        let m = Self::NAME;
        let mut c = Self::default();
        for f in fields(m, b)? {
            match f.num {
                1 => c.mods.push(ModEntry::decode(as_bytes(&f, m)?)?),
                2 => once(&mut c.name, as_string(&f, m)?, m, &f)?,
                3 => once(&mut c.description, as_string(&f, m)?, m, &f)?,
                4 => once(&mut c.width, as_f32(&f, m)?, m, &f)?,
                5 => once(&mut c.height, as_f32(&f, m)?, m, &f)?,
                6 => once(&mut c.optional, as_bool(&f, m)?, m, &f)?,
                _ => c.unknown.extend_from_slice(f.raw),
            }
        }
        Ok(c)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut o = Vec::new();
        for e in &self.mods {
            put_bytes(&mut o, 1, &e.encode());
        }
        put_str(&mut o, 2, self.name.as_deref());
        put_str(&mut o, 3, self.description.as_deref());
        put_f32(&mut o, 4, self.width);
        put_f32(&mut o, 5, self.height);
        put_bool(&mut o, 6, self.optional);
        o.extend_from_slice(&self.unknown);
        o
    }
}

impl ModEntry {
    const NAME: &'static str = "CMsgHeroBuild.BuildModEntry";

    pub fn decode(b: &[u8]) -> Result<Self, WireError> {
        let m = Self::NAME;
        let mut e = Self::default();
        for f in fields(m, b)? {
            match f.num {
                1 => once(&mut e.ability_id, as_u32(&f, m)?, m, &f)?,
                2 => once(&mut e.annotation, as_string(&f, m)?, m, &f)?,
                3 => once(&mut e.required_flex_slots, as_u32(&f, m)?, m, &f)?,
                4 => once(&mut e.sell_priority, as_u32(&f, m)?, m, &f)?,
                5 => once(&mut e.imbue_target_ability_id, as_u32(&f, m)?, m, &f)?,
                _ => e.unknown.extend_from_slice(f.raw),
            }
        }
        Ok(e)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut o = Vec::new();
        put_u32(&mut o, 1, self.ability_id);
        put_str(&mut o, 2, self.annotation.as_deref());
        put_u32(&mut o, 3, self.required_flex_slots);
        put_u32(&mut o, 4, self.sell_priority);
        put_u32(&mut o, 5, self.imbue_target_ability_id);
        o.extend_from_slice(&self.unknown);
        o
    }
}

impl AbilityOrder {
    const NAME: &'static str = "CMsgHeroBuild.AbilityOrder";

    pub fn decode(b: &[u8]) -> Result<Self, WireError> {
        let m = Self::NAME;
        let mut a = Self::default();
        for f in fields(m, b)? {
            match f.num {
                1 => a.currency_changes.push(CurrencyChange::decode(as_bytes(&f, m)?)?),
                _ => a.unknown.extend_from_slice(f.raw),
            }
        }
        Ok(a)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut o = Vec::new();
        for c in &self.currency_changes {
            put_bytes(&mut o, 1, &c.encode());
        }
        o.extend_from_slice(&self.unknown);
        o
    }
}

impl CurrencyChange {
    const NAME: &'static str = "CMsgHeroBuild.CurrencyChange";

    pub fn decode(b: &[u8]) -> Result<Self, WireError> {
        let m = Self::NAME;
        let mut c = Self::default();
        for f in fields(m, b)? {
            match f.num {
                1 => once(&mut c.ability_id, as_u32(&f, m)?, m, &f)?,
                2 => once(&mut c.currency_type, as_i32(&f, m)?, m, &f)?,
                3 => once(&mut c.delta, as_i32(&f, m)?, m, &f)?,
                4 => once(&mut c.annotation, as_string(&f, m)?, m, &f)?,
                _ => c.unknown.extend_from_slice(f.raw),
            }
        }
        Ok(c)
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut o = Vec::new();
        put_u32(&mut o, 1, self.ability_id);
        put_i32(&mut o, 2, self.currency_type);
        put_i32(&mut o, 3, self.delta);
        put_str(&mut o, 4, self.annotation.as_deref());
        o.extend_from_slice(&self.unknown);
        o
    }
}

fn put_varint(o: &mut Vec<u8>, mut v: u64) {
    while v >= 0x80 {
        o.push((v as u8) | 0x80);
        v >>= 7;
    }
    o.push(v as u8);
}

fn put_tag(o: &mut Vec<u8>, n: u32, wire: u8) {
    put_varint(o, (u64::from(n) << 3) | u64::from(wire));
}

fn put_u32(o: &mut Vec<u8>, n: u32, v: Option<u32>) {
    if let Some(v) = v {
        put_tag(o, n, 0);
        put_varint(o, u64::from(v));
    }
}

// Negative int32 values are sign-extended to 10-byte varints.
fn put_i32(o: &mut Vec<u8>, n: u32, v: Option<i32>) {
    if let Some(v) = v {
        put_tag(o, n, 0);
        put_varint(o, i64::from(v) as u64);
    }
}

fn put_bool(o: &mut Vec<u8>, n: u32, v: Option<bool>) {
    put_u32(o, n, v.map(u32::from));
}

fn put_f32(o: &mut Vec<u8>, n: u32, v: Option<f32>) {
    if let Some(v) = v {
        put_tag(o, n, 5);
        o.extend_from_slice(&v.to_bits().to_le_bytes());
    }
}

fn put_bytes(o: &mut Vec<u8>, n: u32, b: &[u8]) {
    put_tag(o, n, 2);
    put_varint(o, b.len() as u64);
    o.extend_from_slice(b);
}

fn put_str(o: &mut Vec<u8>, n: u32, v: Option<&str>) {
    if let Some(s) = v {
        put_bytes(o, n, s.as_bytes());
    }
}
