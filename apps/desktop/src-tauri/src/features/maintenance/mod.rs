use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use ts_rs::TS;

use crate::features::notifications::{self, NotificationKind};
use dp_sync::LockExt;
use dp_versioned::{self, Migration};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const DAY: u64 = 86_400;
const MAX_LEAD_MINUTES: u32 = 24 * 60;
const TICK: Duration = Duration::from_secs(30);
const STORE_FILE: &str = "maintenance.json";
const MIGRATIONS: &[Migration] = &[];

/// Valve publishes no maintenance schedule, so this is a user-editable recurring slot in UTC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename = "MaintenanceSchedule")]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub enabled: bool,
    /// 0 = Monday .. 6 = Sunday.
    pub weekday: u8,
    pub minute_of_day: u16,
    pub lead_minutes: u32,
}

impl Default for Schedule {
    fn default() -> Self {
        Self { enabled: false, weekday: 2, minute_of_day: 0, lead_minutes: 30 }
    }
}

impl Schedule {
    fn sanitized(mut self) -> Self {
        self.weekday = self.weekday.min(6);
        self.minute_of_day = self.minute_of_day.min(24 * 60 - 1);
        self.lead_minutes = self.lead_minutes.min(MAX_LEAD_MINUTES);
        self
    }
}

// 1970-01-01 was a Thursday, which is 3 in a Monday-first week.
fn weekday_of_day(day: u64) -> u8 {
    ((day + 3) % 7) as u8
}

/// The first occurrence strictly after `now` (unix seconds). Anchored to UTC, so no DST handling.
pub fn next_event(now: u64, weekday: u8, minute_of_day: u16) -> u64 {
    let today = now / DAY;
    (today..=today + 7)
        .filter(|&d| weekday_of_day(d) == weekday)
        .map(|d| d * DAY + u64::from(minute_of_day) * 60)
        .find(|&t| t > now)
        .expect("a matching weekday exists within eight days")
}

/// True once inside the lead window of `event`, and only once per event.
pub fn reminder_due(now: u64, event: u64, lead_minutes: u32, last_fired: Option<u64>) -> bool {
    last_fired != Some(event) && now + u64::from(lead_minutes) * 60 >= event && now < event
}

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Stored {
    last_fired: Option<u64>,
}

/// In-memory-only `last_fired` would re-fire the reminder on every restart that happens to land
/// inside the lead window, since `reminder_due` would see no prior fire for the upcoming event.
fn load_last_fired(path: &Path) -> Option<u64> {
    match dp_versioned::read::<Stored>(path, MIGRATIONS) {
        Ok(Some(s)) => s.last_fired,
        Ok(None) => None,
        Err(e) => {
            log::warn!("could not read {STORE_FILE}, treating as not yet fired: {e}");
            None
        }
    }
}

fn save_last_fired(path: &Path, last_fired: Option<u64>) {
    if let Err(e) = dp_versioned::write(path, MIGRATIONS, &Stored { last_fired }) {
        log::warn!("could not save {STORE_FILE}: {e}");
    }
}

#[derive(Default)]
pub struct MaintenanceState {
    schedule: Mutex<Schedule>,
    last_fired: Mutex<Option<u64>>,
}

impl MaintenanceState {
    fn path(app: &AppHandle) -> Option<PathBuf> {
        app.path().app_data_dir().ok().map(|d| d.join(STORE_FILE))
    }

    fn tick(&self, app: &AppHandle, now: u64) {
        let s = *self.schedule.lock_or_recover();
        if !s.enabled {
            return;
        }
        let event = next_event(now, s.weekday, s.minute_of_day);
        let mut fired = self.last_fired.lock_or_recover();
        if !reminder_due(now, event, s.lead_minutes, *fired) {
            return;
        }
        *fired = Some(event);
        if let Some(path) = Self::path(app) {
            save_last_fired(&path, *fired);
        }
        let mins = (event - now).div_ceil(60);
        log::info!("Steam maintenance reminder fired ({mins} min ahead)");
        notifications::push(
            app,
            NotificationKind::Maintenance,
            "notifications.maintenance_soon",
            &[("minutes", mins.to_string())],
            None,
            notifications::ALERT_ROUTE,
        );
    }
}

