use source2_kv3::{Compression, Document, Kind, Object, Value, Version, WriteOptions};

/// Ids below this are local builds; the GC hands out the ones above.
pub const LOCAL_ID_LIMIT: u32 = 1000;

const LAST_USED: &str = "LastUsedBuilds";

/// One of the build arrays in the file, each sorted by `hero_build_id`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Section {
    Favorites,
    Unpublished,
    SavedLastUsed,
}

impl Section {
    /// In the order the game writes them.
    pub const ALL: [Section; 3] = [Section::Favorites, Section::Unpublished, Section::SavedLastUsed];

    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Section::Favorites => "Favorites",
            Section::Unpublished => "Unpublished",
            Section::SavedLastUsed => "SavedLastUsed",
        }
    }
}

#[derive(Debug)]
pub enum FileError {
    Kv3(source2_kv3::Error),
    NotUtf8,
    RootNotObject,
    WrongType { key: &'static str },
    NoBuildId,
}

impl std::fmt::Display for FileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FileError::Kv3(e) => write!(f, "{e}"),
            FileError::NotUtf8 => f.write_str("text KV3 is not valid UTF-8"),
            FileError::RootNotObject => f.write_str("the build file's root is not an object"),
            FileError::WrongType { key } => write!(f, "`{key}` in the build file has the wrong type"),
            FileError::NoBuildId => f.write_str("the build has no hero_build_id"),
        }
    }
}

impl std::error::Error for FileError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            FileError::Kv3(e) => Some(e),
            _ => None,
        }
    }
}

impl From<source2_kv3::Error> for FileError {
    fn from(e: source2_kv3::Error) -> Self {
        FileError::Kv3(e)
    }
}

/// `cached_hero_builds.kv3`, with each build kept as the raw protobuf bytes it was read as.
#[derive(Clone, Debug)]
pub struct BuildsFile {
    root: Object,
    options: WriteOptions,
}

impl BuildsFile {
    /// Reads binary KV3 (any revision or compression) or text KV3.
    pub fn parse(bytes: &[u8]) -> Result<Self, FileError> {
        let doc = if is_text(bytes) {
            Document::from_text(std::str::from_utf8(bytes).map_err(|_| FileError::NotUtf8)?)?
        } else {
            Document::from_bytes(bytes)?
        };
        let options = doc.options;
        let Kind::Object(root) = doc.root.into_kind() else { return Err(FileError::RootNotObject) };
        if root.get(LAST_USED).is_some_and(|v| v.as_object().is_none()) {
            return Err(FileError::WrongType { key: LAST_USED });
        }
        if let Some(section) =
            Section::ALL.into_iter().find(|s| root.get(s.key()).is_some_and(|v| v.as_array().is_none()))
        {
            return Err(FileError::WrongType { key: section.key() });
        }
        Ok(BuildsFile { root, options })
    }

    /// A file in the game's root shape with nothing in it, for an account that has none yet.
    #[must_use]
    pub fn empty() -> Self {
        let mut root = Object::new();
        root.insert(LAST_USED, Object::new());
        for section in Section::ALL {
            root.insert(section.key(), Value::array(Vec::new()));
        }
        BuildsFile { root, options: WriteOptions::default() }
    }

    #[must_use]
    pub fn entries(&self, section: Section) -> Vec<&[u8]> {
        self.array(section).iter().filter_map(Value::as_blob).collect()
    }

    #[must_use]
    pub fn get(&self, section: Section, id: u32) -> Option<&[u8]> {
        self.array(section).iter().filter_map(Value::as_blob).find(|b| peek_build_id(b) == Some(id))
    }

    /// Replaces the build with the blob's id where it is, or inserts it before the first higher id.
    pub fn upsert_sorted(&mut self, section: Section, blob: Vec<u8>) -> Result<(), FileError> {
        let id = peek_build_id(&blob).ok_or(FileError::NoBuildId)?;
        let array = self.array_mut(section);
        if let Some(existing) = array.iter_mut().find(|v| value_id(v) == Some(id)) {
            existing.set_kind(Kind::Blob(blob));
        } else {
            let at = array.iter().position(|v| value_id(v).is_some_and(|x| x > id)).unwrap_or(array.len());
            array.insert(at, Value::blob(blob));
        }
        Ok(())
    }

    /// Removes every build with this id; whether there was one.
    pub fn remove(&mut self, section: Section, id: u32) -> bool {
        let Some(array) = self.root.get_mut(section.key()).and_then(Value::as_array_mut) else { return false };
        let before = array.len();
        array.retain(|v| value_id(v) != Some(id));
        array.len() != before
    }

