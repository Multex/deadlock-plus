use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::route::{Delivery, Placement};
use super::NotificationKind;

/// What a notification is about. The user picks a delivery per topic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum NotificationTopic {
    Updates,
    Maintenance,
    ServerBlocksUpdated,
    ServerBlocksStale,
    BreakReminder,
    MatchFound,
    QueueStopped,
    FrontPageWaiting,
}

impl NotificationTopic {
    pub const fn kind(self) -> NotificationKind {
        match self {
            Self::Updates => NotificationKind::Alert,
            Self::Maintenance => NotificationKind::Maintenance,
            Self::ServerBlocksUpdated | Self::ServerBlocksStale => NotificationKind::Servers,
            Self::BreakReminder => NotificationKind::Session,
            Self::MatchFound | Self::QueueStopped | Self::FrontPageWaiting => NotificationKind::Match,
        }
    }

    pub const fn placement(self) -> Placement {
        match self {
            Self::MatchFound | Self::QueueStopped => Placement::Center,
            _ => Placement::Corner,
        }
    }

    pub const fn default_delivery(self) -> Delivery {
        match self {
            Self::ServerBlocksUpdated => Delivery::Quiet,
            Self::MatchFound | Self::QueueStopped | Self::FrontPageWaiting => Delivery::Overlay,
            Self::Updates | Self::Maintenance | Self::ServerBlocksStale | Self::BreakReminder => Delivery::Both,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    /// A topic missing here uses its default delivery.
    pub deliveries: BTreeMap<NotificationTopic, Delivery>,
    pub server_blocks_updated: bool,
    pub server_blocks_stale: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self { deliveries: BTreeMap::new(), server_blocks_updated: true, server_blocks_stale: true }
    }
}

impl NotificationSettings {
    /// Match found, queue stopped and front page waiting show in the game overlay only, never as a desktop toast or a
    /// center entry.
    pub fn delivery(&self, topic: NotificationTopic) -> Delivery {
        match topic {
            NotificationTopic::MatchFound | NotificationTopic::QueueStopped | NotificationTopic::FrontPageWaiting => {
                Delivery::Overlay
            }
            _ => self.deliveries.get(&topic).copied().unwrap_or(topic.default_delivery()),
        }
    }

    /// Only the server topics are switched off here; every other topic is gated by its own feature first.
    pub fn allows(&self, topic: NotificationTopic) -> bool {
        match topic {
            NotificationTopic::ServerBlocksUpdated => self.server_blocks_updated,
            NotificationTopic::ServerBlocksStale => self.server_blocks_stale,
            _ => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOPICS: [NotificationTopic; 8] = [
        NotificationTopic::Updates,
        NotificationTopic::Maintenance,
        NotificationTopic::ServerBlocksUpdated,
        NotificationTopic::ServerBlocksStale,
        NotificationTopic::BreakReminder,
        NotificationTopic::MatchFound,
        NotificationTopic::QueueStopped,
        NotificationTopic::FrontPageWaiting,
    ];

    #[test]
    fn each_topic_has_its_kind_placement_and_default_delivery() {
        use NotificationKind as K;
        use NotificationTopic as T;
        #[rustfmt::skip]
        let rows = [
            (T::Updates,             K::Alert,       Placement::Corner, Delivery::Both),
            (T::Maintenance,         K::Maintenance, Placement::Corner, Delivery::Both),
            (T::ServerBlocksUpdated, K::Servers,     Placement::Corner, Delivery::Quiet),
            (T::ServerBlocksStale,   K::Servers,     Placement::Corner, Delivery::Both),
            (T::BreakReminder,       K::Session,     Placement::Corner, Delivery::Both),
            (T::MatchFound,          K::Match,       Placement::Center, Delivery::Overlay),
            (T::QueueStopped,        K::Match,       Placement::Center, Delivery::Overlay),
            (T::FrontPageWaiting,    K::Match,       Placement::Corner, Delivery::Overlay),
        ];
        assert_eq!(rows.len(), TOPICS.len());
        for (topic, kind, placement, delivery) in rows {
            assert_eq!(
                (topic.kind(), topic.placement(), topic.default_delivery()),
                (kind, placement, delivery),
                "{topic:?}"
            );
        }
    }

    #[test]
    fn default_settings_deliver_every_topic_by_its_default() {
        let settings = NotificationSettings::default();
        for topic in TOPICS {
            assert_eq!(settings.delivery(topic), topic.default_delivery(), "{topic:?}");
            assert!(settings.allows(topic), "{topic:?}");
        }
    }

    #[test]
    fn a_chosen_delivery_overrides_only_its_topic() {
        let settings = NotificationSettings {
            deliveries: BTreeMap::from([(NotificationTopic::Updates, Delivery::Center)]),
            ..Default::default()
        };
        assert_eq!(settings.delivery(NotificationTopic::Updates), Delivery::Center);
        assert_eq!(settings.delivery(NotificationTopic::MatchFound), Delivery::Overlay);
    }

    #[test]
    fn overlay_only_topics_are_delivered_by_the_overlay_whatever_is_stored() {
        for topic in
            [NotificationTopic::MatchFound, NotificationTopic::QueueStopped, NotificationTopic::FrontPageWaiting]
        {
            for stored in [Delivery::Os, Delivery::Both, Delivery::Quiet, Delivery::Center, Delivery::Overlay] {
                let settings =
                    NotificationSettings { deliveries: BTreeMap::from([(topic, stored)]), ..Default::default() };
                assert_eq!(settings.delivery(topic), Delivery::Overlay, "{topic:?} {stored:?}");
            }
        }
    }

    #[test]
    fn a_partial_payload_fills_the_rest_with_defaults() {
        let settings: NotificationSettings =
            serde_json::from_str(r#"{"deliveries":{"maintenance":"os","serverBlocksUpdated":"center"}}"#).unwrap();
        assert_eq!(settings.delivery(NotificationTopic::Maintenance), Delivery::Os);
        assert_eq!(settings.delivery(NotificationTopic::ServerBlocksUpdated), Delivery::Center);
        assert_eq!(settings.delivery(NotificationTopic::Updates), Delivery::Both);
        assert!(settings.server_blocks_updated && settings.server_blocks_stale);

        let empty: NotificationSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(empty, NotificationSettings::default());
    }

    #[test]
    fn a_switched_off_server_topic_is_not_allowed() {
        let settings = NotificationSettings { server_blocks_updated: false, ..Default::default() };
        assert!(!settings.allows(NotificationTopic::ServerBlocksUpdated));
        assert!(settings.allows(NotificationTopic::ServerBlocksStale));

        let settings = NotificationSettings { server_blocks_stale: false, ..Default::default() };
        assert!(settings.allows(NotificationTopic::ServerBlocksUpdated));
        assert!(!settings.allows(NotificationTopic::ServerBlocksStale));
        assert!(TOPICS[..2].iter().chain(&TOPICS[4..]).all(|&t| settings.allows(t)));
    }
}
