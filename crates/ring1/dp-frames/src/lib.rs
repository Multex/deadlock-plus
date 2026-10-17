use serde::Serialize;
use ts_rs::TS;

pub mod layer_capture;
pub mod layer_install;
pub mod line;
mod status;

#[cfg(windows)]
pub mod capture;
#[cfg(target_os = "linux")]
#[path = "capture_linux.rs"]
pub mod capture;
#[cfg(not(any(windows, target_os = "linux")))]
#[path = "capture_stub.rs"]
pub mod capture;

const SPIKE_MEDIAN_FACTOR: f64 = 2.5;
const SPIKE_FLOOR_MS: f64 = 33.0;

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FrameSpike {
    pub at_ms: f64,
    pub frametime_ms: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FrameStats {
    pub frame_count: u32,
    pub duration_ms: f64,
    /// Time the game window was not in the foreground; those frames are left out of every other figure.
    pub background_ms: f64,
    pub avg_ms: f64,
    pub median_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
    pub p999_ms: f64,
    pub max_ms: f64,
    pub low_1pct_fps: f64,
    pub low_01pct_fps: f64,
    pub spikes: Vec<FrameSpike>,
}

impl FrameStats {
    /// Each segment is an ascending run of present timestamps. Gaps between segments are not frames.
    pub fn from_segments(segments: &[Vec<u64>], ticks_per_second: u64) -> Self {
        if ticks_per_second == 0 {
            return Self::default();
        }
        let ms_per_tick = 1000.0 / ticks_per_second as f64;
        let mut frames: Vec<(f64, f64)> = Vec::new();
        let mut duration_ms = 0.0;
        for segment in segments.iter().filter(|s| s.len() >= 2) {
            let start = segment[0];
            frames.extend(
                segment
                    .windows(2)
                    .map(|w| (duration_ms + (w[0] - start) as f64 * ms_per_tick, (w[1] - w[0]) as f64 * ms_per_tick)),
            );
            duration_ms += (segment[segment.len() - 1] - start) as f64 * ms_per_tick;
        }
        if frames.is_empty() {
            return Self::default();
        }

        let mut times: Vec<f64> = frames.iter().map(|f| f.1).collect();
        times.sort_by(|a, b| a.total_cmp(b));
        let count = times.len();
        let median_ms = if count % 2 == 1 { times[count / 2] } else { (times[count / 2 - 1] + times[count / 2]) / 2.0 };
        let p99_ms = percentile(&times, 0.99);
        let p999_ms = percentile(&times, 0.999);
        let threshold = (median_ms * SPIKE_MEDIAN_FACTOR).max(SPIKE_FLOOR_MS);

        Self {
            frame_count: count as u32,
            duration_ms,
            background_ms: 0.0,
            avg_ms: duration_ms / count as f64,
            median_ms,
            p95_ms: percentile(&times, 0.95),
            p99_ms,
            p999_ms,
            max_ms: times[count - 1],
            low_1pct_fps: fps(p99_ms),
            low_01pct_fps: fps(p999_ms),
            spikes: frames
                .iter()
                .filter(|f| f.1 > threshold)
                .map(|f| FrameSpike { at_ms: f.0, frametime_ms: f.1 })
                .collect(),
        }
    }
}

/// Drops timestamps inside any `unfocused` interval (inclusive) and starts a new segment wherever an
/// interval sits between two kept timestamps, so the background gap never counts as a frame.
pub fn split_focused(timestamps: &[u64], unfocused: &[(u64, u64)]) -> Vec<Vec<u64>> {
    let mut sorted = timestamps.to_vec();
    sorted.sort_unstable();
    let mut segments: Vec<Vec<u64>> = Vec::new();
    let mut previous: Option<u64> = None;
    for t in sorted {
        if unfocused.iter().any(|&(start, end)| t >= start && t <= end) {
            continue;
        }
        let broken = previous.is_none_or(|p| unfocused.iter().any(|&(start, end)| start > p && end < t));
        if broken {
            segments.push(Vec::new());
        }
        if let Some(current) = segments.last_mut() {
            current.push(t);
        }
        previous = Some(t);
    }
    segments
}

/// The newest `count` frametimes of an already time-ordered capture, oldest first.
pub fn recent_frametimes_ms(timestamps: &[u64], count: usize, ticks_per_second: u64) -> Vec<f32> {
    if ticks_per_second == 0 {
        return Vec::new();
    }
    let ms_per_tick = 1000.0 / ticks_per_second as f64;
    let skip = timestamps.len().saturating_sub(count + 1);
    timestamps[skip..].windows(2).map(|w| (w[1].saturating_sub(w[0]) as f64 * ms_per_tick) as f32).collect()
}

/// Nearest-rank percentile over an ascending, non-empty slice.
fn percentile(sorted: &[f64], p: f64) -> f64 {
    let rank = (p * sorted.len() as f64).ceil() as usize;
    sorted[rank.clamp(1, sorted.len()) - 1]
}

fn fps(frametime_ms: f64) -> f64 {
    if frametime_ms > 0.0 {
        1000.0 / frametime_ms
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests;
