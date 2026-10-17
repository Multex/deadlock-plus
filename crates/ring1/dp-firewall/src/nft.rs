use std::io::Write;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use dp_privilege::{pick_pkexec, NO_AGENT};

use super::ruleset::Backend;
use super::FirewallRuleSpec;

const TABLE: &str = "deadlock_plus";
const COMMENT_PREFIX: &str = "deadlock_plus_";

pub struct Nft;

fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

fn addresses(ips: &[String]) -> (Vec<String>, Vec<String>) {
    let (mut v4, mut v6) = (Vec::new(), Vec::new());
    for ip in ips.iter().filter_map(|ip| ip.parse::<IpAddr>().ok()) {
        match ip {
            IpAddr::V4(_) => v4.push(ip.to_string()),
            IpAddr::V6(_) => v6.push(ip.to_string()),
        }
    }
    (v4, v6)
}

fn render(groups: &[FirewallRuleSpec]) -> String {
    let mut script = format!("table inet {TABLE}\ndelete table inet {TABLE}\n");
    let mut rules = String::new();
    for group in groups.iter().filter(|g| safe_id(&g.group_id)) {
        let (v4, v6) = addresses(&group.relay_ips);
        for (family, list) in [("ip", v4), ("ip6", v6)] {
            if !list.is_empty() {
                rules.push_str(&format!(
                    "    {family} daddr {{ {} }} meta l4proto {{ tcp, udp }} drop comment \"{COMMENT_PREFIX}{}\"\n",
                    list.join(", "),
                    group.group_id
                ));
            }
        }
    }
    if !rules.is_empty() {
        script.push_str(&format!(
            "table inet {TABLE} {{\n  chain output {{\n    type filter hook output priority 0; policy accept;\n{rules}  }}\n}}\n"
        ));
    }
    script
}

/// `pkexec` exits 126 when the prompt is dismissed or refused and 127 when there is no agent to ask.
fn explain_failure(code: Option<i32>, stderr: &str) -> String {
    match code {
        Some(126) => "Authorization was cancelled or denied.".into(),
        Some(127) => NO_AGENT.into(),
        _ => format!("nft failed: {}", stderr.trim()),
    }
}

const TOOL_DIRS: [&str; 5] = ["/usr/sbin", "/usr/bin", "/sbin", "/bin", "/usr/local/sbin"];

/// Looks only in fixed system directories, so a hijacked `PATH` cannot substitute a tool that runs as root.
fn find_tool_in(name: &str, dirs: &[&str]) -> Option<PathBuf> {
    if name.contains(['/', '\\']) {
        return None;
    }
    dirs.iter().map(|dir| Path::new(dir).join(name)).find(|path| path.is_file())
}

fn tool(name: &str) -> Result<PathBuf, String> {
    find_tool_in(name, &TOOL_DIRS)
        .ok_or_else(|| format!("could not find {name} in the system directories (is it installed?)"))
}

fn is_root() -> bool {
    let Ok(id) = tool("id") else { return false };
    Command::new(id).arg("-u").output().map(|o| o.stdout.trim_ascii() == b"0").unwrap_or(false)
}

impl Backend for Nft {
    fn render(&self, groups: &[FirewallRuleSpec]) -> String {
        render(groups)
    }

    fn apply(&self, script: &str) -> Result<(), String> {
        let nft = tool("nft")?;
        let mut command = if is_root() {
            let mut c = Command::new(nft);
            c.args(["-f", "-"]);
            c
        } else {
            let pkexec =
                pick_pkexec(Path::exists).ok_or("pkexec was not found, so administrator rights cannot be requested")?;
            let mut c = Command::new(pkexec);
            c.arg(nft).args(["-f", "-"]);
            c
        };
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("could not run the firewall tool (are nftables and polkit installed?): {e}"))?;
        child
            .stdin
            .take()
            .ok_or("no stdin for nft")?
            .write_all(script.as_bytes())
            .map_err(|e| format!("could not send the rules to nft: {e}"))?;
        let output = child.wait_with_output().map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(explain_failure(output.status.code(), &String::from_utf8_lossy(&output.stderr)))
        }
    }

    fn boot_id(&self) -> Option<String> {
        std::fs::read_to_string("/proc/sys/kernel/random/boot_id").ok().map(|s| s.trim().to_string())
    }

    fn needs_prompt(&self) -> bool {
        !is_root()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tool_is_found_only_in_the_fixed_system_directories() {
        let dirs = ["/nonexistent-a", "/nonexistent-b"];
        assert_eq!(find_tool_in("anything", &dirs), None);
        let here = std::env::current_exe().unwrap();
        let (dir, name) = (here.parent().unwrap().to_str().unwrap(), here.file_name().unwrap().to_str().unwrap());
        assert_eq!(find_tool_in(name, &["/nonexistent-a", dir]), Some(here.clone()));
        assert!(find_tool_in(name, &["/nonexistent-a"]).is_none());
    }

    #[test]
    fn a_tool_name_with_a_path_separator_is_rejected() {
        let here = std::env::current_exe().unwrap();
        let (dir, name) = (here.parent().unwrap(), here.file_name().unwrap().to_str().unwrap());
        let sibling = dir.file_name().unwrap().to_str().unwrap();
        let escaping = format!("../{sibling}/{name}");
        assert_eq!(find_tool_in(&escaping, &[dir.to_str().unwrap()]), None);
    }

    fn spec(id: &str, ips: &[&str]) -> FirewallRuleSpec {
        FirewallRuleSpec {
            group_id: id.into(),
            description: id.into(),
            relay_ips: ips.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn no_groups_removes_the_table_without_recreating_it() {
        assert_eq!(render(&[]), "table inet deadlock_plus\ndelete table inet deadlock_plus\n");
    }

    #[test]
    fn a_group_becomes_one_drop_rule_for_tcp_and_udp() {
        let script = render(&[spec("fra", &["155.133.226.1", "155.133.226.2"])]);
        assert!(
            script.starts_with("table inet deadlock_plus\ndelete table inet deadlock_plus\ntable inet deadlock_plus {")
        );
        assert!(script.contains("type filter hook output priority 0; policy accept;"));
        assert!(script.contains(
            "ip daddr { 155.133.226.1, 155.133.226.2 } meta l4proto { tcp, udp } drop comment \"deadlock_plus_fra\""
        ));
    }

    #[test]
    fn ipv6_relays_get_their_own_rule() {
        let script = render(&[spec("fra", &["155.133.226.1", "2001:db8::1"])]);
        assert!(script.contains("ip daddr { 155.133.226.1 }"));
        assert!(script.contains("ip6 daddr { 2001:db8::1 }"));
    }

    #[test]
    fn anything_that_is_not_an_address_or_a_safe_id_is_left_out() {
        let script = render(&[
            spec("fra", &["1.1.1.1", "1.1.1.1 } drop; flush ruleset #"]),
            spec("bad\"; flush ruleset", &["2.2.2.2"]),
        ]);
        assert!(script.contains("ip daddr { 1.1.1.1 }"));
        assert!(!script.contains("flush"));
        assert!(!script.contains("2.2.2.2"));
    }

    #[test]
    fn a_group_with_no_usable_address_adds_no_rule() {
        assert_eq!(render(&[spec("fra", &["nope"])]), render(&[]));
    }

    #[test]
    fn pkexec_refusals_are_explained() {
        assert!(explain_failure(Some(126), "").contains("cancelled"));
        assert!(explain_failure(Some(127), "").contains("agent"));
        assert_eq!(explain_failure(Some(1), " Error: boom \n"), "nft failed: Error: boom");
    }
}
