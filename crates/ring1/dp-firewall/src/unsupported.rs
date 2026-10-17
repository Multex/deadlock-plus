use super::{ExistingBlockRule, FirewallRuleSpec, RefreshReport};

pub const SUPPORTED: bool = false;

pub fn init(_dir: &std::path::Path) {}

const UNSUPPORTED: &str = "Blocking servers is not supported on this platform yet.";

pub fn block_groups(_specs: &[FirewallRuleSpec]) -> Result<(), String> {
    Err(UNSUPPORTED.into())
}

pub fn unblock_groups(_group_ids: &[String]) -> Result<(), String> {
    Err(UNSUPPORTED.into())
}

pub fn list_blocked(_group_ids: &[String]) -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

pub fn read_block_rules(_names: &[String]) -> Result<Vec<ExistingBlockRule>, String> {
    Ok(Vec::new())
}

pub fn refresh_stale_groups(_specs: &[FirewallRuleSpec], _prompt: bool) -> Result<RefreshReport, String> {
    Ok(RefreshReport::default())
}

pub fn remove_rules_by_name(_names: &[String]) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> FirewallRuleSpec {
        FirewallRuleSpec { group_id: "fra".into(), description: "Frankfurt".into(), relay_ips: vec!["1.1.1.1".into()] }
    }

    #[test]
    fn nothing_can_be_blocked_and_the_error_says_so() {
        assert!(block_groups(&[spec()]).unwrap_err().contains("not supported"));
        assert!(unblock_groups(&["fra".into()]).is_err());
    }

    #[test]
    fn reads_report_no_rules() {
        assert!(list_blocked(&["fra".into()]).unwrap().is_empty());
        assert!(read_block_rules(&["x".into()]).unwrap().is_empty());
        let report = refresh_stale_groups(&[spec()], false).unwrap();
        assert!(report.updated.is_empty() && report.failed.is_empty());
        assert!(remove_rules_by_name(&["x".into()]).is_ok());
    }
}
