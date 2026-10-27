use crate::features::error::{AppError, CommonError};
use futures::FutureExt;
use std::any::Any;
use std::cell::Cell;
use std::future::Future;
use std::panic::AssertUnwindSafe;
use tauri::ipc::Invoke;
use tauri::Runtime;

thread_local! {
    static GUARDED_DEPTH: Cell<usize> = const { Cell::new(0) };
}

/// True while this thread runs a command body under [`guarded`] or [`reject_panics`]. The panic hook reads it:
/// such a panic becomes `common.internal` for that one call, so the app survives it and it is not a crash.
pub fn panic_is_handled() -> bool {
    GUARDED_DEPTH.with(|depth| depth.get() > 0)
}

struct InsideCommand;

impl InsideCommand {
    fn enter() -> Self {
        GUARDED_DEPTH.with(|depth| depth.set(depth.get() + 1));
        InsideCommand
    }
}

impl Drop for InsideCommand {
    fn drop(&mut self) {
        GUARDED_DEPTH.with(|depth| depth.set(depth.get() - 1));
    }
}

/// The flag is set per poll, not per future: a command future can resume on another runtime thread after any
/// `.await`, and the thread it left must not keep the flag.
async fn inside_command<F: Future>(fut: F) -> F::Output {
    let mut fut = std::pin::pin!(fut);
    std::future::poll_fn(move |cx| {
        let _inside = InsideCommand::enter();
        fut.as_mut().poll(cx)
    })
    .await
}

/// What a command answers with when its body panicked.
pub trait PanicError {
    fn from_panic() -> Self;
}

impl PanicError for AppError {
    fn from_panic() -> Self {
        AppError::new(CommonError::Internal)
    }
}

impl PanicError for String {
    fn from_panic() -> Self {
        "the command panicked".to_owned()
    }
}

/// Every async `#[tauri::command]` body runs through this (a test enforces it). Tauri spawns an async command's
/// future without catching, so a panic would leave the frontend `invoke` promise pending forever.
pub async fn guarded<T, E: PanicError>(fut: impl Future<Output = Result<T, E>>) -> Result<T, E> {
    inside_command(AssertUnwindSafe(fut).catch_unwind()).await.unwrap_or_else(|panic| {
        log_panic(panic.as_ref());
        Err(E::from_panic())
    })
}

/// [`guarded`] for an async command that cannot fail: its return type becomes `Result<T, AppError>`, which
/// serializes the same on success.
pub async fn guarded_infallible<T>(fut: impl Future<Output = T>) -> Result<T, AppError> {
    guarded(async { Ok(fut.await) }).await
}

/// `spawn_blocking` for work a command hands off. The blocking thread is not the command's own, so it would not
/// carry the handled flag and a panic there would leave a crash marker although the command answers
/// `common.internal` and the app keeps running.
pub fn spawn_blocking_guarded<R: Send + 'static>(
    work: impl FnOnce() -> R + Send + 'static,
) -> impl Future<Output = Result<R, AppError>> {
    let task = tauri::async_runtime::spawn_blocking(move || {
        let _inside = InsideCommand::enter();
        work()
    });
    async move { task.await.map_err(AppError::internal) }
}

fn log_panic(panic: &(dyn Any + Send)) {
    let message = panic
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| panic.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("a non-string payload");
    log::error!("an async command panicked: {message}");
}

/// Sync commands run inside WebView2's COM callback, where an unwinding panic aborts the whole app. This turns
/// such a panic into `common.internal` for that one call. Async commands are out of its reach (tauri spawns
/// their future on its own task), so each of those goes through [`guarded`] instead.
pub fn reject_panics<R: Runtime>(
    handler: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke| {
        let resolver = invoke.resolver.clone();
        run_or_on_panic(|| handler(invoke), || resolver.reject(AppError::new(CommonError::Internal)))
    }
}

