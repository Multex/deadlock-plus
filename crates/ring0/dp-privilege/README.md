# dp-privilege

Decisions around asking the user for administrator rights. It is ring 0 because it uses only `std` and makes no OS calls, so every rule is testable on every host.

## Public API

- `Outcome` is `Applied`, `Cancelled` or `Failed(String)`.
- `pick_pkexec` finds `pkexec` in a fixed list of absolute paths, using a caller-supplied `exists` check.
- `pkexec_exit` maps a `pkexec` exit code (or a signal kill) to an `Outcome`.
- `runas_result` maps the Win32 error after `ShellExecuteExW` with the `runas` verb to an `Outcome`.
- `may_prompt` says whether a privilege prompt may open: only after a click on Allow or Always allow, and never in a match.

## Dependencies

None. The crate has no workspace or external dependencies and no platform-specific code.

## Gotchas

- `pick_pkexec` never searches `PATH`, so a hijacked `PATH` cannot choose the program that gets root.
- 126 means the prompt was dismissed or refused. The crate cannot tell the two apart.
- `runas_result` takes `None` for success. Pass `Some(GetLastError())` only when the call failed.

## Testing

```
cargo test -p dp-privilege
```
