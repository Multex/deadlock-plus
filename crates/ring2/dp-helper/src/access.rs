const MAX_SUB_AUTHORITIES: usize = 15;
const MAX_AUTHORITY: u64 = (1 << 48) - 1;

const SERVICE_DEFAULT_DACL: &str = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)\
(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)";

fn canonical_decimal(part: &str) -> Option<u64> {
    let bytes = part.as_bytes();
    if bytes.is_empty() || bytes.len() > 15 || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    if bytes.len() > 1 && bytes[0] == b'0' {
        return None;
    }
    part.parse().ok()
}

/// Accepts only the canonical string form: uppercase `S`, revision 1, no leading zeros. Lowercase is rejected
/// rather than normalised so the stored text, the SDDL text and the compared text are always the same bytes.
pub fn is_valid_sid(s: &str) -> bool {
    let Some(rest) = s.strip_prefix("S-1-") else {
        return false;
    };
    let mut parts = rest.split('-');
    let Some(authority) = parts.next().and_then(canonical_decimal) else {
        return false;
    };
    if authority > MAX_AUTHORITY {
        return false;
    }
    let mut count = 0;
    for part in parts {
        match canonical_decimal(part) {
            Some(v) if u32::try_from(v).is_ok() => count += 1,
            _ => return false,
        }
    }
    (1..=MAX_SUB_AUTHORITIES).contains(&count)
}

fn append_aces(mut sddl: String, rights: &str, approved: &[&str]) -> Option<String> {
    for sid in approved {
        if !is_valid_sid(sid) {
            return None;
        }
        sddl.push_str("(A;;");
        sddl.push_str(rights);
        sddl.push_str(";;;");
        sddl.push_str(sid);
        sddl.push(')');
    }
    Some(sddl)
}

/// Clients get `FILE_GENERIC_READ | FILE_WRITE_DATA | FILE_WRITE_ATTRIBUTES`, not `GW`: generic write includes
/// `FILE_APPEND_DATA`, which on a pipe is `FILE_CREATE_PIPE_INSTANCE` and would let a client serve the pipe name.
const PIPE_CLIENT_RIGHTS: &str = "0x12018b";

pub fn pipe_sddl(approved: &[&str]) -> Option<String> {
    append_aces("D:P(A;;GA;;;BA)".to_string(), PIPE_CLIENT_RIGHTS, approved)
}

