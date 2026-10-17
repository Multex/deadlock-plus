# dp-helper

The privileged server that runs firewall writes and ETW captures for Deadlock+ on Windows when the app itself is not elevated. One server, two launch modes: a short-lived helper started through UAC ("Allow"), or an on-demand service ("Always allow").

## Public API

- `access::is_valid_sid` accepts only the canonical string SID (`S-1-<authority>-<1 to 15 sub-authorities>`, uppercase, no leading zeros). Every other function in `access` validates through it.
- `access::pipe_sddl` and `access::service_sddl` build the pipe DACL (protected, administrators full access, read and write but not pipe-instance creation per approved account) and the service DACL (the Windows default plus start and query per approved account). Both return `None` if any SID is invalid.
- `access::ApprovedSids` is the approved-account list, stored as REG_MULTI_SZ. `from_stored` drops invalid and duplicate entries; `add` and `remove` report whether the list changed. An empty list means the service deletes itself.
- `access::client_allowed` checks the impersonated pipe client's SID. `access::server_is_expected` compares the pipe server's PID with the expected one and never accepts 0.
- `idle::should_exit` decides when the server stops: at once if the app it serves has exited, never while a capture runs, else after `IDLE_TIMEOUT` (5 minutes) without a request.
- `op::Op` and `op::Reply` are the pipe's wire format: one JSON object per line (`encode`/`decode`, `encode_reply`/`decode_reply`). Lines over `MAX_LINE_LEN`, embedded newlines, non-object JSON, unknown ops and unknown fields are refused. `Approve` and `Revoke` carry no SID, and the trace ops carry no pid: the server takes the caller's SID from the pipe and finds `deadlock.exe` itself.
- `op::validate(op, relays)` re-checks every group with `dp_firewall::validate`, and every relay address must be in the relay list the server fetched itself. External rule names must match a known other tool's prefix. Lists are non-empty and capped.
- `route::route` picks where an operation runs: in process when elevated, else the approved service, else a running helper, else `NeedsPermission`. It never prompts.

## Dependencies

- `dp-firewall` and `dp-server-picker` (a same-ring edge on the allowlist: the server checks addresses against Valve's relay list itself)
- `serde`, `serde_json`

The functions above are pure. The crate does not build for musl, because `dp-server-picker` pulls in `ring`.

## Gotchas

- SIDs are compared as text. Lowercase or zero-padded spellings are rejected instead of normalised, so the stored list, the descriptors and the comparisons always see the same bytes.
- The PID checks only add to the SID check. A PID can be reused after its process exits.
