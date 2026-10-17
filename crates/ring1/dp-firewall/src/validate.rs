use std::net::IpAddr;

const MAX_ID_LEN: usize = 48;
const MAX_DESCRIPTION_LEN: usize = 200;
const MAX_RELAYS: usize = 256;

/// Rule names embed the group id, so it is limited to characters that are safe in one.
pub fn validate_group_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'));
    if ok {
        Ok(())
    } else {
        Err(format!("invalid server group id: {id:?}"))
    }
}

/// Relay addresses come from the web view. Valve's relays are public unicast addresses, so anything else (a LAN
/// host, the loopback, a wildcard) is refused: a block rule on those would cut the machine off its own network.
/// A public address that is not a relay cannot be told apart here.
fn is_blockable(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_unspecified()
                || v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_broadcast()
                || v4.octets()[0] == 0)
        }
        IpAddr::V6(v6) => {
            let first = v6.segments()[0];
            !(v6.is_unspecified()
                || v6.is_loopback()
                || v6.is_multicast()
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80)
        }
    }
}

pub fn validate_block_request(id: &str, description: &str, relay_ips: &[String]) -> Result<(), String> {
    validate_group_id(id)?;
    if description.len() > MAX_DESCRIPTION_LEN || description.chars().any(char::is_control) {
        return Err(format!("invalid description for server group {id}"));
    }
    if relay_ips.is_empty() || relay_ips.len() > MAX_RELAYS {
        return Err(format!("server group {id} has an unusable relay list"));
    }
    for raw in relay_ips {
        let ip: IpAddr = raw.parse().map_err(|_| format!("not a single IP address: {raw:?}"))?;
        if !is_blockable(&ip) {
            return Err(format!("refusing to block a non-public address: {raw}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ips(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn accepts_a_normal_group() {
        assert!(validate_block_request("fra-1", "Frankfurt", &ips(&["155.133.226.1", "2a03:2880::1"])).is_ok());
    }

    #[test]
    fn group_ids_are_limited_to_rule_name_characters() {
        for id in ["", "a b", "a/b", "a\"b", "a,b", &"x".repeat(49)] {
            assert!(validate_group_id(id).is_err(), "{id:?}");
        }
        assert!(validate_group_id("stockholm_2.b-c").is_ok());
    }

    #[test]
    fn refuses_addresses_that_would_cut_the_machine_off() {
        for ip in [
            "0.0.0.0",
            "127.0.0.1",
            "192.168.1.1",
            "10.0.0.2",
            "172.16.5.5",
            "169.254.1.1",
            "224.0.0.1",
            "255.255.255.255",
            "::",
            "::1",
            "fe80::1",
            "fd00::1",
            "ff02::1",
        ] {
            assert!(validate_block_request("fra", "d", &ips(&[ip])).is_err(), "{ip}");
        }
    }

    #[test]
    fn refuses_ranges_and_junk_in_place_of_an_address() {
        for ip in ["0.0.0.0/0", "1.2.3.0/24", "1.1.1.1-2.2.2.2", "1.1.1.1,8.8.8.8", "", "example.com", "*"] {
            assert!(validate_block_request("fra", "d", &ips(&[ip])).is_err(), "{ip}");
        }
    }

    #[test]
    fn one_bad_address_rejects_the_group() {
        assert!(validate_block_request("fra", "d", &ips(&["155.133.226.1", "192.168.0.1"])).is_err());
    }

    #[test]
    fn bounds_the_list_and_the_description() {
        assert!(validate_block_request("fra", "d", &[]).is_err());
        let many: Vec<String> = (0..257).map(|i| format!("155.133.{}.{}", i / 250, i % 250 + 1)).collect();
        assert!(validate_block_request("fra", "d", &many).is_err());
        assert!(validate_block_request("fra", &"d".repeat(201), &ips(&["155.133.226.1"])).is_err());
        assert!(validate_block_request("fra", "line\nbreak", &ips(&["155.133.226.1"])).is_err());
    }
}