pub fn service_sddl(approved: &[&str]) -> Option<String> {
    append_aces(SERVICE_DEFAULT_DACL.to_string(), "RPLCLOCRRC", approved)
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ApprovedSids(Vec<String>);

impl ApprovedSids {
    pub fn from_stored(stored: Vec<String>) -> Self {
        let mut list = Self::default();
        for sid in &stored {
            list.add(sid);
        }
        list
    }

    pub fn to_stored(&self) -> Vec<String> {
        self.0.clone()
    }

    pub fn contains(&self, sid: &str) -> bool {
        self.0.iter().any(|s| s.eq_ignore_ascii_case(sid))
    }

    pub fn add(&mut self, sid: &str) -> bool {
        if !is_valid_sid(sid) || self.contains(sid) {
            return false;
        }
        self.0.push(sid.to_string());
        true
    }

    pub fn remove(&mut self, sid: &str) -> bool {
        let before = self.0.len();
        self.0.retain(|s| !s.eq_ignore_ascii_case(sid));
        self.0.len() != before
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

pub fn client_allowed(client_sid: &str, approved: &ApprovedSids) -> bool {
    is_valid_sid(client_sid) && approved.contains(client_sid)
}

/// Supplements the SID check only: a PID can be reused, so it never replaces verifying who the peer is.
/// A stopped service reports PID 0, which must never match.
pub fn server_is_expected(server_pid: u32, expected_pid: u32) -> bool {
    expected_pid != 0 && server_pid == expected_pid
}

#[cfg(test)]
mod tests {
    use super::*;

    const USER: &str = "S-1-5-21-1004336348-1177238915-682003330-1001";
    const OTHER: &str = "S-1-5-21-1004336348-1177238915-682003330-1002";

    #[test]
    fn accepts_well_known_and_domain_sids() {
        for s in ["S-1-5-18", "S-1-5-32-544", "S-1-1-0", "S-1-5-4294967295", USER] {
            assert!(is_valid_sid(s), "{s}");
        }
    }

    #[test]
    fn accepts_48_bit_authority() {
        assert!(is_valid_sid("S-1-281474976710655-1"));
        assert!(!is_valid_sid("S-1-281474976710656-1"));
    }

    #[test]
    fn sub_authority_count_bounds() {
        assert!(!is_valid_sid("S-1-5"));
        let fifteen = format!("S-1-5{}", "-1".repeat(15));
        assert!(is_valid_sid(&fifteen));
        let sixteen = format!("S-1-5{}", "-1".repeat(16));
        assert!(!is_valid_sid(&sixteen));
    }

    #[test]
    fn rejects_hostile_input() {
        let cases = [
            "",
            " ",
            "S-1-5-21-1)(A;;GA;;;WD",
            "S-1-5-18;",
            "S-1-5-18)",
            "(S-1-5-18",
            "S-1-5-18 ",
            " S-1-5-18",
            "S-1-5-18\n",
            "S-1-5-1 8",
            "S-1-5-\u{0661}\u{0668}",
            "S-1-5-１８",
            "S-1-5-4294967296",
            "S-1-5-99999999999999999999999999",
            "S-1-5-",
            "S-1-5--18",
            "S-1-5-18-",
            "S-2-5-18",
            "S-1",
            "S-1-",
            "S-1-5-+18",
            "S-1-5-0x12",
            "S-1-5-018",
            "S-01-5-18",
            "BA",
            "S-1-5-18\0",
            "s-1-5-18",
        ];
        for s in cases {
            assert!(!is_valid_sid(s), "{s:?}");
        }
    }

    #[test]
    fn pipe_sddl_is_protected_with_admins_and_each_sid() {
        assert_eq!(pipe_sddl(&[]).as_deref(), Some("D:P(A;;GA;;;BA)"));
        assert_eq!(
            pipe_sddl(&[USER, OTHER]).as_deref(),
            Some(format!("D:P(A;;GA;;;BA)(A;;0x12018b;;;{USER})(A;;0x12018b;;;{OTHER})").as_str())
        );
    }

    #[test]
    fn pipe_clients_cannot_create_pipe_instances() {
        const FILE_CREATE_PIPE_INSTANCE: u32 = 0x4;
        let sddl = pipe_sddl(&[USER]).unwrap();
        let ace = sddl.split('(').find(|ace| ace.ends_with(&format!(";;;{USER})"))).unwrap();
        let rights = ace.trim_start_matches("A;;").split(';').next().unwrap();
        let mask =
            u32::from_str_radix(rights.trim_start_matches("0x"), 16).expect("client rights must be an explicit mask");
        assert_eq!(mask & FILE_CREATE_PIPE_INSTANCE, 0);
    }

    #[test]
    fn pipe_sddl_refuses_any_bad_sid() {
        assert_eq!(pipe_sddl(&[USER, "S-1-5-21-1)(A;;GA;;;WD"]), None);
        assert_eq!(pipe_sddl(&[""]), None);
    }

    const SERVICE_BASE: &str = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)\
(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)";

    #[test]
    fn service_sddl_extends_the_default_dacl() {
        assert_eq!(service_sddl(&[]).as_deref(), Some(SERVICE_BASE));
        assert_eq!(service_sddl(&[USER]).as_deref(), Some(format!("{SERVICE_BASE}(A;;RPLCLOCRRC;;;{USER})").as_str()));
    }

    #[test]
    fn service_sddl_refuses_any_bad_sid() {
        assert_eq!(service_sddl(&[USER, "x"]), None);
        assert_eq!(service_sddl(&["S-1-5-18)(A;;GA;;;WD"]), None);
    }

    #[test]
    fn stored_list_drops_invalid_and_duplicates() {
        let list = ApprovedSids::from_stored(vec![USER.into(), "garbage".into(), USER.into(), OTHER.into(), "".into()]);
        assert_eq!(list.to_stored(), vec![USER.to_string(), OTHER.to_string()]);
    }

    #[test]
    fn stored_list_empty_input_is_empty() {
        let list = ApprovedSids::from_stored(vec!["nope".into()]);
        assert!(list.is_empty());
        assert!(list.to_stored().is_empty());
    }

    #[test]
    fn add_remove_report_changes() {
        let mut list = ApprovedSids::default();
        assert!(list.is_empty());
        assert!(list.add(USER));
        assert!(!list.add(USER));
        assert!(!list.add("bad"));
        assert!(!list.is_empty());
        assert!(list.contains(USER));
        assert!(!list.contains(OTHER));
        assert!(!list.remove(OTHER));
        assert!(list.remove(USER));
        assert!(!list.remove(USER));
        assert!(list.is_empty());
    }

    #[test]
    fn contains_ignores_case() {
        let mut list = ApprovedSids::default();
        list.add("S-1-5-21-1-2-3-1001");
        assert!(list.contains("s-1-5-21-1-2-3-1001"));
        assert!(!list.add("s-1-5-21-1-2-3-1001"));
        assert!(list.remove("s-1-5-21-1-2-3-1001"));
    }

    #[test]
    fn client_must_be_approved() {
        let list = ApprovedSids::from_stored(vec![USER.into()]);
        assert!(client_allowed(USER, &list));
        assert!(!client_allowed(OTHER, &list));
        assert!(!client_allowed("", &list));
        assert!(!client_allowed(USER, &ApprovedSids::default()));
    }

    #[test]
    fn server_pid_must_match_and_be_nonzero() {
        assert!(server_is_expected(4242, 4242));
        assert!(!server_is_expected(4242, 4243));
        assert!(!server_is_expected(0, 0));
        assert!(!server_is_expected(4242, 0));
    }
}
