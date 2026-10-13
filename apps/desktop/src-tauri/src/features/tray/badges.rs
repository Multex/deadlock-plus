use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use ab_glyph::{Font, FontRef, GlyphId, PxScale, ScaleFont};
use tauri::image::Image;
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Manager};

use crate::features::notifications::NotificationsState;
use dp_sync::LockExt;

const MAIN_WINDOW: &str = "main";
/// Saturated enough to read clearly at icon size, since a native icon can't reach the app's CSS
/// theme tokens; close to the colors Discord/Slack use for their own status and unread badges.
const UPDATE_GREEN: [u8; 3] = [35, 197, 94];
const UNREAD_RED: [u8; 3] = [237, 66, 69];
/// Fallback overlay icon size when `GetSystemMetrics(SM_CXSMICON)` isn't available (non-Windows builds).
const DEFAULT_OVERLAY_SIZE: u32 = 16;
/// Fraction of the icon's width/height from each edge to a corner badge's center.
const CORNER_INSET: f32 = 0.26;
const UPDATE_RADIUS_FRAC: f32 = 0.20;
/// Slightly bigger than the update dot so a two-character count ("9+") still has room to breathe.
const UNREAD_RADIUS_FRAC: f32 = 0.25;

struct BaseIcon {
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

/// The update badge carries no text; the unread one carries a capped count label.
struct Badges {
    update_available: bool,
    unread_label: Option<String>,
}

#[derive(Default)]
pub struct BadgeState {
    update_available: AtomicBool,
    base: Mutex<Option<BaseIcon>>,
}

impl BadgeState {
    fn badges(&self, app: &AppHandle) -> Badges {
        let unread = app.state::<NotificationsState>().unread_count(app);
        Badges {
            update_available: self.update_available.load(Ordering::Relaxed),
            unread_label: (unread > 0).then(|| count_label(unread)),
        }
    }
}

fn count_label(n: usize) -> String {
    if n > 9 {
        "9+".into()
    } else {
        n.to_string()
    }
}

/// Captures the bundled app icon once, so every later badge draws onto a fresh copy of it instead
/// of compounding onto whatever the tray icon was last set to.
pub fn setup(app: &AppHandle) {
    let state = app.state::<BadgeState>();
    if let Some(icon) = app.default_window_icon() {
        *state.base.lock_or_recover() =
            Some(BaseIcon { rgba: icon.rgba().to_vec(), width: icon.width(), height: icon.height() });
    }
    refresh(app);
}

/// Recomputed whenever the update-available flag or the unread notification count changes. The
/// update badge always sits top-right, the unread badge (with its count) always sits bottom-right,
/// so the two never collide.
pub fn refresh(app: &AppHandle) {
    let state = app.state::<BadgeState>();
    let badges = state.badges(app);

    let tray_icon = state.base.lock_or_recover().as_ref().map(|base| tray_icon_with_badges(base, &badges));
    if let Some(icon) = tray_icon {
        if let Some(tray) = app.try_state::<TrayIcon>() {
            if let Err(e) = tray.set_icon(Some(icon)) {
                log::warn!("could not update the tray icon: {e}");
            }
        }
    }

    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let size = overlay::icon_size();
        match overlay_rgba_with_badges(&badges, size) {
            Some(rgba) => overlay::set(&window, Some((&rgba, size, size))),
            None => overlay::set(&window, None),
        }
    }
}

/// A pixel buffer plus its dimensions, so the drawing helpers don't each need their own trio of
/// `rgba`/`width`/`height` arguments.
struct Canvas<'a> {
    rgba: &'a mut [u8],
    width: u32,
    height: u32,
}

