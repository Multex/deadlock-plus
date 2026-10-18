use serde::{Serialize, Serializer};

const MAX_MATCH_ID: u64 = 10_000_000_000;

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct Salts {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub metadata_salt: Option<u32>,
    pub replay_salt: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", serialize_with = "serialize_username")]
    pub username: Option<u32>,
}

fn serialize_username<S: Serializer>(value: &Option<u32>, serializer: S) -> Result<S::Ok, S::Error> {
    match value {
        Some(id) => serializer.serialize_str(&format!("deadlockplus:{id}")),
        None => serializer.serialize_none(),
    }
}

impl Salts {
    /// Parses `http://replay<cluster>.valve.net/<app>/<match>_<salt>.meta.bz2` (metadata salt)
    /// or `.dem.bz2` (replay salt).
    pub fn from_url(url: &str, steam_id3: Option<u32>) -> Option<Self> {
        let base = url.split_once('?').map_or(url, |(path, _)| path);
        let (cluster, rest) = base.strip_prefix("http://replay")?.split_once(".valve.net/")?;
        let name = rest.rsplit_once('/').map(|(_, name)| name)?;

        let (stem, is_metadata) = if let Some(stem) = name.strip_suffix(".meta.bz2") {
            (stem, true)
        } else {
            (name.strip_suffix(".dem.bz2")?, false)
        };
        let (match_id, salt) = stem.split_once('_')?;
        let salt: Option<u32> = salt.parse().ok();

        Some(Self {
            match_id: match_id.parse().ok()?,
            cluster_id: Some(cluster.parse().ok()?),
            metadata_salt: if is_metadata { salt } else { None },
            replay_salt: if is_metadata { None } else { salt },
            username: steam_id3,
        })
    }

    pub fn is_plausible(&self) -> bool {
        self.match_id <= MAX_MATCH_ID
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_metadata_url() {
        let s = Salts::from_url("http://replay404.valve.net/1422450/37959196_937530290.meta.bz2", None).unwrap();
        assert_eq!(s.cluster_id, Some(404));
        assert_eq!(s.match_id, 37959196);
        assert_eq!(s.metadata_salt, Some(937530290));
        assert_eq!(s.replay_salt, None);
    }

    #[test]
    fn parses_replay_url_and_ignores_query() {
        let s = Salts::from_url("http://replay183.valve.net/1422450/42476710_428480166.dem.bz2?v=2", Some(7)).unwrap();
        assert_eq!(s.cluster_id, Some(183));
        assert_eq!(s.replay_salt, Some(428480166));
        assert_eq!(s.metadata_salt, None);
        assert_eq!(s.username, Some(7));
    }

    #[test]
    fn rejects_other_urls() {
        assert!(Salts::from_url("http://example.com/1422450/1_2.meta.bz2", None).is_none());
        assert!(Salts::from_url("http://replay1.valve.net/1422450/1_2.txt", None).is_none());
    }

    #[test]
    fn username_is_prefixed_and_omitted_when_unknown() {
        let mut s = Salts::from_url("http://replay1.valve.net/1422450/1_2.meta.bz2", Some(42)).unwrap();
        assert_eq!(serde_json::to_value(s).unwrap()["username"], "deadlockplus:42");
        s.username = None;
        assert!(serde_json::to_value(s).unwrap().get("username").is_none());
    }

    #[test]
    fn absurd_match_ids_are_implausible() {
        let s = Salts::from_url("http://replay1.valve.net/1422450/99999999999_2.meta.bz2", None).unwrap();
        assert!(!s.is_plausible());
    }
}
