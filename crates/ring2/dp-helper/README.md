# dp-helper

The privileged server that runs firewall writes and ETW captures for Deadlock+ on Windows when the app itself is not elevated. One server, two launch modes: a short-lived helper started through UAC ("Allow"), or an on-demand service ("Always allow"). While the app runs elevated, every call stays in process and nothing here touches the service, a pipe or UAC.

## Public API

App side:

- `routed` is the app's single entry point for privileged work: firewall writes, the network and frame traces, `allow(always)` and `revoke()`. `refresh_stale_groups`, `start_net` and `start_frames` have the shapes of `dp_server_picker::sync::Refresh`, `dp_connection::Start` and `dp_frames::capture::PresentSource`, so callers pass them as function pointers. Elevated: in process. Otherwise: the approved service, else a running helper, else `Routed::NeedsPermission`. Only `allow` and a network trace started with `prompt: true` launch UAC.
- `client::Session` is the app's end of the one multiplexed connection: a demux thread, one `call` at a time, net and frame handlers, and a fast failure when the server exits.
- `service_client` connects to the service and checks that the pipe is served by the service's own PID. `helper_client` starts the UAC helper on a random, admins-only pipe and accepts only the launched process.

Server side:

- `helper_main::run` and `service_main::run` are the two launch modes, picked by `args::parse` from `--privileged-helper <pipe> <app pid>` or `--service`. The helper checks that the pipe is served by the app's PID and acts for the app user's SID. The service accepts approved accounts through `listener::listen`.
- `serve::serve` is the request loop: capped line reads, `op::validate`, mode rules (Approve only in the helper, Revoke only in the service), then `dispatch::exec`.
- `dispatch::exec` runs firewall ops, starts at most one trace of each kind per server ("busy" otherwise), and handles Approve (installs or updates the service, only from an exe under Program Files) and Revoke (removes the caller; the last one deletes the service).
- `trace` streams the caller's own `deadlock.exe` packets (`dp_connection::wire` lines) and frames (`dp_frames::line` lines) over the connection.
- `relays::RelayCache` keeps the Valve relay set; a refetch happens at most every 10 minutes, and only when a request names an unknown address.
- `logfile` writes `%ProgramData%\Deadlock+\helper.log` (1 MiB plus one rotated file).

Shared rules:

- `op::Op` and `op::Reply` are the wire format: one JSON object per line. Lines over `MAX_LINE_LEN`, embedded newlines, non-object JSON, unknown ops and unknown fields are refused. `Approve` and `Revoke` carry no SID and the trace ops carry no pid: the server takes the caller's SID from the pipe and finds `deadlock.exe` itself. `stream::classify` sorts incoming lines into replies, packets and frame lines.
- `op::validate(op, relays)` re-checks every group with `dp_firewall::validate`; every relay address must be in the relay list the server fetched itself. External rule names must match a known other tool's prefix. Lists are non-empty and capped.
- `access` builds the pipe and service DACLs from validated SIDs and holds `ApprovedSids` (stored by `store` as REG_MULTI_SZ under the service's `Parameters` key). `access::server_is_expected` never accepts PID 0.
- `idle::should_exit`: at once if the app the helper serves has exited, never while a capture runs, else after `IDLE_TIMEOUT` (5 minutes) without a request.
- `route::route` is the routing decision as a pure function.

## Dependencies

- `dp-connection`, `dp-elevation`, `dp-firewall`, `dp-frames`, `dp-game`, `dp-privilege`, and `dp-server-picker` (a same-ring edge on the allowlist: the server checks addresses against Valve's relay list itself)
- `serde`, `serde_json`, `log`, `reqwest`, `tokio`
- `windows` on Windows only

Everything outside `access`, `args`, `client`, `idle`, `logfile`, `op`, `relays`, `route`, `serve` and `stream` is Windows only. The crate does not build for musl, because `dp-server-picker` pulls in `ring`.

## Gotchas

- Windows applies only the first pipe instance's security descriptor to the whole pipe. An account approved while the service is running is refused at the pipe until the service restarts, so `routed` falls back to the helper session in that case. Revoking stays immediate, because every connection's SID is checked against the current list.
- The listener always creates the next pipe instance before it hands a connected one off, so the pipe name is never free for another process to claim.
- Pipes use overlapped I/O: a synchronous handle would block a write behind a read pending on the same end.
- Paths that decide what runs as SYSTEM (Program Files, ProgramData) come from HKLM, never from the environment, which the user controls.
- The log folder is refused unless SYSTEM or Administrators own it, it is not a reparse point, and the log file has one link. Users can create folders in ProgramData, so the installer creates this one with a protected DACL.
- The ETW session names are fixed. Tests never start a real trace: it would stop the session of a running Deadlock+.
- SIDs are compared as text. Lowercase or zero-padded spellings are rejected instead of normalised.
- The PID checks only add to the SID check. A PID can be reused after its process exits.