impl Canvas<'_> {
    /// Anti-aliased (soft 1px edge, blended against whatever's underneath rather than a hard
    /// binary cutoff) and lightly shaded (a soft highlight toward the upper-left, like a glossy
    /// sphere) — a flat, hard-edged fill reads as low-resolution next to a properly drawn badge.
    fn circle(&mut self, cx: f32, cy: f32, radius: f32, color: [u8; 3]) {
        let x0 = (cx - radius - 1.0).floor().max(0.0) as u32;
        let x1 = ((cx + radius + 1.0).ceil() as u32).min(self.width.saturating_sub(1));
        let y0 = (cy - radius - 1.0).floor().max(0.0) as u32;
        let y1 = ((cy + radius + 1.0).ceil() as u32).min(self.height.saturating_sub(1));
        let (hl_x, hl_y, hl_reach) = (cx - radius * 0.32, cy - radius * 0.38, radius * 1.15);
        for y in y0..=y1 {
            for x in x0..=x1 {
                let (px, py) = (x as f32 + 0.5, y as f32 + 0.5);
                let dist = ((px - cx).powi(2) + (py - cy).powi(2)).sqrt();
                let coverage = (radius - dist + 0.5).clamp(0.0, 1.0);
                if coverage <= 0.0 {
                    continue;
                }
                let hl_dist = ((px - hl_x).powi(2) + (py - hl_y).powi(2)).sqrt();
                let hl = (1.0 - hl_dist / hl_reach).clamp(0.0, 1.0) * 0.45;
                let shaded = [
                    color[0] as f32 + (255.0 - color[0] as f32) * hl,
                    color[1] as f32 + (255.0 - color[1] as f32) * hl,
                    color[2] as f32 + (255.0 - color[2] as f32) * hl,
                ];

                let idx = ((y * self.width + x) * 4) as usize;
                for (c, &channel) in shaded.iter().enumerate() {
                    self.rgba[idx + c] = (self.rgba[idx + c] as f32 * (1.0 - coverage) + channel * coverage) as u8;
                }
                self.rgba[idx + 3] = (self.rgba[idx + 3] as f32 * (1.0 - coverage) + 255.0 * coverage) as u8;
            }
        }
    }

    /// White digits centered at `(cx, cy)`, blended over whatever is already there (the badge circle).
    fn text_centered(&mut self, text: &str, cx: f32, cy: f32, px_height: f32) {
        let font = badge_font();
        let scaled = font.as_scaled(PxScale::from(px_height));

        let ids: Vec<GlyphId> = text.chars().map(|c| font.glyph_id(c)).collect();
        let mut total_advance = 0.0f32;
        for (i, &id) in ids.iter().enumerate() {
            if i > 0 {
                total_advance += scaled.kern(ids[i - 1], id);
            }
            total_advance += scaled.h_advance(id);
        }

        let start_x = cx - total_advance / 2.0;
        let baseline_y = cy + (scaled.ascent() + scaled.descent()) / 2.0;

        let (width, height) = (self.width, self.height);
        let mut x = start_x;
        for (i, &id) in ids.iter().enumerate() {
            if i > 0 {
                x += scaled.kern(ids[i - 1], id);
            }
            let glyph = id.with_scale_and_position(scaled.scale(), ab_glyph::point(x, baseline_y));
            if let Some(outline) = font.outline_glyph(glyph) {
                let bounds = outline.px_bounds();
                let rgba = &mut *self.rgba;
                outline.draw(|gx, gy, coverage| {
                    let px = bounds.min.x as i32 + gx as i32;
                    let py = bounds.min.y as i32 + gy as i32;
                    if px < 0 || py < 0 || px as u32 >= width || py as u32 >= height {
                        return;
                    }
                    let idx = ((py as u32 * width + px as u32) * 4) as usize;
                    let a = coverage.clamp(0.0, 1.0);
                    for c in 0..3 {
                        rgba[idx + c] = (rgba[idx + c] as f32 * (1.0 - a) + 255.0 * a) as u8;
                    }
                    rgba[idx + 3] = 255;
                });
            }
            x += scaled.h_advance(id);
        }
    }

    fn badge(&mut self, cx: f32, cy: f32, radius: f32, color: [u8; 3], label: Option<&str>) {
        self.circle(cx, cy, radius, color);
        if let Some(label) = label {
            // A two-character label ("9+") needs to be shorter to still fit inside the circle.
            let px_height = if label.chars().count() > 1 { radius * 1.05 } else { radius * 1.35 };
            self.text_centered(label, cx, cy, px_height);
        }
    }
}

fn badge_font() -> &'static FontRef<'static> {
    static FONT: OnceLock<FontRef<'static>> = OnceLock::new();
    FONT.get_or_init(|| {
        const BYTES: &[u8] = include_bytes!("../../../../../../packages/ui/src/fonts/valveoracle-semibold.ttf");
        FontRef::try_from_slice(BYTES).expect("bundled badge font must parse")
    })
}

/// Unread/red sits top-right (matching where the taskbar overlay badge actually lands), update/green
/// sits bottom-right, so the two stay visually separated instead of sharing a corner.
fn tray_icon_with_badges(base: &BaseIcon, badges: &Badges) -> Image<'static> {
    let mut rgba = base.rgba.clone();
    let (w, h) = (base.width as f32, base.height as f32);
    let min_dim = w.min(h);
    {
        let mut canvas = Canvas { rgba: &mut rgba, width: base.width, height: base.height };
        if let Some(label) = &badges.unread_label {
            canvas.badge(
                w * (1.0 - CORNER_INSET),
                h * CORNER_INSET,
                min_dim * UNREAD_RADIUS_FRAC,
                UNREAD_RED,
                Some(label),
            );
        }
        if badges.update_available {
            canvas.badge(
                w * (1.0 - CORNER_INSET),
                h * (1.0 - CORNER_INSET),
                min_dim * UPDATE_RADIUS_FRAC,
                UPDATE_GREEN,
                None,
            );
        }
    }
    Image::new_owned(rgba, base.width, base.height)
}

