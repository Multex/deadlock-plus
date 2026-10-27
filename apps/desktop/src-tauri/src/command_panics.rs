use crate::features::error::{AppError, CommonError};
use tauri::ipc::Invoke;
use tauri::Runtime;

/// Sync commands run inside WebView2's COM callback, where an unwinding panic aborts the whole app. This turns
/// such a panic into `common.internal` for that one call. Async commands are out of its reach: tauri spawns
/// their future on its own tokio task without catching, so a panic there leaves the `invoke` promise pending.
pub fn reject_panics<R: Runtime>(
    handler: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke| {
        let resolver = invoke.resolver.clone();
        run_or_on_panic(|| handler(invoke), || resolver.reject(AppError::new(CommonError::Internal)))
    }
}

fn run_or_on_panic(run: impl FnOnce() -> bool, on_panic: impl FnOnce()) -> bool {
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
}