fn run_or_on_panic(run: impl FnOnce() -> bool, on_panic: impl FnOnce()) -> bool {
    let run = || {
        let _inside = InsideCommand::enter();
        run()
    };
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(run)) {
        Ok(handled) => handled,
        Err(_) => {
            on_panic();
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::path::Path;
    use std::sync::mpsc;

    #[test]
    fn a_panicking_sync_handler_rejects_instead_of_unwinding() {
        let rejected = Cell::new(false);
        let handled = run_or_on_panic(|| panic!("command blew up"), || rejected.set(true));
        assert!(handled);
        assert!(rejected.get());
    }

    #[test]
    fn a_handler_that_returns_never_rejects() {
        let rejected = Cell::new(false);
        assert!(!run_or_on_panic(|| false, || rejected.set(true)));
        assert!(!rejected.get());
    }

    #[test]
    fn the_rejection_is_common_internal() {
        let json = serde_json::to_value(AppError::new(CommonError::Internal)).unwrap();
        assert_eq!(json, serde_json::json!({ "code": "common.internal", "params": {} }));
    }

    /// Mirrors `InvokeResolver::respond_async_serialized` in tauri 2.11: the command future is spawned on
    /// tauri's runtime and the responder only runs after it resolves. A panic ends the task first, so no
    /// response is ever sent and the frontend promise stays pending.
    #[test]
    fn an_async_command_panic_never_sends_a_response() {
        let (respond, response) = mpsc::channel::<Result<(), AppError>>();
        let task = tauri::async_runtime::spawn(async move {
            let result: Result<(), AppError> = async { panic!("command blew up") }.await;
            let _ = respond.send(result);
        });
        let outcome = tauri::async_runtime::block_on(task);
        assert!(outcome.is_err());
        assert_eq!(response.try_recv(), Err(mpsc::TryRecvError::Disconnected));
    }

    #[test]
    fn a_panicking_async_command_answers_common_internal() {
        let result: Result<(), AppError> = tauri::async_runtime::block_on(guarded(async { panic!("command blew up") }));
        let json = serde_json::to_value(result.unwrap_err()).unwrap();
        assert_eq!(json, serde_json::json!({ "code": "common.internal", "params": {} }));
    }

    #[test]
    fn a_panicking_string_error_command_still_answers() {
        let result: Result<(), String> = tauri::async_runtime::block_on(guarded(async { panic!("command blew up") }));
        assert_eq!(result, Err(String::from_panic()));
    }

    #[test]
    fn a_panicking_infallible_command_answers_common_internal() {
        let result: Result<u8, AppError> =
            tauri::async_runtime::block_on(guarded_infallible(async { panic!("command blew up") }));
        assert_eq!(result.unwrap_err().to_string(), "common.internal");
    }

    #[test]
    fn a_command_that_returns_passes_its_value_through() {
        let ok: Result<u8, AppError> = tauri::async_runtime::block_on(guarded(async { Ok(7) }));
        assert_eq!(ok.unwrap(), 7);
        let err: Result<u8, String> = tauri::async_runtime::block_on(guarded(async { Err("nope".to_owned()) }));
        assert_eq!(err, Err("nope".to_owned()));
        assert_eq!(tauri::async_runtime::block_on(guarded_infallible(async { 7 })).unwrap(), 7);
    }

    thread_local! {
        static REPORTING: Cell<bool> = const { Cell::new(false) };
        static RECORDED: Cell<bool> = const { Cell::new(false) };
    }

    /// Runs `body` with the app's panic reporting wired to a per-thread "crash recorded" flag. Other tests'
    /// threads fall through to the default hook.
    fn crash_recorded(body: impl FnOnce()) -> bool {
        static INSTALL: std::sync::Once = std::sync::Once::new();
        INSTALL.call_once(|| {
            let previous = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                if REPORTING.with(Cell::get) {
                    crate::features::logging::report_panic(&info.to_string(), "", |_, _| RECORDED.set(true));
                } else {
                    previous(info);
                }
            }));
        });
        RECORDED.set(false);
        REPORTING.set(true);
        body();
        REPORTING.set(false);
        RECORDED.get()
    }

    #[test]
    fn a_panic_inside_an_async_command_records_no_crash() {
        let recorded = crash_recorded(|| {
            let _: Result<(), AppError> = tauri::async_runtime::block_on(guarded(async { panic!("command blew up") }));
        });
        assert!(!recorded);
    }

    #[test]
    fn a_panic_inside_a_sync_command_records_no_crash() {
        let recorded = crash_recorded(|| {
            run_or_on_panic(|| panic!("command blew up"), || {});
        });
        assert!(!recorded);
    }

    #[test]
    fn a_panic_outside_a_command_records_a_crash() {
        let recorded = crash_recorded(|| {
            let _ = std::panic::catch_unwind(|| panic!("thread blew up"));
        });
        assert!(recorded);
    }

    #[test]
    fn a_panic_after_a_command_finished_records_a_crash() {
        let recorded = crash_recorded(|| {
            let _: Result<(), AppError> = tauri::async_runtime::block_on(guarded(async { Ok(()) }));
            run_or_on_panic(|| false, || {});
            let _ = std::panic::catch_unwind(|| panic!("thread blew up"));
        });
        assert!(recorded);
    }

    fn panic_and_catch() {
        let _ = std::panic::catch_unwind(|| panic!("blocking work blew up"));
    }

    #[test]
    fn a_panic_inside_guarded_blocking_work_records_no_crash() {
        let recorded = tauri::async_runtime::block_on(spawn_blocking_guarded(|| crash_recorded(panic_and_catch)));
        assert!(!recorded.unwrap());
    }

    #[test]
    fn a_panic_inside_plain_blocking_work_records_a_crash() {
        let recorded =
            tauri::async_runtime::block_on(tauri::async_runtime::spawn_blocking(|| crash_recorded(panic_and_catch)));
        assert!(recorded.unwrap());
    }

    #[test]
    fn panicking_guarded_blocking_work_answers_common_internal() {
        let result: Result<(), AppError> =
            tauri::async_runtime::block_on(spawn_blocking_guarded(|| panic!("blocking work blew up")));
        assert_eq!(serde_json::to_value(result.unwrap_err()).unwrap()["code"], "common.internal");
    }

    #[test]
    fn guarded_blocking_work_passes_its_value_through() {
        assert_eq!(tauri::async_runtime::block_on(spawn_blocking_guarded(|| 7)).unwrap(), 7);
    }

    /// Callers start the work and await other things before awaiting it, so it must not wait for the first poll.
    #[test]
    fn guarded_blocking_work_starts_before_it_is_awaited() {
        let (started_tx, started) = mpsc::channel();
        let pending = spawn_blocking_guarded(move || started_tx.send(()).unwrap());
        assert!(started.recv_timeout(std::time::Duration::from_secs(5)).is_ok());
        tauri::async_runtime::block_on(pending).unwrap();
    }

    /// A command future can resume on another worker thread after an `.await`; the flag must follow it there
    /// and must not stay set on the thread it left.
    #[test]
    fn the_handled_flag_follows_a_command_future_across_threads() {
        let (seen_tx, seen) = mpsc::channel();
        let (resume_tx, resume) = mpsc::channel::<()>();
        let mut fut = Box::pin(guarded_infallible(async move {
            seen_tx.send(panic_is_handled()).unwrap();
            futures::future::poll_fn(move |_| match resume.try_recv() {
                Ok(()) => std::task::Poll::Ready(()),
                Err(_) => std::task::Poll::Pending,
            })
            .await;
            seen_tx.send(panic_is_handled()).unwrap();
        }));
        let waker = futures::task::noop_waker();
        assert!(fut.as_mut().poll(&mut std::task::Context::from_waker(&waker)).is_pending());
        assert!(!panic_is_handled());
        resume_tx.send(()).unwrap();
        std::thread::spawn(move || {
            let waker = futures::task::noop_waker();
            assert!(fut.as_mut().poll(&mut std::task::Context::from_waker(&waker)).is_ready());
            assert!(!panic_is_handled());
        })
        .join()
        .unwrap();
        assert_eq!(seen.try_iter().collect::<Vec<_>>(), [true, true]);
    }

    /// Byte offset just past the `)` closing the parameter list that starts at or after `from`.
    fn params_end(src: &str, from: usize) -> usize {
        let open = from + src[from..].find('(').expect("fn has parameters");
        let mut depth = 0;
        for (i, c) in src[open..].char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        return open + i + 1;
                    }
                }
                _ => {}
            }
        }
        panic!("unbalanced parameter list");
    }

    /// Skips whitespace, comments and further attributes between `#[tauri::command]` and its `fn`.
    fn skip_to_item(src: &str, mut at: usize) -> usize {
        loop {
            let rest = &src[at..];
            let trimmed = rest.trim_start();
            at += rest.len() - trimmed.len();
            if trimmed.starts_with("//") {
                at += trimmed.find('\n').map_or(trimmed.len(), |n| n + 1);
            } else if trimmed.starts_with("#[") {
                at += trimmed.find("]\n").expect("attribute ends its line") + 1;
            } else {
                return at;
            }
        }
    }

    /// `(file, command)` for every async command whose body does not start with a `guarded` call.
    fn unguarded_async_commands(dir: &Path, found: &mut usize, out: &mut Vec<String>) {
        let attribute = concat!("#[tauri", "::command");
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                unguarded_async_commands(&path, found, out);
                continue;
            }
            if path.extension().is_none_or(|e| e != "rs") {
                continue;
            }
            let src = std::fs::read_to_string(&path).unwrap();
            for (at, _) in src.match_indices(attribute) {
                let attr_end = at + src[at..].find(']').unwrap() + 1;
                let item = &src[skip_to_item(&src, attr_end)..];
                let signature = item.trim_start_matches("pub(crate) ").trim_start_matches("pub ");
                let Some(after_fn) = signature.strip_prefix("async fn ") else { continue };
                *found += 1;
                let name: String = after_fn.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
                let item_at = src.len() - item.len();
                let body = &src[params_end(&src, item_at)..];
                let body = body[body.find('{').unwrap() + 1..].trim_start();
                if !body.starts_with("guarded(") && !body.starts_with("guarded_infallible(") {
                    out.push(format!("{}: {name}", path.display()));
                }
            }
        }
    }

    #[test]
    fn every_async_command_body_is_guarded() {
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let (mut found, mut missing) = (0, Vec::new());
        unguarded_async_commands(&src, &mut found, &mut missing);
        assert!(found > 100, "the scan found only {found} async commands; it no longer matches the source");
        assert!(
            missing.is_empty(),
            "wrap these async command bodies in `guarded(async move {{ .. }}).await` (or `guarded_infallible` \
             for one that cannot fail) so a panic answers `common.internal`:\n{}",
            missing.join("\n")
        );
    }
}
