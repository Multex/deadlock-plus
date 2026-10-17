use std::collections::HashSet;
use std::net::IpAddr;

use dp_firewall::validate::{validate_block_request, validate_group_id};
use dp_firewall::FirewallRuleSpec;
use dp_server_picker::external::is_external_rule_name;
use serde::{Deserialize, Serialize};

pub const MAX_LINE_LEN: usize = 1 << 20;
const MAX_GROUPS: usize = 128;
const MAX_NAMES: usize = 64;
const MAX_NAME_LEN: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Trace {
    Net,
    Frames,
}

/// `Approve` and `Revoke` carry no account: the server takes the caller's SID from the pipe. The trace ops carry
/// no pid either: the server finds `deadlock.exe` itself, so a client cannot point a trace at another process.
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum Op {
    Block { groups: Vec<FirewallRuleSpec> },
    Unblock { group_ids: Vec<String> },
    RefreshStale { groups: Vec<FirewallRuleSpec> },
    RemoveExternal { names: Vec<String> },
    StartNetTrace {},
    StartFrameTrace {},
    Stop { trace: Trace },
    Approve {},
    Revoke {},
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "reply", rename_all = "snake_case", deny_unknown_fields)]
pub enum Reply {
    Ok {},
    Error { message: String },
    Refreshed { updated: Vec<String>, failed: Vec<String> },
}

fn encode_line<T: Serialize>(value: &T) -> String {
    let mut line = serde_json::to_string(value).expect("wire types always serialise");
    line.push('\n');
    line
}

fn decode_line<'a, T: Deserialize<'a>>(line: &'a str) -> Result<T, String> {
    if line.len() > MAX_LINE_LEN {
        return Err("message too long".into());
    }
    let body = line.strip_suffix('\n').unwrap_or(line);
    let body = body.strip_suffix('\r').unwrap_or(body);
    if body.contains(['\n', '\r']) {
        return Err("message must be a single line".into());
    }
    // serde also accepts a tagged enum as a bare array; the protocol only defines objects.
    if !body.starts_with('{') {
        return Err("message must be a JSON object".into());
    }
    serde_json::from_str(body).map_err(|e| format!("malformed message: {e}"))
}

pub fn encode(op: &Op) -> String {
    encode_line(op)
}

pub fn decode(line: &str) -> Result<Op, String> {
    decode_line(line)
}

pub fn encode_reply(reply: &Reply) -> String {
    encode_line(reply)
}

pub fn decode_reply(line: &str) -> Result<Reply, String> {
    decode_line(line)
}

fn validate_groups(groups: &[FirewallRuleSpec], relays: &HashSet<IpAddr>) -> Result<(), String> {
    if groups.is_empty() || groups.len() > MAX_GROUPS {
        return Err("unusable number of server groups".into());
    }
    for group in groups {
        validate_block_request(&group.group_id, &group.description, &group.relay_ips)?;
        for raw in &group.relay_ips {
            let ip: IpAddr = raw.parse().map_err(|_| format!("not a single IP address: {raw:?}"))?;
            if !relays.contains(&ip) {
                return Err(format!("{raw} is not a known relay address"));
            }
        }
    }
    Ok(())
}

fn validate_external_names(names: &[String]) -> Result<(), String> {
    if names.is_empty() || names.len() > MAX_NAMES {
        return Err("unusable number of rule names".into());
    }
    for name in names {
        let ok = name.len() <= MAX_NAME_LEN && !name.chars().any(char::is_control) && is_external_rule_name(name);
        if !ok {
            return Err(format!("not a removable rule name: {name:?}"));
        }
    }
    Ok(())
}

