use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

/// How long startup may take to build the main window before the watch reports where it is.
pub const STARTUP_LIMIT: Duration = Duration::from_secs(15);

#[derive(Default)]
struct Shared {
    step: Mutex<Option<&'static str>>,
    finished: Condvar,
}

/// Names the startup step that has not finished when the main window is still missing after a limit. Creating
/// the WebView2 window waits on WebView2 with no timeout, so a stall there would otherwise end the log silently.
pub struct StartupWatch {
    shared: Arc<Shared>,
    thread: Option<JoinHandle<()>>,
}

impl StartupWatch {
    pub fn start(
        first_step: &'static str,
        limit: Duration,
        report: impl FnOnce(&'static str) + Send + 'static,
    ) -> Self {
        let shared = Arc::new(Shared { step: Mutex::new(Some(first_step)), finished: Condvar::new() });
        let watched = shared.clone();
        let thread = std::thread::Builder::new()
            .name("startup-watch".into())
            .spawn(move || {
                let step = watched.step.lock().unwrap_or_else(|e| e.into_inner());
                let (step, _) = watched
                    .finished
                    .wait_timeout_while(step, limit, |s| s.is_some())
                    .unwrap_or_else(|e| e.into_inner());
                let stuck = *step;
                drop(step);
                if let Some(stuck) = stuck {
                    report(stuck);
                }
            })
            .inspect_err(|e| log::warn!("could not start the startup watch: {e}"))
            .ok();
        Self { shared, thread }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<&'static str>> {
        self.shared.step.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Ignored once the watch is done, so a late step cannot revive it.
    pub fn step(&self, name: &'static str) {
        let mut step = self.lock();
        if step.is_some() {
            *step = Some(name);
        }
    }

    pub fn done(&self) {
        *self.lock() = None;
        self.shared.finished.notify_all();
    }
}

impl Drop for StartupWatch {
    fn drop(&mut self) {
        self.done();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// The watch's report in the app: a warning, flushed at once because the stall may end with the process killed.
pub fn warn_and_flush(step: &'static str) {
    log::warn!("the main window is still not built {} s after starting, at: {step}", STARTUP_LIMIT.as_secs());
    log::logger().flush();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn a_startup_that_never_finishes_reports_its_current_step() {
        let (tx, rx) = mpsc::channel();
        let watch = StartupWatch::start("first", Duration::from_millis(20), move |step| tx.send(step).unwrap());
        watch.step("building the main window");
        assert_eq!(rx.recv_timeout(Duration::from_secs(5)), Ok("building the main window"));
        drop(watch);
    }

    #[test]
    fn a_startup_that_finishes_in_time_reports_nothing() {
        let (tx, rx) = mpsc::channel();
        let watch = StartupWatch::start("first", Duration::from_millis(200), move |step| tx.send(step).unwrap());
        watch.step("building the main window");
        watch.done();
        drop(watch);
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn dropping_the_watch_counts_as_finished() {
        let (tx, rx) = mpsc::channel();
        let watch = StartupWatch::start("first", Duration::from_millis(200), move |step| tx.send(step).unwrap());
        let shared = watch.shared.clone();
        drop(watch);
        assert_eq!(*shared.step.lock().unwrap(), None);
        assert!(rx.try_recv().is_err());
    }
}