    #[must_use]
    pub fn last_used(&self, hero: &str) -> Option<u32> {
        self.root.get(LAST_USED)?.get(hero)?.as_u32()
    }

    /// Sets the hero's entry in place, or appends it.
    pub fn set_last_used(&mut self, hero: &str, id: u32) {
        if self.root.get(LAST_USED).and_then(Value::as_object).is_none() {
            self.root.insert(LAST_USED, Object::new());
        }
        let Some(map) = self.root.get_mut(LAST_USED).and_then(Value::as_object_mut) else { return };
        if let Some(value) = map.get_mut(hero) {
            set_id(value, id);
            return;
        }
        // A sibling's clone keeps the integer type the game stored the others in.
        let mut value = map.values().next().cloned().unwrap_or_else(|| Value::from(id));
        set_id(&mut value, id);
        map.insert(hero, value);
    }

    /// One above the highest local id in `Unpublished` and `Favorites`, which share one id space;
    /// `None` once that would leave the local range.
    #[must_use]
    pub fn next_local_id(&self) -> Option<u32> {
        let highest = [Section::Unpublished, Section::Favorites]
            .into_iter()
            .flat_map(|s| self.array(s).iter().filter_map(value_id))
            .filter(|&id| id < LOCAL_ID_LIMIT)
            .max()
            .unwrap_or(0);
        Some(highest + 1).filter(|&id| id < LOCAL_ID_LIMIT)
    }

    /// Always binary KV3 v5 with zstd, as the game writes it, in the format the file was read with.
    pub fn to_bytes(&self) -> Result<Vec<u8>, FileError> {
        let options = WriteOptions { version: Version::V5, compression: Compression::Zstd, ..self.options };
        Ok(source2_kv3::write(&Value::from(self.root.clone()), &options)?)
    }

    fn array(&self, section: Section) -> &[Value] {
        self.root.get(section.key()).and_then(Value::as_array).unwrap_or(&[])
    }

    fn array_mut(&mut self, section: Section) -> &mut Vec<Value> {
        let key = section.key();
        if self.root.get(key).and_then(Value::as_array).is_none() {
            self.root.insert(key, Value::array(Vec::new()));
        }
        self.root.get_mut(key).and_then(Value::as_array_mut).expect("inserted above")
    }
}

fn is_text(bytes: &[u8]) -> bool {
    bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes).starts_with(b"<!--")
}

fn value_id(value: &Value) -> Option<u32> {
    peek_build_id(value.as_blob()?)
}

fn set_id(value: &mut Value, id: u32) {
    *value.kind_mut() = match value.kind() {
        Kind::Int(_) => Kind::Int(i64::from(id)),
        _ => Kind::UInt(u64::from(id)),
    };
}

enum Wire<'a> {
    Varint(u64),
    Bytes(&'a [u8]),
    Fixed,
}

/// Reads `hero_build_id` straight off the wire (`HeroBuildResult.1` -> `CMsgHeroBuild.1`), so it
/// works on blobs that would not decode in full. `None` for anything malformed up to the id.
#[must_use]
pub fn peek_build_id(blob: &[u8]) -> Option<u32> {
    let Wire::Bytes(hero_build) = first_field(blob, 1)? else { return None };
    let Wire::Varint(id) = first_field(hero_build, 1)? else { return None };
    u32::try_from(id).ok()
}

fn first_field(buf: &[u8], number: u64) -> Option<Wire<'_>> {
    let mut pos = 0;
    while pos < buf.len() {
        let key = read_varint(buf, &mut pos)?;
        let value = match key & 7 {
            0 => Wire::Varint(read_varint(buf, &mut pos)?),
            1 => skip(buf, &mut pos, 8)?,
            2 => {
                let len = usize::try_from(read_varint(buf, &mut pos)?).ok()?;
                let end = pos.checked_add(len)?;
                let bytes = buf.get(pos..end)?;
                pos = end;
                Wire::Bytes(bytes)
            }
            5 => skip(buf, &mut pos, 4)?,
            _ => return None,
        };
        if key >> 3 == number {
            return Some(value);
        }
    }
    None
}

fn skip<'a>(buf: &[u8], pos: &mut usize, n: usize) -> Option<Wire<'a>> {
    let end = pos.checked_add(n).filter(|&end| end <= buf.len())?;
    *pos = end;
    Some(Wire::Fixed)
}

fn read_varint(buf: &[u8], pos: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let byte = *buf.get(*pos)?;
        *pos += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
    }
    None
}