/// Unlike the tray icon (a full-size icon we corner-badge ourselves), the taskbar overlay *is*
/// already a small single badge slot that Windows anchors at the icon's bottom-right corner on its
/// own — corner-inset positioning here would just push the dot toward the edge of that already-tiny
/// slot. One active badge fills most of the slot; both active split it left/right.
fn overlay_rgba_with_badges(badges: &Badges, size: u32) -> Option<Vec<u8>> {
    let s = size as f32;
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    let mut canvas = Canvas { rgba: &mut rgba, width: size, height: size };
    match (badges.update_available, &badges.unread_label) {
        (false, None) => return None,
        (true, None) => canvas.badge(s * 0.5, s * 0.5, s * 0.42, UPDATE_GREEN, None),
        (false, Some(label)) => canvas.badge(s * 0.5, s * 0.5, s * 0.42, UNREAD_RED, Some(label)),
        (true, Some(label)) => {
            canvas.badge(s * 0.28, s * 0.5, s * 0.26, UPDATE_GREEN, None);
            canvas.badge(s * 0.72, s * 0.5, s * 0.26, UNREAD_RED, Some(label));
        }
    }
    Some(rgba)
}

/// Builds and sets the Windows taskbar overlay icon directly via `ITaskbarList4::SetOverlayIcon`,
/// instead of `tauri::WebviewWindow::set_overlay_icon`, for exact control over the icon's size and
/// pixel format. `SetOverlayIcon`'s docs call for a small icon, typically 16x16 — anything bigger
/// (confirmed live at 48x48, 32x32, and a DPI-scaled ~28x28) renders as a distorted, smeared blob
/// instead of the small badge drawn into it, regardless of which API builds the underlying `HICON`.
#[cfg(windows)]
mod overlay {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows::core::{Result as WinResult, PCWSTR};
    use windows::Win32::Foundation::{BOOL, HWND};
    use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HBITMAP};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{ITaskbarList4, TaskbarList};
    use windows::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, DestroyIcon, HICON, ICONINFO};

    /// `SetOverlayIcon`'s docs call for "a small icon, typically 16x16 pixels"; anything else and
    /// the taskbar's internal scaling visibly distorts it (confirmed live: a small circle rendered
    /// as a huge smeared blob at 48x48, identical distortion at 32x32). A fixed size rather than
    /// `GetSystemMetrics(SM_CXSMICON)`: that call's result depends on the calling thread's DPI
    /// awareness context, and `refresh` can run from a background tokio thread — confirmed live,
    /// the badge rendered at roughly 16px from one trigger and roughly 28px from another with no
    /// other change, matching a DPI-scaled result rather than a fixed 16.
    pub fn icon_size() -> u32 {
        super::DEFAULT_OVERLAY_SIZE
    }

    /// COM must be initialized on the calling thread before `CoCreateInstance` works.
    struct ComGuard(bool);

    impl ComGuard {
        fn new() -> Self {
            Self(unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok())
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }

    fn window_hwnd(window: &tauri::WebviewWindow) -> Option<HWND> {
        match window.window_handle().ok()?.as_raw() {
            RawWindowHandle::Win32(h) => Some(HWND(h.hwnd.get() as *mut core::ffi::c_void)),
            _ => None,
        }
    }

    /// `CreateBitmap`'s 32bpp color source expects premultiplied BGRA, not the straight RGBA our
    /// drawing code produces.
    fn premultiplied_bgra(rgba: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(rgba.len());
        let (pixels, _) = rgba.as_chunks::<4>();
        for &[r, g, b, a] in pixels {
            let pm = |c: u8| (c as u32 * a as u32 / 255) as u8;
            out.extend_from_slice(&[pm(b), pm(g), pm(r), a]);
        }
        out
    }

    /// All-zero contents, so exact scan-line padding doesn't matter: a true-alpha 32bpp color
    /// bitmap is enough for Windows to composite correctly, the mask just needs to exist and match
    /// the icon's size.
    fn opaque_mask(width: i32, height: i32) -> HBITMAP {
        let stride = (width.max(0) as usize).div_ceil(8).div_ceil(4) * 4;
        let bits = vec![0u8; stride * height.max(0) as usize];
        unsafe { CreateBitmap(width, height, 1, 1, Some(bits.as_ptr().cast())) }
    }

    fn build_hicon(rgba: &[u8], width: u32, height: u32) -> WinResult<HICON> {
        let bgra = premultiplied_bgra(rgba);
        let (w, h) = (width as i32, height as i32);
        let hbm_color = unsafe { CreateBitmap(w, h, 1, 32, Some(bgra.as_ptr().cast())) };
        let hbm_mask = opaque_mask(w, h);
        let info = ICONINFO { fIcon: BOOL(1), xHotspot: 0, yHotspot: 0, hbmMask: hbm_mask, hbmColor: hbm_color };
        let icon = unsafe { CreateIconIndirect(&info) };
        unsafe {
            let _ = DeleteObject(hbm_color);
            let _ = DeleteObject(hbm_mask);
        }
        icon
    }

    /// `image` is `None` to clear the overlay.
    pub fn set(window: &tauri::WebviewWindow, image: Option<(&[u8], u32, u32)>) {
        let Some(hwnd) = window_hwnd(window) else {
            log::warn!("could not get the window handle for the taskbar overlay icon");
            return;
        };
        let icon = match image {
            Some((rgba, width, height)) => match build_hicon(rgba, width, height) {
                Ok(icon) => icon,
                Err(e) => {
                    log::warn!("could not build the taskbar overlay icon: {e}");
                    return;
                }
            },
            None => HICON::default(),
        };

        let _com = ComGuard::new();
        let result: WinResult<()> = (|| unsafe {
            let taskbar: ITaskbarList4 = CoCreateInstance(&TaskbarList, None, CLSCTX_SERVER)?;
            taskbar.SetOverlayIcon(hwnd, icon, PCWSTR::null())
        })();
        if !icon.is_invalid() {
            unsafe {
                let _ = DestroyIcon(icon);
            }
        }
        if let Err(e) = result {
            log::warn!("could not update the taskbar overlay icon: {e}");
        }
    }
}