/// `relays` is the relay allow-list the server fetched itself, never one supplied by the client.
pub fn validate(op: &Op, relays: &HashSet<IpAddr>) -> Result<(), String> {
    match op {
        Op::Block { groups } | Op::RefreshStale { groups } => validate_groups(groups, relays),
        Op::Unblock { group_ids } => {
            if group_ids.is_empty() || group_ids.len() > MAX_GROUPS {
                return Err("unusable number of server group ids".into());
            }
            group_ids.iter().try_for_each(|id| validate_group_id(id))
        }
        Op::RemoveExternal { names } => validate_external_names(names),
        Op::StartNetTrace {} | Op::StartFrameTrace {} | Op::Stop { .. } | Op::Approve {} | Op::Revoke {} => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(id: &str, ips: &[&str]) -> FirewallRuleSpec {
        FirewallRuleSpec {
            group_id: id.into(),
            description: "Frankfurt".into(),
            relay_ips: ips.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn relays(list: &[&str]) -> HashSet<IpAddr> {
        list.iter().map(|s| s.parse().unwrap()).collect()
    }

    fn sdr() -> HashSet<IpAddr> {
        relays(&["155.133.226.1", "155.133.226.2", "2a03:2880::1"])
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn rejected(op: Op) {
        assert!(validate(&op, &sdr()).is_err(), "{}", encode(&op));
    }

    #[test]
    fn every_op_round_trips_as_one_line() {
        let ops = [
            Op::Block { groups: vec![spec("fra", &["155.133.226.1"])] },
            Op::Unblock { group_ids: names(&["fra"]) },
            Op::RefreshStale { groups: vec![spec("fra", &["155.133.226.1"])] },
            Op::RemoveExternal { names: names(&["server_picker_x_Frankfurt"]) },
            Op::StartNetTrace {},
            Op::StartFrameTrace {},
            Op::Stop { trace: Trace::Frames },
            Op::Approve {},
            Op::Revoke {},
        ];
        for op in ops {
            let line = encode(&op);
            assert!(line.ends_with('\n') && line.matches('\n').count() == 1, "{line:?}");
            assert_eq!(encode(&decode(&line).unwrap()), line);
        }
    }

    #[test]
    fn replies_round_trip_as_one_line() {
        let replies = [
            Reply::Ok {},
            Reply::Error { message: "no\nway".into() },
            Reply::Refreshed { updated: names(&["a"]), failed: names(&["b"]) },
        ];
        for reply in replies {
            let line = encode_reply(&reply);
            assert_eq!(line.matches('\n').count(), 1);
            assert_eq!(decode_reply(&line).unwrap(), reply);
        }
    }

    #[test]
    fn the_wire_names_are_stable() {
        assert_eq!(encode(&Op::Approve {}), "{\"op\":\"approve\"}\n");
        assert_eq!(encode(&Op::Stop { trace: Trace::Net }), "{\"op\":\"stop\",\"trace\":\"net\"}\n");
        assert_eq!(encode_reply(&Reply::Ok {}), "{\"reply\":\"ok\"}\n");
    }

    #[test]
    fn hostile_lines_are_refused_by_decode() {
        let long = format!("{{\"op\":\"unblock\",\"group_ids\":[\"{}\"]}}\n", "a".repeat(MAX_LINE_LEN));
        let bad = [
            long.as_str(),
            "",
            "not json",
            "{}",
            "{\"op\":\"format_disk\"}",
            "{\"op\":\"approve\",\"sid\":\"S-1-5-18\"}",
            "{\"op\":\"revoke\",\"sid\":\"S-1-5-18\"}",
            "{\"op\":\"start_net_trace\",\"pid\":4}",
            "{\"op\":\"stop\"}",
            "{\"op\":\"stop\",\"trace\":\"all\"}",
            "{\"op\":\"unblock\",\"group_ids\":\"fra\"}",
            "{\"op\":\"unblock\",\"group_ids\":[1]}",
            "{\"op\":\"block\",\"groups\":[{\"group_id\":\"a\"}]}",
            "{\"op\":\"unblock\",\"group_ids\":[\"a\"]}\n{\"op\":\"approve\"}\n",
            "{\"op\":\"unblock\",\n\"group_ids\":[\"a\"]}",
            "{\"op\":\"approve\"} trailing",
            "[\"approve\"]",
        ];
        for line in bad {
            assert!(decode(line).is_err(), "{:?}", &line[..line.len().min(60)]);
        }
        assert!(decode("{\"op\":\"approve\"}\r\n").is_ok());
        assert!(decode_reply("{\"reply\":\"ok\",\"extra\":1}").is_err());
        assert!(decode_reply(&"x".repeat(MAX_LINE_LEN + 1)).is_err());
    }

    #[test]
    fn block_accepts_relays_from_the_sdr_set() {
        let op = Op::Block { groups: vec![spec("fra", &["155.133.226.1", "2a03:2880::1"])] };
        assert!(validate(&op, &sdr()).is_ok());
        assert!(validate(&Op::RefreshStale { groups: vec![spec("fra", &["155.133.226.2"])] }, &sdr()).is_ok());
    }

    #[test]
    fn an_ip_outside_the_sdr_set_is_refused_even_when_public() {
        rejected(Op::Block { groups: vec![spec("fra", &["8.8.8.8"])] });
        rejected(Op::Block { groups: vec![spec("fra", &["155.133.226.1", "8.8.8.8"])] });
        rejected(Op::RefreshStale { groups: vec![spec("fra", &["8.8.8.8"])] });
        assert!(validate(&Op::Block { groups: vec![spec("fra", &["155.133.226.1"])] }, &HashSet::new()).is_err());
    }

    #[test]
    fn a_private_ip_is_refused_even_if_listed() {
        let listed = relays(&["192.168.1.1", "127.0.0.1", "10.0.0.1"]);
        for ip in ["192.168.1.1", "127.0.0.1", "10.0.0.1"] {
            let op = Op::Block { groups: vec![spec("fra", &[ip])] };
            assert!(validate(&op, &listed).is_err(), "{ip}");
        }
    }

    #[test]
    fn injection_in_group_ids_and_descriptions_is_refused() {
        for id in ["a\" dir=in", "a)(A;;GA;;;WD)", "a\nb", "a,b", "a b", "", "../x"] {
            rejected(Op::Block { groups: vec![spec(id, &["155.133.226.1"])] });
            rejected(Op::Unblock { group_ids: names(&[id]) });
        }
        let mut group = spec("fra", &["155.133.226.1"]);
        group.description = "x\r\nnetsh".into();
        rejected(Op::Block { groups: vec![group] });
    }

    #[test]
    fn block_lists_must_be_non_empty_and_bounded() {
        rejected(Op::Block { groups: vec![] });
        rejected(Op::RefreshStale { groups: vec![] });
        rejected(Op::Block { groups: vec![spec("fra", &[])] });
        rejected(Op::Block { groups: (0..=MAX_GROUPS).map(|i| spec(&format!("g{i}"), &["155.133.226.1"])).collect() });
    }

    #[test]
    fn unblock_lists_must_be_non_empty_and_bounded() {
        assert!(validate(&Op::Unblock { group_ids: names(&["fra", "sto"]) }, &sdr()).is_ok());
        rejected(Op::Unblock { group_ids: vec![] });
        rejected(Op::Unblock { group_ids: (0..=MAX_GROUPS).map(|i| format!("g{i}")).collect() });
    }

    #[test]
    fn remove_external_takes_only_known_foreign_names() {
        let ok = Op::RemoveExternal { names: names(&["server_picker_x_Frankfurt", "CS2ServerPicker_Stockholm"]) };
        assert!(validate(&ok, &sdr()).is_ok());
        rejected(Op::RemoveExternal { names: vec![] });
        rejected(Op::RemoveExternal { names: names(&["Core Networking"]) });
        rejected(Op::RemoveExternal { names: names(&["deadlock_plus_fra_tcp"]) });
        rejected(Op::RemoveExternal { names: names(&["server_picker_x_a\nb"]) });
        rejected(Op::RemoveExternal { names: names(&["server_picker_x_a\u{0}"]) });
        rejected(Op::RemoveExternal { names: names(&[&format!("server_picker_x_{}", "a".repeat(MAX_NAME_LEN))]) });
        rejected(Op::RemoveExternal { names: (0..=MAX_NAMES).map(|i| format!("server_picker_x_{i}")).collect() });
    }

    #[test]
    fn ops_without_arguments_always_validate() {
        for op in [
            Op::StartNetTrace {},
            Op::StartFrameTrace {},
            Op::Stop { trace: Trace::Net },
            Op::Approve {},
            Op::Revoke {},
        ] {
            assert!(validate(&op, &HashSet::new()).is_ok(), "{}", encode(&op));
        }
    }
}
