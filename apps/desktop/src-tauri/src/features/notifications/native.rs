use tauri::AppHandle;

pub struct Toast {
    pub id: String,
    pub title: String,
    pub body: String,
    #[cfg_attr(not(windows), allow(dead_code, reason = "only a Windows toast carries a launch argument"))]
    pub route: Option<&'static str>,
    /// Label of the click action on Linux, where some notification servers show it as a button.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code, reason = "a Windows toast is clickable without an action"))]
    pub action_label: String,
}

#[cfg(windows)]
pub fn show(app: &AppHandle, toast: Toast) {
    if let Err(e) = windows_toast::show(app, toast) {
        log::warn!("could not show the notification: {e}");
    }
}

#[cfg(windows)]
mod windows_toast {
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use dp_sync::LockExt;
    use tauri::AppHandle;
    use windows::core::{IInspectable, Interface, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{ToastActivatedEventArgs, ToastNotification, ToastNotificationManager};

    use super::Toast;
    use crate::features::notifications::click::{launch_url, parse_launch, toast_app_id, toast_xml};

    /// A click in Action Center while the app runs may only reach the `Activated` handler while the
    /// `ToastNotification` object is alive, so the most recent ones are kept.
    const KEEP: usize = 20;

    static RECENT: Mutex<VecDeque<ToastNotification>> = Mutex::new(VecDeque::new());

    pub fn show(app: &AppHandle, toast: Toast) -> windows::core::Result<()> {
        let doc = XmlDocument::new()?;
        let launch = toast.route.and_then(|route| launch_url(route, &toast.id));
        doc.LoadXml(&HSTRING::from(toast_xml(&toast.title, &toast.body, launch.as_deref())))?;
        let notification = ToastNotification::CreateToastNotification(&doc)?;
        notification.Activated(&on_activated(app.clone()))?;

        let exe_dir = tauri::utils::platform::current_exe().ok().and_then(|exe| exe.parent().map(ToOwned::to_owned));
        let app_id = toast_app_id(exe_dir.as_deref().unwrap_or(std::path::Path::new("")), &app.config().identifier);
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?.Show(&notification)?;

        let mut recent = RECENT.lock_or_recover();
        recent.push_back(notification);
        while recent.len() > KEEP {
            recent.pop_front();
        }
        Ok(())
    }

    fn on_activated(app: AppHandle) -> TypedEventHandler<ToastNotification, IInspectable> {
        TypedEventHandler::new(move |_: &Option<ToastNotification>, args: &Option<IInspectable>| {
            let launch = args
                .as_ref()
                .and_then(|a| a.cast::<ToastActivatedEventArgs>().ok())
                .and_then(|a| a.Arguments().ok())
                .and_then(|a| parse_launch(&a.to_string_lossy()));
            match launch {
                Some(launch) => crate::features::notifications::open(&app, &launch.id),
                None => crate::features::tray::show_main(&app),
            }
            Ok(())
        })
    }
}

#[cfg(target_os = "linux")]
pub fn show(app: &AppHandle, toast: Toast) {
    use std::sync::OnceLock;

    use notify_rust::{Notification, NotificationResponse};

    /// Servers without the `actions` capability never report a click, so the toast is shown without one.
    static CLICKABLE: OnceLock<bool> = OnceLock::new();

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let clickable = match CLICKABLE.get() {
            Some(&known) => known,
            None => {
                let probed = tauri::async_runtime::spawn_blocking(notify_rust::get_capabilities)
                    .await
                    .ok()
                    .and_then(Result::ok)
                    .is_some_and(|caps| caps.iter().any(|c| c == "actions"));
                *CLICKABLE.get_or_init(|| probed)
            }
        };
        let mut notification = Notification::new();
        notification.summary(&toast.title).body(&toast.body).auto_icon();
        if clickable {
            notification.action("default", &toast.action_label);
        }
        let handle = match notification.show_async().await {
            Ok(handle) => handle,
            Err(e) => {
                log::warn!("could not show the notification: {e}");
                return;
            }
        };
        if !clickable {
            return;
        }
        let mut clicked = false;
        handle
            .wait_for_action_async(|response| {
                clicked = match response {
                    NotificationResponse::Default => true,
                    NotificationResponse::Action(action) => action == "default",
                    _ => false,
                };
            })
            .await;
        if clicked {
            crate::features::notifications::open(&app, &toast.id);
        }
    });
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn show(app: &AppHandle, toast: Toast) {
    use tauri_plugin_notification::NotificationExt;

    if let Err(e) = app.notification().builder().title(toast.title).body(toast.body).show() {
        log::warn!("could not show the notification: {e}");
    }
}