#[cfg(not(windows))]
mod overlay {
    pub fn icon_size() -> u32 {
        super::DEFAULT_OVERLAY_SIZE
    }

    pub fn set(_window: &tauri::WebviewWindow, _image: Option<(&[u8], u32, u32)>) {}
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn set_update_badge(available: bool, app: AppHandle, state: tauri::State<'_, BadgeState>) {
        state.update_available.store(available, Ordering::Relaxed);
        refresh(&app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_label_caps_at_nine() {
        assert_eq!(count_label(0), "0");
        assert_eq!(count_label(9), "9");
        assert_eq!(count_label(10), "9+");
        assert_eq!(count_label(500), "9+");
    }

    #[test]
    fn overlay_is_none_with_no_active_badge() {
        let badges = Badges { update_available: false, unread_label: None };
        assert!(overlay_rgba_with_badges(&badges, 16).is_none());
    }

    #[test]
    fn overlay_appears_for_either_badge() {
        let update_only = Badges { update_available: true, unread_label: None };
        let unread_only = Badges { update_available: false, unread_label: Some("3".into()) };
        assert!(overlay_rgba_with_badges(&update_only, 16).is_some());
        assert!(overlay_rgba_with_badges(&unread_only, 16).is_some());
    }

    #[test]
    fn a_drawn_circle_is_opaque_at_its_center_and_untouched_far_away() {
        let mut rgba = vec![0u8; (8 * 8 * 4) as usize];
        Canvas { rgba: &mut rgba, width: 8, height: 8 }.circle(4.0, 4.0, 3.0, [200, 10, 10]);
        let center = ((4 * 8 + 4) * 4) as usize;
        // The center picks up some of the highlight shading, so it's a lighter red, not the raw fill color.
        assert_eq!(rgba[center + 3], 255);
        assert!(rgba[center] > 150 && rgba[center + 1] < rgba[center] && rgba[center + 2] < rgba[center]);
        let corner = 0usize;
        assert_eq!(&rgba[corner..corner + 4], &[0, 0, 0, 0]);
    }

    /// A smoke test that the badge font actually rasterizes something onto the circle, rather
    /// than silently failing to find glyphs and leaving a plain dot.
    #[test]
    fn drawing_a_count_label_changes_pixels_inside_the_circle() {
        let size = 32;
        let mut plain = vec![0u8; (size * size * 4) as usize];
        Canvas { rgba: &mut plain, width: size, height: size }.circle(16.0, 16.0, 12.0, UNREAD_RED);
        let mut with_label = plain.clone();
        Canvas { rgba: &mut with_label, width: size, height: size }.text_centered("9+", 16.0, 16.0, 12.0);
        assert_ne!(plain, with_label);
    }
}
