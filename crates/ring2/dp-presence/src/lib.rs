mod art;
mod coalescer;
mod config;
mod map;
mod state;
mod template;

pub use coalescer::{Coalescer, Poll, MIN_SEND_INTERVAL_MS};
pub use config::{
    builtin_config, resolve_slot, Config, HeroOverrides, Image, ImageSource, PartialImage, PartialSlot, Slot, Timer,
};
pub use map::{
    map, map_with, preview, preview_with, with_deadlock_plus_logo, with_support_button, Button, Context, GameFacts,
    GameMode, LiveFacts, MatchMode, PartyFacts, Perspective, Phase, Presence, PresenceLevel, PreviewSample,
    StreetBrawlFacts, MAX_TEXT_CHARS, MIN_TEXT_CHARS, PARTY_MAX, PREVIEW_NOW_SECS,
};
pub use state::{classify, StateId, VariantId};
pub use template::{is_sensitive, render, Values, PLACEHOLDERS, SENSITIVE_PLACEHOLDERS};

#[cfg(test)]
mod pipeline_tests;
