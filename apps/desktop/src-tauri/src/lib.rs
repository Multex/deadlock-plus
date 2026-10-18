mod features;
mod http;

use dp_network::NetworkMonitor;
use features::gc::GcService;
use features::ingest::IngestService;
use features::network;
use features::postgame::PostgameService;
use features::presence::PresenceService;
use features::server_picker::{self, ServerPickerState};
use tauri::{Manager, RunEvent};

/// When the binary was started as the root capture helper, runs it and returns its exit code. Otherwise
/// `None`, and the app should start normally.
#[cfg(unix)]
pub fn capture_helper_exit_code() -> Option<i32> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some(dp_connection::HELPER_ARG) {
        return None;
    }
    Some(args.next().map_or(2, |socket| dp_connection::run_helper(&socket)))
}

/// Privileged modes live in `deadlock-plus-helper.exe`. A service whose binPath still points at the app exe
/// would otherwise start the full GUI app as SYSTEM, so any such argv is refused (exit code 2) before Tauri starts.
pub fn privileged_argv_exit_code(argv: &[std::ffi::OsString]) -> Option<i32> {
    dp_helper::args::parse(argv).map(|_| 2)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    features::logging::install_panic_hook();
    let builder = tauri::Builder::default();
    #[cfg(debug_assertions)]
    let builder =
        builder.plugin(tauri_plugin_mcp_bridge::init_with_config(tauri_plugin_mcp_bridge::Config::localhost_only()));
    let app = builder
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            features::notifications::open_from_args(app, &args)
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(features::window_state::plugin())
        .manage(http::Http::default())
        .manage(ServerPickerState::default())
        .manage(NetworkMonitor::default())
        .manage(features::network::recording::MatchPingService::default())
        .manage(IngestService::default())
        .manage(GcService::default())
        .manage(PostgameService::default())
        .manage(features::live::LiveService::default())
        .manage(features::live::link::GameLinkService::default())
        .manage(features::game_focus::GameFocusService::default())
        .manage(features::overlay::OverlayService::default())
        .manage(features::match_found::MatchFoundService::default())
        .manage(PresenceService::default())
        .manage(dp_frames::capture::FrameCapture::default())
        .manage(features::i18n::I18nState::default())
        .manage(dp_gamedata::GameData::default())
        .manage(features::tray::CloseToTray::default())
        .manage(features::tray::MainWindowVisibility::default())
        .manage(features::tray::badges::BadgeState::default())
        .manage(features::maintenance::MaintenanceState::default())
        .manage(features::alerts::AlertsState::default())
        .manage(features::notifications::NotificationsState::default())
        .manage(features::patch_notes::PatchNotesState::default())
        .manage(dp_demos::metadata::DemoMetaCache::default())
        .manage(dp_demos::pin::PinStore::default())
        .manage(dp_kv::KvStore::default())
        .manage(features::jobs::JobsState::default())
        .manage(features::mvp::MvpService::default())
        .manage(features::gamedata::map_items::ApiMapItems::default())
        .manage(features::diagnostics::scan_job::AddonScanState::default())
        .setup(|app| {
            features::crash::begin(app.handle());
            app.manage(features::gamedata::art_cache(app.handle(), app.path().app_data_dir()?.join("game-art")));
            app.manage(std::sync::Arc::new(dp_gamedata::GameMapItems::installed(
                app.path().app_data_dir()?.join("map-items"),
            )));
            let log_dir = app.path().app_log_dir()?;
            app.handle().plugin(features::logging::plugin(&log_dir)?)?;
            features::logging::log_startup(app.handle());
            features::notifications::remember_launch(app.handle(), std::env::args());
            features::app_window::build_main(app)?;
            match features::telemetry::init(app.handle()) {
                Ok(service) => {
                    app.manage(service);
                }
                Err(e) => log::warn!("telemetry unavailable: {e}"),
            }
            dp_firewall::init(&app.path().app_data_dir()?);
            network::commands::start_monitor(app.handle(), false);
            features::tray::setup(app.handle())?;
            #[cfg(any(windows, target_os = "linux"))]
            features::context_menu::install(app.handle());
            app.state::<features::live::link::GameLinkService>().start(app.handle());
            app.state::<features::overlay::OverlayService>().start(app.handle());
            app.state::<features::game_focus::GameFocusService>().start(app.handle());
            app.state::<features::match_found::MatchFoundService>().start(app.handle());
            app.state::<PostgameService>().start(app.handle());
            features::maintenance::start(app.handle());
            features::presence::start(app.handle());
            features::jobs::start(app.handle());
            features::alerts::start(app.handle());
            features::patch_notes::start(app.handle());
            features::match_history::start(app.handle());
            features::mvp::start(app.handle());
            server_picker::start(app.handle());
            Ok(())
        })
        .on_window_event(features::tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            server_picker::commands::get_game_definitions,
            server_picker::commands::fetch_server_groups,
            server_picker::commands::ping_server_groups,
            server_picker::commands::block_server_groups,
            server_picker::commands::unblock_server_groups,
            server_picker::commands::list_blocked_group_ids,
            server_picker::commands::sync_server_blocks,
            server_picker::commands::firewall_capability,
            server_picker::commands::detect_external_blocks,
            server_picker::commands::import_external_blocks,
            network::commands::start_network_monitor,
            network::commands::network_snapshot,
            network::commands::network_history,
            network::commands::network_poll,
            network::commands::network_history_range,
            network::commands::network_history_points,
            network::commands::match_ping_points,
            network::commands::engine_ping_latest,
            features::ingest::commands::set_ingest_enabled,
            features::ingest::commands::ingest_status,
            features::presence::commands::set_presence_settings,
            features::presence::commands::presence_status,
            features::presence::commands::set_presence_art,
            features::presence::commands::presence_config,
            features::presence::commands::set_presence_config,
            features::presence::commands::presence_defaults,
            features::presence::commands::presence_layout,
            features::presence::commands::presence_placeholders,
            features::presence::commands::export_presence_config,
            features::presence::commands::import_presence_config,
            features::presence::commands::presence_preview,
            features::gc::commands::set_gc_recovery_enabled,
            features::gc::commands::gc_status,
            features::gc::commands::recover_own_matches,
            features::gc::commands::cancel_own_match_recovery,
            features::live::commands::get_live_state,
            features::live::commands::get_live_match,
            features::postgame::commands::get_postgame_matches,
            features::postgame::commands::reconcile_postgame_matches,
            features::postgame::commands::get_postgame_detail,
            features::gamedata::commands::game_heroes,
            features::gamedata::commands::game_items,
            features::gamedata::commands::game_accolades,
            features::gamedata::commands::game_hero_art,
            features::gamedata::commands::game_rank_art,
            features::gamedata::commands::game_ability_art,
            features::gamedata::commands::game_item_art,
            features::gamedata::commands::game_minimap_art,
            features::gamedata::commands::game_minimap_icons,
            features::gamedata::commands::release_old_game_art,
            features::gamedata::commands::game_map_items,
            features::steam_account::commands::current_steam_account,
            features::steam_account::commands::local_steam_account_ids,
            features::voice_bans::commands::is_game_running,
            features::voice_bans::commands::read_voice_ban,
            features::voice_bans::commands::write_voice_ban,
            features::demos::commands::list_demos,
            features::demos::commands::reveal_demo,
            features::demos::commands::open_replays_dir,
            features::demos::commands::delete_preview,
            features::demos::commands::delete_demos,
            features::demos::metadata::commands::demo_metadata,
            features::demos::pin::commands::list_pinned,
            features::demos::cleanup::commands::list_cleanup_rules,
            features::demos::cleanup::commands::save_cleanup_rules,
            features::demos::cleanup::commands::cleanup_matches,
            features::demos::pin::commands::set_pinned,
            features::storage::commands::storage_entries,
            features::storage::commands::storage_entry_stats,
            features::storage::commands::storage_reveal,
            features::storage::commands::storage_clear,
            features::match_history::commands::match_detail_cache_read,
            features::match_history::commands::match_detail_cache_write,
            features::mvp::commands::mvp_grades,
            features::mvp::commands::mvp_grade_match,
            features::about::commands::app_info,
            features::about::commands::changelog,
            features::logging::commands::read_logs,
            features::logging::commands::export_logs,
            features::logging::commands::open_log_dir,
            features::crash::commands::pending_crash,
            features::crash::commands::write_crash_bundle,
            features::crash::commands::reveal_crash_bundle,
            features::crash::commands::open_crash_issue,
            features::crash::commands::dismiss_crash,
            features::crash::commands::report_webview_crash,
            features::telemetry::commands::set_telemetry_settings,
            features::telemetry::commands::track_feature,
            features::telemetry::commands::track_discord_invite,
            features::telemetry::commands::track_update_shown,
            features::telemetry::commands::track_update_install_clicked,
            features::telemetry::commands::reset_telemetry_id,
            features::autostart::commands::autostart_status,
            features::autostart::commands::set_autostart,
            features::i18n::commands::set_language,
            features::tray::commands::set_close_to_tray,
            features::app_window::commands::set_ui_scale,
            features::app_window::commands::set_open_on_game_start,
            features::app_window::commands::restart_app,
            features::tray::commands::main_window_visible,
            features::tray::commands::launched_hidden,
            features::tray::commands::frontend_ready,
            features::tray::badges::commands::set_update_badge,
            features::maintenance::commands::set_maintenance_schedule,
            features::maintenance::commands::next_maintenance,
            features::alerts::commands::set_alerts_enabled,
            features::alerts::commands::list_alerts,
            features::alerts::commands::refresh_alerts,
            features::alerts::commands::mark_alerts_read,
            features::notifications::commands::list_notifications,
            features::notifications::commands::mark_notifications_read,
            features::notifications::commands::mark_notification_read,
            features::notifications::commands::take_launch_route,
            features::notifications::commands::notify_break_reminder,
            features::notifications::commands::set_notification_settings,
            features::overlay::commands::set_overlay_settings,
            features::overlay::commands::show_overlay_test,
            features::overlay::commands::overlay_status,
            features::patch_notes::commands::search_patch_notes,
            features::jobs::commands::jobs_snapshot,
            features::jobs::commands::cancel_job,
            features::jobs::commands::set_job_policy,
            features::jobs::commands::set_job_enabled,
            features::jobs::commands::set_all_jobs_enabled,
            features::jobs::commands::force_run_job,
            features::patch_notes::commands::get_patch_notes,
            features::kv::commands::kv_get,
            features::kv::commands::kv_set,
            features::kv::commands::kv_delete,
            features::export::commands::save_text_file,
            features::export::commands::save_binary_file,
            features::support::commands::build_support_report,
            features::ptrace::commands::ptrace_status,
            features::ptrace::commands::fix_ptrace,
            features::admin_access::commands::admin_access_status,
            features::admin_access::commands::allow_admin_access,
            features::admin_access::commands::remove_admin_access,
            features::diagnostics::commands::start_addon_scan,
            features::diagnostics::commands::addon_scan_report,
            features::diagnostics::frames::commands::start_frame_capture,
            features::diagnostics::frames::commands::frame_capture_status,
            features::diagnostics::frames::commands::stop_frame_capture,
            features::diagnostics::frames::commands::frame_layer_status,
            features::diagnostics::frames::commands::install_frame_layer,
            features::diagnostics::frames::commands::uninstall_frame_layer,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            log::info!("Deadlock+ exiting");
            features::crash::end();
            if let Some(telemetry) = handle.try_state::<features::telemetry::TelemetryService>() {
                telemetry.shutdown(&handle.state::<http::Http>().0);
            }
            handle.state::<NetworkMonitor>().stop();
            handle.state::<IngestService>().stop();
            handle.state::<GcService>().stop();
            handle.state::<PostgameService>().stop();
            handle.state::<PresenceService>().stop();
            handle.state::<features::match_found::MatchFoundService>().stop();
            handle.state::<features::live::link::GameLinkService>().stop();
            handle.state::<features::game_focus::GameFocusService>().stop();
            handle.state::<dp_frames::capture::FrameCapture>().stop();
            log::logger().flush();
        }
    });
}

#[cfg(test)]
mod privileged_argv_tests {
    use super::privileged_argv_exit_code;
    use std::ffi::OsString;

    fn argv(parts: &[&str]) -> Vec<OsString> {
        parts.iter().map(OsString::from).collect()
    }

    #[test]
    fn service_launch_is_refused() {
        assert_eq!(privileged_argv_exit_code(&argv(&["app.exe", "--service"])), Some(2));
    }

    #[test]
    fn helper_launch_is_refused_valid_or_not() {
        assert_eq!(privileged_argv_exit_code(&argv(&["app.exe", "--privileged-helper"])), Some(2));
        let pipe = dp_helper::args::helper_pipe_name(7, 1);
        let ok = argv(&["app.exe", "--privileged-helper", &pipe, "7"]);
        assert_eq!(privileged_argv_exit_code(&ok), Some(2));
    }

    #[test]
    fn ordinary_launches_pass() {
        assert_eq!(privileged_argv_exit_code(&argv(&["app.exe"])), None);
        assert_eq!(privileged_argv_exit_code(&argv(&["app.exe", "deadlockplus://match/1"])), None);
        assert_eq!(privileged_argv_exit_code(&[]), None);
    }
}
