# dp-firewall

Blocks outbound TCP and UDP to groups of relay IP addresses. It is ring 1 because it drives the host firewall.

## Public API

- `FirewallRuleSpec` holds `group_id`, `description` and `relay_ips`. It derives `Serialize` and `Deserialize`.
- `SUPPORTED` says whether this platform has a backend.
- `init(dir)` sets the folder where the Linux backend keeps their state file. It does nothing on Windows.
- `block_groups(specs)` adds or replaces the block for each group.
- `unblock_groups(group_ids)` removes the blocks for those groups.
- `list_blocked(group_ids)` returns the subset of `group_ids` that is currently blocked.
- `refresh_stale_groups(specs)` corrects groups that are already blocked when their IPs changed. It returns a `RefreshReport` with `updated` and `failed` lists. It never blocks a new group.
- `read_block_rules(names)` returns enabled outbound block rules by exact name as `ExistingBlockRule` values with `name` and `remote_ips`.
- `remove_rules_by_name(names)` deletes rules by name.
- `validate::validate_group_id(id)` and `validate::validate_block_request(id, description, relay_ips)` return `Result<(), String>`. Block requests from the web view and from sync go through them first.

## Dependencies

- `dp-atomic` and `dp-sync`
- `serde`, `serde_json`, `log`
- `windows` on Windows only

## Platform behaviour

- Windows uses the Windows Firewall COM API. Each group gets two outbound block rules, `deadlock_plus_<id>_tcp` and `deadlock_plus_<id>_udp`. The process must be elevated.
- Linux owns one nftables table, `deadlock_plus`, and replaces it whole on each change through `pkexec`.
- Other platforms get a stub. `SUPPORTED` is false, `block_groups` and `unblock_groups` return an error, and the read functions return empty results.
- `read_block_rules` and `remove_rules_by_name` do nothing on Linux. They exist for Windows Firewall rules made by other tools.

## Gotchas

- `validate_block_request` limits ids to 48 characters of `[A-Za-z0-9_.-]`, descriptions to 200 bytes without control characters, and lists to 1 through 256 addresses. It refuses unspecified, loopback, private, link-local, multicast and broadcast addresses, and IPv6 unique-local addresses, because a block on those would cut the machine off its own network. It cannot tell a public address that is not a relay.
- Rules name TCP and UDP and not "any", so ICMP stays open and ping still works against a blocked region.
- The Linux backend cannot query the firewall without root. They record the blocked set in `firewall-blocks.json` and reapply the whole ruleset on every change. `list_blocked` reads that file, not the kernel.
- Kernel rules do not survive a reboot, so the state file is ignored when its boot id differs from the current one.
- A group id outside `[A-Za-z0-9_.-]` is skipped when the nft script is rendered.
- If the rules apply but the state file cannot be written, the error says they may show as unblocked.
- The Windows backend also removes a legacy `deadlock_plus_<id>` rule that blocked every protocol. A `WRITE_LOCK` serialises writes so a background refresh cannot recreate a rule the user just removed.
- Do not rename the `deadlock_plus_` prefix. Existing rules on users' machines use it.

## Testing

```
cargo test -p dp-firewall
```

The nft, pf and ruleset modules compile on every host, so their tests run on Windows too. The tests do not touch the real firewall.
