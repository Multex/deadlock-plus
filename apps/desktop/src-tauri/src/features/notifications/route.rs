use serde::Serialize;
use ts_rs::TS;

/// How one notification is delivered, checked against the game and window state when it is pushed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    pub visibility: Visibility,
    pub delivery: Delivery,
    pub placement: Placement,
}

/// When a notification shows at all; otherwise it is dropped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code, reason = "every variant is part of the routing contract; not each has a caller yet")]
pub enum Visibility {
    GameFocused,
    GameOpen,
    Always,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code, reason = "every variant is part of the routing contract; not each has a caller yet")]
pub enum Delivery {
    /// Overlay toast only: no center entry, no badge.
    Overlay,
    /// Center entry and a native toast.
    Os,
    /// Center entry and one toast: the overlay while the game is focused and the overlay is available, native
    /// otherwise.
    Both,
    /// Center entry, plus a native toast only while the game is not focused.
    Quiet,
}

/// Where an overlay toast sits. Ignored when no overlay shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code, reason = "every variant is part of the routing contract; not each has a caller yet")]
pub enum Placement {
    /// The user's chosen corner.
    Corner,
    Center,
}

impl Route {
    pub const fn new(visibility: Visibility, delivery: Delivery, placement: Placement) -> Self {
        Self { visibility, delivery, placement }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Inputs {
    pub game_running: bool,
    pub game_focused: bool,
    pub main_focused: bool,
    pub overlay_available: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Targets {
    pub center: bool,
    pub native: bool,
    pub overlay: bool,
}

/// Pure: every rule falls out of the inputs. A native toast never shows while the main window is focused, and
/// one notification never shows both a native and an overlay toast.
pub fn targets(route: Route, inputs: Inputs) -> Targets {
    let shown = match route.visibility {
        Visibility::GameFocused => inputs.game_focused,
        Visibility::GameOpen => inputs.game_running,
        Visibility::Always => true,
    };
    if !shown {
        return Targets::default();
    }
    let native_allowed = !inputs.main_focused;
    match route.delivery {
        Delivery::Overlay => Targets { center: false, native: false, overlay: inputs.overlay_available },
        Delivery::Os => Targets { center: true, native: native_allowed, overlay: false },
        Delivery::Both => {
            let overlay = inputs.game_focused && inputs.overlay_available;
            Targets { center: true, native: !overlay && native_allowed, overlay }
        }
        Delivery::Quiet => Targets { center: true, native: !inputs.game_focused && native_allowed, overlay: false },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VISIBILITIES: [Visibility; 3] = [Visibility::GameFocused, Visibility::GameOpen, Visibility::Always];
    const PLACEMENTS: [Placement; 2] = [Placement::Corner, Placement::Center];

    /// Running, game focused, main focused, overlay available; then the expected targets for `Os`, `Both`,
    /// `Quiet` and `Overlay`.
    type Row = (u8, u8, u8, u8, &'static str, &'static str, &'static str, &'static str);

    /// `c` center entry, `n` native toast, `o` overlay toast.
    fn parse(expected: &str) -> Targets {
        Targets { center: expected.contains('c'), native: expected.contains('n'), overlay: expected.contains('o') }
    }

    #[test]
    fn every_route_and_input_combination_routes_as_specified() {
        #[rustfmt::skip]
        let rows: [Row; 16] = [
            (0, 0, 0, 0, "cn", "cn", "cn", ""),
            (0, 0, 0, 1, "cn", "cn", "cn", "o"),
            (0, 0, 1, 0, "c",  "c",  "c",  ""),
            (0, 0, 1, 1, "c",  "c",  "c",  "o"),
            (0, 1, 0, 0, "cn", "cn", "c",  ""),
            (0, 1, 0, 1, "cn", "co", "c",  "o"),
            (0, 1, 1, 0, "c",  "c",  "c",  ""),
            (0, 1, 1, 1, "c",  "co", "c",  "o"),
            (1, 0, 0, 0, "cn", "cn", "cn", ""),
            (1, 0, 0, 1, "cn", "cn", "cn", "o"),
            (1, 0, 1, 0, "c",  "c",  "c",  ""),
            (1, 0, 1, 1, "c",  "c",  "c",  "o"),
            (1, 1, 0, 0, "cn", "cn", "c",  ""),
            (1, 1, 0, 1, "cn", "co", "c",  "o"),
            (1, 1, 1, 0, "c",  "c",  "c",  ""),
            (1, 1, 1, 1, "c",  "co", "c",  "o"),
        ];
        let mut checked = 0;
        for (running, focused, main, overlay, os, both, quiet, overlay_only) in rows {
            let inputs = Inputs {
                game_running: running == 1,
                game_focused: focused == 1,
                main_focused: main == 1,
                overlay_available: overlay == 1,
            };
            for visibility in VISIBILITIES {
                let shown = match visibility {
                    Visibility::GameFocused => inputs.game_focused,
                    Visibility::GameOpen => inputs.game_running,
                    Visibility::Always => true,
                };
                for placement in PLACEMENTS {
                    for (delivery, expected) in [
                        (Delivery::Os, os),
                        (Delivery::Both, both),
                        (Delivery::Quiet, quiet),
                        (Delivery::Overlay, overlay_only),
                    ] {
                        let route = Route::new(visibility, delivery, placement);
                        let want = if shown { parse(expected) } else { Targets::default() };
                        assert_eq!(targets(route, inputs), want, "{route:?} {inputs:?}");
                        checked += 1;
                    }
                }
            }
        }
        assert_eq!(checked, 16 * 3 * 2 * 4);
    }
}
