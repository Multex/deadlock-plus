use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2ContextMenuItemCollection, ICoreWebView2ContextMenuRequestedEventArgs, ICoreWebView2Controller,
    ICoreWebView2_11, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU,
};
use webview2_com::{take_pwstr, CoTaskMemPWSTR, ContextMenuRequestedEventHandler};
use windows_core::Interface;

use super::filter::{plan, Entry, EntryKind};

const MAIN_WINDOW: &str = "main";

pub fn install(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        log::warn!("context-menu: no main window, the default menu stays");
        return;
    };
    let registered = window.with_webview(|webview| {
        if let Err(e) = register(&webview.controller()) {
            log::warn!("context-menu: not registered, the default menu stays: {e}");
        }
    });
    if let Err(e) = registered {
        log::warn!("context-menu: webview unavailable, the default menu stays: {e}");
    }
}

fn register(controller: &ICoreWebView2Controller) -> webview2_com::Result<()> {
    // SAFETY: `with_webview` runs this on the thread that owns the webview, as WebView2 requires.
    let webview = unsafe { controller.CoreWebView2() }?.cast::<ICoreWebView2_11>()?;
    let debug = cfg!(debug_assertions);
    let handler = ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
        static WARNED: AtomicBool = AtomicBool::new(false);
        if let Some(args) = args {
            if let Err(e) = trim(&args, debug) {
                if !WARNED.swap(true, Ordering::Relaxed) {
                    log::warn!("context-menu: could not trim the menu: {e}");
                }
            }
        }
        Ok(())
    }));
    let mut token = 0;
    // SAFETY: called on the webview's thread; `token` is a live out-pointer for the duration of the call.
    unsafe { webview.add_ContextMenuRequested(&handler, &mut token) }?;
    Ok(())
}

fn trim(args: &ICoreWebView2ContextMenuRequestedEventArgs, debug: bool) -> webview2_com::Result<()> {
    // SAFETY: WebView2 invokes the handler on the webview's thread with event args valid for the call.
    let items = unsafe { args.MenuItems() }?;
    let entries = read_entries(&items)?;
    let plan = plan(&entries, debug);
    if plan.empty {
        // SAFETY: as above.
        unsafe { args.SetHandled(true) }?;
        return Ok(());
    }
    for index in plan.remove.iter().rev() {
        // SAFETY: as above; `index` is below the count the entries were read with, and later indices go first.
        unsafe { items.RemoveValueAtIndex(*index as u32) }?;
    }
    Ok(())
}

fn read_entries(items: &ICoreWebView2ContextMenuItemCollection) -> webview2_com::Result<Vec<Entry>> {
    let mut count = 0;
    // SAFETY: `count` is a live out-pointer; the collection belongs to the event being handled on this thread.
    unsafe { items.Count(&mut count) }?;
    let mut entries = Vec::with_capacity(count as usize);
    for index in 0..count {
        let mut name = CoTaskMemPWSTR::default().take();
        let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND;
        // SAFETY: `index` is below `Count`, and both out-pointers are live for their calls.
        unsafe {
            let item = items.GetValueAtIndex(index)?;
            item.Name(&mut name)?;
            item.Kind(&mut kind)?;
        }
        // `Name` hands over a CoTaskMem string; `take_pwstr` copies it and frees it.
        entries.push(Entry { name: take_pwstr(name), kind: entry_kind(kind) });
    }
    Ok(entries)
}

fn entry_kind(kind: COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND) -> EntryKind {
    match kind {
        COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR => EntryKind::Separator,
        COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU => EntryKind::Submenu,
        _ => EntryKind::Item,
    }
}