pub fn start(app: &AppHandle) {
    if let Some(path) = MaintenanceState::path(app) {
        *app.state::<MaintenanceState>().last_fired.lock_or_recover() = load_last_fired(&path);
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            app.state::<MaintenanceState>().tick(&app, unix_now());
            tokio::time::sleep(TICK).await;
        }
    });
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn set_maintenance_schedule(schedule: Schedule, state: tauri::State<'_, MaintenanceState>) {
        let schedule = schedule.sanitized();
        *state.schedule.lock_or_recover() = schedule;
        log::info!(
            "maintenance reminder {} (weekday {}, minute {}, lead {} min)",
            if schedule.enabled { "enabled" } else { "disabled" },
            schedule.weekday,
            schedule.minute_of_day,
            schedule.lead_minutes
        );
    }

    /// Next occurrence of the stored slot as unix seconds, whether or not reminders are on.
    #[tauri::command]
    pub fn next_maintenance(state: tauri::State<'_, MaintenanceState>) -> u64 {
        let s = *state.schedule.lock_or_recover();
        next_event(unix_now(), s.weekday, s.minute_of_day)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-09-22 is a Tuesday. 21:00 UTC that day:
    const TUE_2100: u64 = 1_790_110_800;

    #[test]
    fn epoch_day_zero_is_thursday() {
        assert_eq!(weekday_of_day(0), 3);
        assert_eq!(weekday_of_day(TUE_2100 / DAY), 1);
    }

    #[test]
    fn next_event_later_the_same_day() {
        assert_eq!(next_event(TUE_2100 - 3600, 1, 21 * 60), TUE_2100);
    }

    #[test]
    fn next_event_is_strictly_after_now() {
        assert_eq!(next_event(TUE_2100, 1, 21 * 60), TUE_2100 + 7 * DAY);
        assert_eq!(next_event(TUE_2100 + 1, 1, 21 * 60), TUE_2100 + 7 * DAY);
    }

    #[test]
    fn next_event_finds_other_weekdays() {
        assert_eq!(next_event(TUE_2100, 2, 0), (TUE_2100 / DAY + 1) * DAY);
        assert_eq!(next_event(TUE_2100, 0, 0), (TUE_2100 / DAY + 6) * DAY);
    }

    #[test]
    fn reminder_fires_only_inside_the_lead_window() {
        assert!(!reminder_due(TUE_2100 - 31 * 60, TUE_2100, 30, None));
        assert!(reminder_due(TUE_2100 - 30 * 60, TUE_2100, 30, None));
        assert!(reminder_due(TUE_2100 - 1, TUE_2100, 30, None));
    }

    #[test]
    fn reminder_fires_once_per_event() {
        assert!(!reminder_due(TUE_2100 - 60, TUE_2100, 30, Some(TUE_2100)));
        assert!(reminder_due(TUE_2100 - 60, TUE_2100, 30, Some(TUE_2100 - 7 * DAY)));
    }

    #[test]
    fn zero_lead_never_fires() {
        assert!(!reminder_due(TUE_2100 - 1, TUE_2100, 0, None));
    }

    #[test]
    fn default_slot_is_wednesday_midnight_utc() {
        let s = Schedule::default();
        assert_eq!((s.weekday, s.minute_of_day, s.enabled), (2, 0, false));
        assert_eq!(weekday_of_day(next_event(TUE_2100, s.weekday, s.minute_of_day) / DAY), 2);
    }

    #[test]
    fn schedule_input_is_clamped() {
        let s = Schedule { enabled: true, weekday: 9, minute_of_day: 5000, lead_minutes: 99_999 }.sanitized();
        assert_eq!((s.weekday, s.minute_of_day, s.lead_minutes), (6, 1439, 1440));
    }

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-maintenance-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(STORE_FILE)
    }

    #[test]
    fn no_stored_file_reads_as_not_yet_fired() {
        assert_eq!(load_last_fired(&temp_path("missing")), None);
    }

    /// Reproduces the restart-mid-lead-window bug: a fresh, in-memory-only `last_fired` would
    /// forget an event it already fired for, so `reminder_due` would say it's due again.
    #[test]
    fn a_fired_event_survives_a_reload_from_disk() {
        let path = temp_path("survives-reload");
        save_last_fired(&path, Some(TUE_2100));
        let reloaded = load_last_fired(&path);
        assert_eq!(reloaded, Some(TUE_2100));
        assert!(!reminder_due(TUE_2100 - 60, TUE_2100, 30, reloaded));
    }
}
