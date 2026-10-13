# dp-frames

Frame time capture for the game. On Windows it records the DXGI present events of the game process through an ETW session. On Linux it reads the present timestamps that the Vulkan layer in `dp-frames-layer` writes to disk. Either way the timestamps become the same frame time statistics. It is ring 1 because it talks to a Windows tracing API, process and window state and the Vulkan loader's layer folders. It knows nothing about the app.

## Public API

- `FrameCapture` is the handle. Build one with `FrameCapture::default()`.
- `FrameCapture::start(is_game)` starts the trace and two polling threads. `is_game` is `fn(&OsStr) -> bool` and receives a process name. The caller supplies it, so this crate does not depend on `dp-game`. A second `start` while running does nothing.
- `FrameCapture::status()` returns a `CaptureStatus` for the running session, or the default when idle.
- `FrameCapture::stop()` ends the session and returns `FrameStats`.
- `FrameStats::from_segments(segments, ticks_per_second)` computes the statistics from runs of ascending timestamps.
- `split_focused(timestamps, unfocused)` drops frames inside unfocused intervals and splits the rest into segments.
- `recent_frametimes_ms(timestamps, count, ticks_per_second)` returns the newest `count` frame times, oldest first.
- `CaptureState` is `Idle`, `WaitingForGame`, `Capturing` or `Failed`.
- `layer_capture::LayerCapture` tails the layer's files. `FrameCapture` on Linux wraps it. `layer_capture::FrameLog` parses the bytes and groups presents by swapchain.
- `layer_install` renders the layer manifest and installs, removes and inspects it: `manifest_json`, `install`, `uninstall`, `status`, `find_library`. `LAUNCH_OPTION` is the Steam launch option string. `LayerStatus` is exported to TypeScript.

TypeScript types exported to `packages/ipc-types/src`: `FrameStats`, `FrameSpike`, `CaptureStatus`, `CaptureState` and `LayerStatus`.

## Dependencies

- `dp-sync`, `dp-atomic`, `dp-frames-wire`
- `log`, `serde`, `serde_json`, `ts-rs`
- Windows only: `ferrisetw`, `sysinfo`, `windows`

## Platform behaviour

- On Windows, `capture.rs` opens an ETW user trace named `DeadlockPlusFrames` on the DXGI provider and counts event id `0x2a` (present start) from the game process. Starting a trace needs administrator rights. Without them the status becomes `Failed` with an error.
- On Linux, `capture_linux.rs` starts a thread that follows the newest `<pid>.dpf` file in `<data home>/deadlock-plus/frames`. The layer is loaded only into the game, so `is_game` is ignored. The manifest goes in `<data home>/vulkan/implicit_layer.d/`, and the library is copied to `<data home>/deadlock-plus/layer/`.
- On any other platform, `capture_stub.rs` provides the same types and methods. `start` does nothing, `status` returns the default and `stop` returns empty `FrameStats`. The statistics functions work everywhere.

## Gotchas

- Start clears a stale session first. ETW sessions outlive a crashed process, so the trace thread runs `logman stop DeadlockPlusFrames -ets` before it starts.
- A thread finds the game process id once a second with `is_game`. Until it finds one, the state is `WaitingForGame`. Present events from other processes are only counted in `other_process_events`. A nonzero count with zero `frames` means the game does not present through DXGI.
- A thread polls the foreground window every 50 ms. Frames while the game is in the background are dropped, and so are frames within 250 ms of each side of that interval. The background time is reported as `background_ms`, and no gap between segments counts as a frame.
- The capture keeps at most 1,000,000 frames. After that it sets `truncated` and discards new events.
- `recent_frametimes_ms` in the status covers the newest 300 frames.
- Timestamps are 100 ns FILETIME ticks, so `ticks_per_second` is 10,000,000. A rate of 0 returns empty statistics instead of dividing by zero.
- Percentiles use the nearest-rank method. `low_1pct_fps` and `low_01pct_fps` are 1000 divided by the p99 and p99.9 frame time.
- A frame is a spike when its frame time is above the larger of 2.5 times the median and 33 ms.
- Segments with fewer than two timestamps produce no frames.
- On Linux the layer knows nothing about window focus. `game_focused` is always true and `background_ms` is 0, so time spent tabbed out shows as long frames.
- A layer file that exists when capture starts is read from its end. A file that appears later is read from its start. The capture switches to a newer file only while it has no frames.
- The swapchain with the most presents is the game's. Presents on other swapchains count as `other_process_events`.
- Layer timestamps are `CLOCK_MONOTONIC` nanoseconds, so `ticks_per_second` is 1,000,000,000 there. Timestamps are sorted before the statistics run.
- Install copies the library by rename, so a running game keeps its old mapping.

## Testing

```
cargo test -p dp-frames
```

The tests cover the statistics, spike detection and focus splitting on synthetic timestamps, the layer file tail against temporary folders, and the manifest and install logic. They open no trace, need no administrator rights and run on any host.
