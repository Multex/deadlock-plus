use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::time::Duration;

use futures_util::StreamExt as _;
use prost::Message as _;
use steam_vent::proto::steammessages_clientserver_friends::{
    CMsgClientFriendsList, CMsgClientPersonaState, CMsgClientRequestFriendData,
};
use steam_vent::proto::{MsgKind, RpcMessageWithKind as _};
use steam_vent::{Connection, ConnectionTrait, GameCoordinator, RawNetMessage, ServerList, UntypedMessage};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::EResult as HistoryResult;
use valveprotos::deadlock::c_msg_client_to_gc_get_match_meta_data_response::EResult;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, CMsgClientToGcGetMatchMetaData,
    CMsgClientToGcGetMatchMetaDataResponse, EgcCitadelClientMessages,
};

use crate::auth::{account_id_of, AuthContext};
use crate::error::GcError;
use crate::friends::Persona;

const DEADLOCK_APP_ID: u32 = 1422450;
const GC_CALL_TIMEOUT: Duration = Duration::from_secs(30);
const STEAM_ID_64_IDENT: u64 = 76561197960265728;
// Steam pushes the friends list right after logon. It normally lands during the GC handshake, so
// this only bounds the wait when it never comes.
const FRIENDS_LIST_WAIT: Duration = Duration::from_secs(5);
// Persona states arrive as a burst of pushes, not as one reply.
const PERSONA_WAIT: Duration = Duration::from_secs(5);
const FRIEND_RELATIONSHIP_FRIEND: u32 = 3;
const PERSONA_FLAGS_STATUS_PRESENCE_LAST_SEEN: u32 = 1 | 16 | 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecoveredSalts {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub metadata_salt: Option<u32>,
    pub replay_salt: Option<u32>,
    pub account_id: u32,
}

/// A response with neither salt is an error so it is never posted.
pub fn interpret_salts_response(
    match_id: u64,
    account_id: u32,
    resp: &CMsgClientToGcGetMatchMetaDataResponse,
) -> Result<RecoveredSalts, GcError> {
    match resp.result {
        Some(r) if r == EResult::KEResultRateLimited as i32 => return Err(GcError::GcRateLimited),
        Some(r) if r == EResult::KEResultSuccess as i32 => {}
        r => return Err(GcError::GcUnavailable(format!("salts result {r:?}"))),
    }
    if resp.metadata_salt.is_none() && resp.replay_salt.is_none() {
        return Err(GcError::GcUnavailable("response has no salts".into()));
    }
    Ok(RecoveredSalts {
        match_id,
        cluster_id: resp.replay_group_id,
        metadata_salt: resp.metadata_salt,
        replay_salt: resp.replay_salt,
        account_id,
    })
}

/// Rate limits come back as `GcRateLimited` and private profiles as `HistoryPrivate`.
pub fn interpret_history_response(
    resp: CMsgClientToGcGetMatchHistoryResponse,
) -> Result<CMsgClientToGcGetMatchHistoryResponse, GcError> {
    match resp.result {
        Some(r) if r == HistoryResult::KEResultSuccess as i32 => Ok(resp),
        Some(r) if r == HistoryResult::KEResultRateLimited as i32 => Err(GcError::GcRateLimited),
        Some(r) if r == HistoryResult::KEResultInvalidPermission as i32 => Err(GcError::HistoryPrivate),
        r => Err(GcError::GcUnavailable(format!("match history result {r:?}"))),
    }
}

/// The cursor walks backwards in time. A missing, zero or non-decreasing cursor means there are
/// no older pages.
pub fn next_history_cursor(prev: Option<u64>, next: Option<u64>) -> Option<u64> {
    next.filter(|&n| n != 0 && prev.is_none_or(|p| n < p))
}

/// Confirmed friends that are individual accounts.
pub fn friend_account_ids(list: &CMsgClientFriendsList) -> Vec<u32> {
    list.friends
        .iter()
        .filter(|f| f.efriendrelationship == Some(FRIEND_RELATIONSHIP_FRIEND))
        .filter_map(|f| f.ulfriendid)
        // SteamID64 bits 52..56 hold the account type; 1 is an individual.
        .filter(|id| (id >> 52) & 0xF == 1)
        .map(account_id_of)
        .collect()
}

