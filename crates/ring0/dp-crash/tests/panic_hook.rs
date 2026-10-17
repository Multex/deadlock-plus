use dp_crash::{list_markers, record_panic, CrashContext, CrashKind};

#[test]
fn a_hook_built_on_record_panic_leaves_a_marker_behind() {
    let dir = std::env::temp_dir().join(format!("dp-crash-hook-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let ctx = CrashContext { dir: dir.clone(), version: "0.5.0".into(), os: "Test OS".into(), dev: false };

    std::panic::set_hook(Box::new(move |info| {
        let _ = record_panic(&ctx, &info.to_string(), &std::backtrace::Backtrace::force_capture().to_string());
    }));
    let result = std::panic::catch_unwind(|| panic!("the sky fell"));
    let _ = std::panic::take_hook();

    assert!(result.is_err());
    let markers = list_markers(&dir);
    assert_eq!(markers.len(), 1);
    assert_eq!(markers[0].1.kind, CrashKind::Panic);
    assert!(markers[0].1.message.contains("the sky fell"));
    assert!(markers[0].1.backtrace.is_some());
    let _ = std::fs::remove_dir_all(&dir);
}
