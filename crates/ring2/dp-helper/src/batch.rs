use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use crate::serve::{send, Out};

/// Bounds memory while the pipe is stalled; lines past it are dropped rather than queued without limit.
pub const MAX_PENDING_LINES: usize = 4096;

#[derive(Default)]
pub struct LineBatch {
    pending: String,
    lines: usize,
}

impl LineBatch {
    /// Returns false when the line was dropped because the batch is full.
    pub fn push(&mut self, line: &str) -> bool {
        if self.lines >= MAX_PENDING_LINES {
            return false;
        }
        self.pending.push_str(line);
        self.lines += 1;
        true
    }

    pub fn take(&mut self) -> Option<String> {
        if self.lines == 0 {
            return None;
        }
        self.lines = 0;
        Some(std::mem::take(&mut self.pending))
    }
}

/// Writes the batch every `every`, and once more after `on_stop` when the returned sender fires or drops. The trace
/// callback only appends to the batch, so it never waits on the pipe.
pub fn spawn_flusher(
    batch: Arc<Mutex<LineBatch>>,
    out: Out,
    every: Duration,
    on_stop: impl FnOnce() + Send + 'static,
) -> Sender<()> {
    let (stop, stopped) = mpsc::channel::<()>();
    thread::Builder::new()
        .name("trace-lines".into())
        .spawn(move || {
            let mut on_stop = Some(on_stop);
            loop {
                let stopping = !matches!(stopped.recv_timeout(every), Err(RecvTimeoutError::Timeout));
                if stopping {
                    if let Some(on_stop) = on_stop.take() {
                        on_stop();
                    }
                }
                let lines = batch.lock().unwrap_or_else(PoisonError::into_inner).take();
                if let Some(lines) = lines {
                    send(&out, &lines);
                }
                if stopping {
                    return;
                }
            }
        })
        .expect("spawn thread");
    stop
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::Instant;

    #[derive(Default)]
    struct Recorded {
        bytes: Vec<u8>,
        writes: usize,
        flushes: usize,
    }

    struct FakePipe(Arc<Mutex<Recorded>>);

    impl Write for FakePipe {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            let mut r = self.0.lock().unwrap();
            r.bytes.extend_from_slice(buf);
            r.writes += 1;
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            self.0.lock().unwrap().flushes += 1;
            Ok(())
        }
    }

    fn fake_out() -> (Out, Arc<Mutex<Recorded>>) {
        let recorded = Arc::new(Mutex::new(Recorded::default()));
        (Arc::new(Mutex::new(FakePipe(recorded.clone()))), recorded)
    }

    fn text(recorded: &Arc<Mutex<Recorded>>) -> String {
        String::from_utf8(recorded.lock().unwrap().bytes.clone()).unwrap()
    }

    #[test]
    fn lines_come_out_in_order_and_the_batch_empties() {
        let mut batch = LineBatch::default();
        assert!(batch.push("P a\n"));
        assert!(batch.push("P b\n"));
        assert_eq!(batch.take().as_deref(), Some("P a\nP b\n"));
        assert_eq!(batch.take(), None);
    }

    #[test]
    fn a_full_batch_drops_new_lines_until_taken() {
        let mut batch = LineBatch::default();
        for _ in 0..MAX_PENDING_LINES {
            assert!(batch.push("P x\n"));
        }
        assert!(!batch.push("P late\n"));
        assert_eq!(batch.take().unwrap().lines().count(), MAX_PENDING_LINES);
        assert!(batch.push("P next\n"));
    }

    #[test]
    fn stopping_runs_on_stop_then_writes_what_is_left_in_one_flush() {
        let (out, recorded) = fake_out();
        let batch = Arc::new(Mutex::new(LineBatch::default()));
        for i in 0..50 {
            batch.lock().unwrap().push(&format!("P {i}\n"));
        }
        let (stopped_tx, stopped_rx) = mpsc::channel();
        let seen = recorded.clone();
        let stop = spawn_flusher(batch.clone(), out, Duration::from_secs(3600), move || {
            // A line the trace delivers while stopping still goes out.
            batch.lock().unwrap().push("P last\n");
            let _ = stopped_tx.send(seen.lock().unwrap().writes);
        });
        stop.send(()).unwrap();
        assert_eq!(stopped_rx.recv_timeout(Duration::from_secs(5)).unwrap(), 0, "wrote before on_stop");
        let deadline = Instant::now() + Duration::from_secs(5);
        while recorded.lock().unwrap().flushes == 0 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        let expected: String = (0..50).map(|i| format!("P {i}\n")).chain(["P last\n".to_string()]).collect();
        assert_eq!(text(&recorded), expected);
        assert_eq!(recorded.lock().unwrap().flushes, 1);
    }

    #[test]
    fn lines_are_written_on_the_tick_without_a_stop() {
        let (out, recorded) = fake_out();
        let batch = Arc::new(Mutex::new(LineBatch::default()));
        let _stop = spawn_flusher(batch.clone(), out, Duration::from_millis(10), || {});
        batch.lock().unwrap().push("P a\n");
        batch.lock().unwrap().push("P b\n");
        let deadline = Instant::now() + Duration::from_secs(5);
        while text(&recorded).len() < 8 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(text(&recorded), "P a\nP b\n");
    }

    #[test]
    fn an_empty_tick_writes_nothing() {
        let (out, recorded) = fake_out();
        let batch = Arc::new(Mutex::new(LineBatch::default()));
        let stop = spawn_flusher(batch, out, Duration::from_millis(5), || {});
        thread::sleep(Duration::from_millis(50));
        drop(stop);
        thread::sleep(Duration::from_millis(20));
        let r = recorded.lock().unwrap();
        assert_eq!((r.writes, r.flushes), (0, 0));
    }
}