async fn with_timeout<T, E: std::fmt::Display>(
    label: &str,
    fut: impl Future<Output = Result<T, E>>,
) -> Result<T, GcError> {
    match tokio::time::timeout(GC_CALL_TIMEOUT, fut).await {
        Ok(result) => result.map_err(|e| GcError::GcUnavailable(format!("{label}: {e}"))),
        Err(_) => Err(GcError::GcUnavailable(format!("{label}: timed out after {GC_CALL_TIMEOUT:?}"))),
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// A live GC session for one account. Drop it between passes.
pub struct GcSession {
    gc: GameCoordinator,
    conn: Connection,
    account_id: u32,
    /// Account ids of this account's Steam friends. Empty when Steam never sent the list.
    pub friends: Vec<u32>,
}

impl GcSession {
    /// Logs in through the user's own account and handshakes the Deadlock GC. Fails when the
    /// account does not own the game or Steam is unreachable.
    pub async fn connect(ctx: &AuthContext) -> Result<Self, GcError> {
        let servers = with_timeout("server discovery", ServerList::discover()).await?;
        let conn =
            with_timeout("CM login", Connection::access(&servers, &ctx.account_name, &ctx.refresh_token)).await?;
        // Listen before draining the unprocessed buffer so the list cannot slip between them.
        let friends_list = conn.one::<CMsgClientFriendsList>();
        let buffered =
            conn.take_unprocessed().into_iter().find(|m| m.kind == MsgKind::from(CMsgClientFriendsList::KIND));
        let gc = with_timeout("GC handshake", GameCoordinator::new(&conn, DEADLOCK_APP_ID)).await?;

        let list = match buffered {
            Some(raw) => raw.into_message::<CMsgClientFriendsList>().ok(),
            None => tokio::time::timeout(FRIENDS_LIST_WAIT, friends_list).await.ok().and_then(Result::ok),
        };
        if list.is_none() {
            log::debug!("gc: Steam sent no friends list for account {}", ctx.account_id());
        }
        let friends = list.as_ref().map(friend_account_ids).unwrap_or_default();
        Ok(Self { gc, conn, account_id: ctx.account_id(), friends })
    }

    async fn send_job(&self, req: Vec<u8>, kind: MsgKind, label: &str) -> Result<RawNetMessage, GcError> {
        with_timeout(label, self.gc.job_untyped(UntypedMessage(req), kind, true)).await
    }

    /// One `GetMatchMetaData` round trip with no retries, so a failed fetch costs at most one
    /// quota unit.
    pub async fn fetch_match_salts(&self, match_id: u64) -> Result<RecoveredSalts, GcError> {
        let req = CMsgClientToGcGetMatchMetaData { match_id: Some(match_id), ..Default::default() };
        let kind = MsgKind(EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData as i32);
        let raw = self.send_job(req.encode_to_vec(), kind, "salts").await?;
        let resp = CMsgClientToGcGetMatchMetaDataResponse::decode(raw.data.as_ref())
            .map_err(|e| GcError::GcUnavailable(format!("bad salts response: {e}")))?;
        interpret_salts_response(match_id, self.account_id, &resp)
    }

    /// What Steam says about each of `account_ids`, who must be friends. Friends Steam does not
    /// answer for in time are missing from the map.
    pub async fn request_personas(&self, account_ids: &[u32]) -> HashMap<u32, Persona> {
        let mut personas = HashMap::new();
        if account_ids.is_empty() {
            return personas;
        }
        let mut updates = Box::pin(self.conn.on::<CMsgClientPersonaState>());
        let mut req = CMsgClientRequestFriendData::new();
        req.persona_state_requested = Some(PERSONA_FLAGS_STATUS_PRESENCE_LAST_SEEN);
        req.friends = account_ids.iter().map(|&id| STEAM_ID_64_IDENT + u64::from(id)).collect();
        if let Err(e) = with_timeout("persona request", self.conn.send(req)).await {
            log::warn!("gc: {e}");
            return personas;
        }

        // Steam also pushes updates for friends nobody asked about; only the requested ones count
        // towards being done.
        let mut pending: HashSet<u32> = account_ids.iter().copied().collect();
        let now = now_secs();
        let deadline = tokio::time::Instant::now() + PERSONA_WAIT;
        while !pending.is_empty() {
            let msg = match tokio::time::timeout_at(deadline, updates.next()).await {
                Ok(Some(Ok(msg))) => msg,
                Ok(Some(Err(e))) => {
                    log::debug!("gc: unreadable persona state: {e}");
                    continue;
                }
                Ok(None) | Err(_) => break,
            };
            for f in msg.friends {
                let Some(id) = f.friendid.map(account_id_of) else { continue };
                if !pending.remove(&id) {
                    continue;
                }
                let online = f.persona_state.is_some_and(|s| s != 0);
                let last_seen = if online {
                    Some(now)
                } else {
                    [f.last_seen_online, f.last_logoff].into_iter().flatten().filter(|&t| t != 0).max().map(i64::from)
                };
                personas.insert(id, Persona { in_deadlock: f.game_played_app_id == Some(DEADLOCK_APP_ID), last_seen });
            }
        }
        personas
    }

    async fn history_page(
        &self,
        account_id: u32,
        cursor: Option<u64>,
    ) -> Result<CMsgClientToGcGetMatchHistoryResponse, GcError> {
        let kind = MsgKind(EgcCitadelClientMessages::KEMsgClientToGcGetMatchHistory as i32);
        let req = CMsgClientToGcGetMatchHistory {
            account_id: Some(account_id),
            continue_cursor: cursor,
            ..Default::default()
        };
        let raw = self.send_job(req.encode_to_vec(), kind, "match history").await?;
        let resp = CMsgClientToGcGetMatchHistoryResponse::decode(raw.data.as_ref())
            .map_err(|e| GcError::GcUnavailable(format!("bad match history response: {e}")))?;
        interpret_history_response(resp)
    }

    /// The match ids on the newest page of `account_id`'s history. One request.
    pub async fn fetch_recent_matches(&self, account_id: u32) -> Result<Vec<u64>, GcError> {
        let page = self.history_page(account_id, None).await?;
        Ok(page.matches.iter().filter_map(|m| m.match_id).collect())
    }

    /// Every match id in `account_id`'s history and whether it is complete. When Steam
    /// rate-limits part way, the pages fetched so far come back with `false`.
    pub async fn fetch_match_history(&self, account_id: u32) -> Result<(Vec<u64>, bool), GcError> {
        let mut match_ids = Vec::new();
        let mut cursor = None;
        loop {
            let resp = match self.history_page(account_id, cursor).await {
                Ok(resp) => resp,
                Err(GcError::GcRateLimited) if !match_ids.is_empty() => return Ok((match_ids, false)),
                Err(e) => return Err(e),
            };
            if resp.matches.is_empty() {
                break;
            }
            match_ids.extend(resp.matches.iter().filter_map(|m| m.match_id));
            match next_history_cursor(cursor, resp.continue_cursor) {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }
        Ok((match_ids, true))
    }
}

#[cfg(test)]
mod tests {
    use steam_vent::proto::steammessages_clientserver_friends::cmsg_client_friends_list::Friend;

    use super::*;

    fn response(result: EResult, metadata: Option<u32>, replay: Option<u32>) -> CMsgClientToGcGetMatchMetaDataResponse {
        CMsgClientToGcGetMatchMetaDataResponse {
            result: Some(result as i32),
            metadata_salt: metadata,
            replay_salt: replay,
            replay_group_id: Some(404),
            ..Default::default()
        }
    }

    #[test]
    fn success_carries_both_salts_and_the_account() {
        let got = interpret_salts_response(42, 7, &response(EResult::KEResultSuccess, Some(1), Some(2))).unwrap();
        assert_eq!(
            got,
            RecoveredSalts {
                match_id: 42,
                cluster_id: Some(404),
                metadata_salt: Some(1),
                replay_salt: Some(2),
                account_id: 7
            }
        );
    }

    #[test]
    fn one_salt_is_enough() {
        assert!(interpret_salts_response(42, 7, &response(EResult::KEResultSuccess, None, Some(2))).is_ok());
    }

    #[test]
    fn success_without_salts_is_an_error() {
        let e = interpret_salts_response(42, 7, &response(EResult::KEResultSuccess, None, None)).unwrap_err();
        assert!(matches!(e, GcError::GcUnavailable(_)));
    }

    #[test]
    fn rate_limit_is_its_own_error() {
        let e = interpret_salts_response(42, 7, &response(EResult::KEResultRateLimited, Some(1), Some(2))).unwrap_err();
        assert_eq!(e, GcError::GcRateLimited);
    }

    #[test]
    fn missing_result_is_an_error() {
        let resp = CMsgClientToGcGetMatchMetaDataResponse { metadata_salt: Some(1), ..Default::default() };
        assert!(matches!(interpret_salts_response(42, 7, &resp), Err(GcError::GcUnavailable(_))));
    }

    fn history(result: HistoryResult) -> CMsgClientToGcGetMatchHistoryResponse {
        CMsgClientToGcGetMatchHistoryResponse { result: Some(result as i32), ..Default::default() }
    }

    #[test]
    fn history_results_map_to_errors() {
        assert!(interpret_history_response(history(HistoryResult::KEResultSuccess)).is_ok());
        assert_eq!(
            interpret_history_response(history(HistoryResult::KEResultRateLimited)).unwrap_err(),
            GcError::GcRateLimited
        );
        assert_eq!(
            interpret_history_response(history(HistoryResult::KEResultInvalidPermission)).unwrap_err(),
            GcError::HistoryPrivate
        );
        let empty = CMsgClientToGcGetMatchHistoryResponse::default();
        assert!(matches!(interpret_history_response(empty), Err(GcError::GcUnavailable(_))));
    }

    #[test]
    fn history_cursor_must_walk_backwards() {
        assert_eq!(next_history_cursor(None, Some(50)), Some(50));
        assert_eq!(next_history_cursor(Some(50), Some(40)), Some(40));
        assert_eq!(next_history_cursor(Some(50), Some(50)), None);
        assert_eq!(next_history_cursor(Some(50), Some(60)), None);
        assert_eq!(next_history_cursor(None, Some(0)), None);
        assert_eq!(next_history_cursor(None, None), None);
    }

    fn friend(id: u64, relationship: u32) -> Friend {
        let mut f = Friend::new();
        f.ulfriendid = Some(id);
        f.efriendrelationship = Some(relationship);
        f
    }

    #[test]
    fn friends_list_keeps_confirmed_individual_accounts() {
        let mut list = CMsgClientFriendsList::new();
        list.friends = vec![
            friend(STEAM_ID_64_IDENT + 5, FRIEND_RELATIONSHIP_FRIEND),
            friend(STEAM_ID_64_IDENT + 6, 2),
            // A Steam group: account type 7.
            friend((7 << 52) | 9, FRIEND_RELATIONSHIP_FRIEND),
        ];
        assert_eq!(friend_account_ids(&list), vec![5]);
    }
}
