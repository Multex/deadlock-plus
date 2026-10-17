use tauri::{AppHandle, Manager};
use webkit2gtk::glib::translate::IntoGlib;
use webkit2gtk::{ContextMenu, ContextMenuExt, ContextMenuItemExt, WebViewExt};

use super::filter::plan;
use super::webkit_action::entry;

const MAIN_WINDOW: &str = "main";

pub fn install(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        log::warn!("context-menu: no main window, the default menu stays");
        return;
    };
    let debug = cfg!(debug_assertions);
    let registered = window.with_webview(move |webview| {
        webview.inner().connect_context_menu(move |_, menu, _, _| trim(menu, debug));
    });
    if let Err(e) = registered {
        log::warn!("context-menu: webview unavailable, the default menu stays: {e}");
    }
}

/// Returns `true` to suppress the menu, as the `context-menu` signal expects.
fn trim(menu: &ContextMenu, debug: bool) -> bool {
    let items = menu.items();
    let entries: Vec<_> = items
        .iter()
        .map(|item| entry(item.stock_action().into_glib(), item.is_separator(), item.submenu().is_some()))
        .collect();
    let plan = plan(&entries, debug);
    if plan.empty {
        return true;
    }
    for index in plan.remove {
        menu.remove(&items[index]);
    }
    false
}
