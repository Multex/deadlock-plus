use std::collections::{HashMap, HashSet};
use std::future::ready;
use std::future::Future;
use std::pin::pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::future::{select, Either};
use futures_util::{stream, Stream, StreamExt as _};
use prost::Message as _;
use steam_vent::proto::enums_clientserver::EMsg;
use steam_vent::proto::steammessages_clientserver::cmsg_client_games_played::GamePlayed;
use steam_vent::proto::steammessages_clientserver::CMsgClientGamesPlayed;
use steam_vent::proto::steammessages_clientserver_2::CMsgClientPlayingSessionState;
use steam_vent::proto::steammessages_clientserver_friends::cmsg_client_persona_state::Friend as PersonaFriend;
use steam_vent::proto::steammessages_clientserver_friends::{
    CMsgClientFriendsList, CMsgClientPersonaState, CMsgClientRequestFriendData,
};
use steam_vent::proto::steammessages_clientserver_login::{CMsgClientHello, CMsgClientLoggedOff};
use steam_vent::proto::{MsgKind, RpcMessageWithKind as _};
use steam_vent::{Connection, ConnectionTrait, GameCoordinator, RawNetMessage, ServerList, UntypedMessage};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::EResult as HistoryResult;
use valveprotos::deadlock::c_msg_client_to_gc_get_match_meta_data_response::EResult;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchHistory, CMsgClientToGcGetMatchHistoryResponse, CMsgClientToGcGetMatchMetaData,
    CMsgClientToGcGetMatchMetaDataResponse, ECitadelMatchMode, EgcCitadelClientMessages,
};

use crate::auth::{account_id_of, AuthContext};
use crate::error::GcError;
use crate::friends::Persona;
use crate::pass::claimed;

const DEADLOCK_APP_ID: u32 = 1422450;
const GC_CALL_TIMEOUT: Duration = Duration::from_secs(30);
// The GC drops hellos sent before it is ready for the session, so they are repeated until it
// welcomes one.
const HELLO_INTERVAL: Duration = Duration::from_secs(5);
const STEAM_ID_64_IDENT: u64 = 76561197960265728;
// Steam pushes the friends list right after logon. It normally lands during the handshake check,
// so this only bounds the wait when it never comes.
const FRIENDS_LIST_WAIT: Duration = Duration::from_secs(5);
// Persona states arrive as a burst of pushes, not as one reply. Steam-vent hands each message kind
// to subscribers through a 16-slot broadcast channel, so a request for many friends overruns it and
// the oldest replies are lost. Small batches keep each burst well under that.
const PERSONA_BATCH: usize = 8;
const PERSONA_WAITS: PersonaWaits = PersonaWaits { batch: Duration::from_secs(2), total: Duration::from_secs(10) };
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
    let metadata_salt = resp.metadata_salt.filter(|&s| s != 0);
    let replay_salt = resp.replay_salt.filter(|&s| s != 0);
    if metadata_salt.is_none() && replay_salt.is_none() {
        return Err(GcError::GcUnavailable("response has no salts".into()));
    }
    Ok(RecoveredSalts { match_id, cluster_id: resp.replay_group_id, metadata_salt, replay_salt, account_id })
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

/// One row of a player's own match history as Steam sends it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HistoryMatch {
    pub match_id: u64,
    /// Unix seconds. `None` when Steam left it out or sent 0.
    pub start_time: Option<u32>,
}

/// Only matchmade games (ranked and unranked, Street Brawl included) count. deadlock-api never lists
/// private lobby, bot, Hero Labs, tutorial or server test matches as known, so they would be asked
/// about and sent again on every run. A row without a mode is kept.
fn matchmade(match_mode: Option<i32>) -> bool {
    const RANKED: i32 = ECitadelMatchMode::KECitadelMatchModeRanked as i32;
    const UNRANKED: i32 = ECitadelMatchMode::KECitadelMatchModeUnranked as i32;
    matches!(match_mode, None | Some(RANKED | UNRANKED))
}

pub fn history_matches(resp: &CMsgClientToGcGetMatchHistoryResponse) -> Vec<HistoryMatch> {
    resp.matches
        .iter()
        .filter(|m| matchmade(m.match_mode))
        .filter_map(|m| Some(HistoryMatch { match_id: m.match_id?, start_time: m.start_time.filter(|&t| t != 0) }))
        .collect()
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

/// What Steam tells the session about who may play on the account.
#[derive(Debug, Clone, PartialEq)]
pub enum SessionEvent {
    Playing(CMsgClientPlayingSessionState),
    LoggedOff,
    /// The connection ended, so no more events will come.
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionAction {
    Keep,
    Yield,
}

/// Steam blocks this session from playing once another session of the account plays, for
/// example when the user presses Play in their own client.
pub fn on_session_event(event: &SessionEvent) -> SessionAction {
    match event {
        SessionEvent::Playing(state) if state.playing_blocked == Some(true) => SessionAction::Yield,
        SessionEvent::Playing(_) => SessionAction::Keep,
        SessionEvent::LoggedOff | SessionEvent::Closed => SessionAction::Yield,
    }
}

fn session_event(raw: RawNetMessage) -> Option<SessionEvent> {
    if raw.kind == MsgKind::from(CMsgClientPlayingSessionState::KIND) {
        raw.into_message().ok().map(SessionEvent::Playing)
    } else if raw.kind == MsgKind::from(CMsgClientLoggedOff::KIND) {
        Some(SessionEvent::LoggedOff)
    } else {
        None
    }
}

/// Every session event Steam sends from now on, then `Closed` when the connection ends.
fn session_events(conn: &Connection) -> impl Stream<Item = SessionEvent> + Send + 'static + use<'_> {
    let playing = conn.on::<CMsgClientPlayingSessionState>().filter_map(|m| ready(m.ok().map(SessionEvent::Playing)));
    let logged_off = conn.on::<CMsgClientLoggedOff>().filter_map(|m| ready(m.ok().map(|_| SessionEvent::LoggedOff)));
    stream::select(playing, logged_off).chain(stream::once(ready(SessionEvent::Closed)))
}

fn note_event(event: &SessionEvent, yielded: &AtomicBool) {
    if on_session_event(event) == SessionAction::Yield && !yielded.swap(true, Ordering::AcqRel) {
        let what = match event {
            SessionEvent::Playing(_) => "another session is playing",
            SessionEvent::LoggedOff => "Steam logged the session off",
            SessionEvent::Closed => "the connection closed",
        };
        log::info!("gc: stepping aside for the user's own Steam client: {what}");
    }
}

/// Resolves once the session must step aside, and records it in `yielded`.
async fn until_yield(events: impl Stream<Item = SessionEvent>, yielded: Arc<AtomicBool>) {
    let mut events = pin!(events);
    while !yielded.load(Ordering::Acquire) {
        let Some(event) = events.next().await else { return };
        note_event(&event, &yielded);
    }
}

/// Only the claim's own timeouts are claim failures. A yield stays a yield.
fn claim_failed(e: GcError) -> GcError {
    match e {
        GcError::GcUnavailable(s) => GcError::ClaimFailed(s),
        e => e,
    }
}

fn playing() -> CMsgClientGamesPlayed {
    let mut game = GamePlayed::new();
    game.game_id = Some(u64::from(DEADLOCK_APP_ID));
    let mut msg = CMsgClientGamesPlayed::new();
    msg.games_played = vec![game];
    msg
}

/// An empty games-played list. Steam keeps treating a session that claimed Deadlock as playing it
/// until it hears this or the session times out.
fn not_playing() -> CMsgClientGamesPlayed {
    CMsgClientGamesPlayed::new()
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

#[derive(Debug, Clone, Copy)]
struct PersonaWaits {
    batch: Duration,
    total: Duration,
}

fn note_persona(f: PersonaFriend, now: i64, pending: &mut HashSet<u32>, personas: &mut HashMap<u32, Persona>) {
    let Some(id) = f.friendid.map(account_id_of) else { return };
    // Steam also pushes updates for friends nobody asked about; only the requested ones count.
    if !pending.remove(&id) {
        return;
    }
    let online = f.persona_state.is_some_and(|s| s != 0);
    let last_seen = if online {
        Some(now)
    } else {
        [f.last_seen_online, f.last_logoff].into_iter().flatten().filter(|&t| t != 0).max().map(i64::from)
    };
    personas.insert(id, Persona { in_deadlock: f.game_played_app_id == Some(DEADLOCK_APP_ID), last_seen });
}

/// Asks `send` for `account_ids` and reads the answers from `updates`, which must be subscribed
/// before the first send.
async fn collect_personas<E>(
    updates: impl Stream<Item = Result<CMsgClientPersonaState, E>>,
    account_ids: &[u32],
    mut send: impl AsyncFnMut(&[u32]) -> Result<(), GcError>,
    now: i64,
    waits: PersonaWaits,
) -> HashMap<u32, Persona> {
    let mut updates = pin!(updates);
    let mut personas = HashMap::new();
    let mut pending: HashSet<u32> = account_ids.iter().copied().collect();
    let requested = pending.len();
    let pass_deadline = tokio::time::Instant::now() + waits.total;
    'batches: for batch in account_ids.chunks(PERSONA_BATCH) {
        if tokio::time::Instant::now() >= pass_deadline {
            break;
        }
        if let Err(e) = send(batch).await {
            log::warn!("gc: {e}");
            break;
        }
        let deadline = (tokio::time::Instant::now() + waits.batch).min(pass_deadline);
        let mut retried = false;
        while batch.iter().any(|id| pending.contains(id)) {
            match tokio::time::timeout_at(deadline, updates.next()).await {
                Ok(Some(Ok(msg))) => {
                    for f in msg.friends {
                        note_persona(f, now, &mut pending, &mut personas);
                    }
                }
                Ok(Some(Err(_))) => {
                    log::debug!("gc: persona updates dropped (receiver lagged)");
                    if retried {
                        continue;
                    }
                    retried = true;
                    let missing: Vec<u32> = batch.iter().copied().filter(|id| pending.contains(id)).collect();
                    if let Err(e) = send(&missing).await {
                        log::warn!("gc: {e}");
                        break 'batches;
                    }
                }
                Ok(None) => break 'batches,
                Err(_) => break,
            }
        }
    }
    log::debug!("gc: personas resolved {}/{requested}", personas.len());
    personas
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// A Steam login with an idle GC channel for one account. The game is claimed only for the length
/// of each GC request, so the user's own client can launch Deadlock between them.
pub struct GcSession {
    gc: GameCoordinator,
    conn: Connection,
    account_id: u32,
    /// Account ids of this account's Steam friends. Empty when Steam never sent the list.
    pub friends: Vec<u32>,
    yielded: Arc<AtomicBool>,
    /// Watches for a yield between requests, while nothing is claimed.
    watcher: tokio::task::JoinHandle<()>,
}

impl Drop for GcSession {
    fn drop(&mut self) {
        self.watcher.abort();
    }
}

impl GcSession {
    /// Logs in through the user's own account and checks that the Deadlock GC answers it, with
    /// one claim that is released straight after. Fails when the account does not own the game or
    /// Steam is unreachable.
    pub async fn connect(ctx: &AuthContext) -> Result<Self, GcError> {
        let servers = with_timeout("server discovery", ServerList::discover()).await?;
        let conn =
            with_timeout("CM login", Connection::access(&servers, &ctx.account_name, &ctx.refresh_token)).await?;
        // Listen before draining the unprocessed buffer so nothing can slip between them.
        let friends_list = conn.one::<CMsgClientFriendsList>();
        let events = session_events(&conn);
        let yielded = Arc::new(AtomicBool::new(false));
        let mut buffered = None;
        for raw in conn.take_unprocessed() {
            if raw.kind == MsgKind::from(CMsgClientFriendsList::KIND) {
                buffered = Some(raw);
            } else if let Some(event) = session_event(raw) {
                note_event(&event, &yielded);
            }
        }
        let watcher = tokio::spawn(until_yield(events, yielded.clone()));
        let gc = with_timeout("GC channel", GameCoordinator::new_without_startup(&conn, DEADLOCK_APP_ID)).await?;
        let mut session = Self { gc, conn, account_id: ctx.account_id(), friends: Vec::new(), yielded, watcher };
        if session.yielded() {
            return Err(GcError::Yielded);
        }
        session.with_claim("handshake check", async || Ok(())).await?;

        let list = match buffered {
            Some(raw) => raw.into_message::<CMsgClientFriendsList>().ok(),
            None => tokio::time::timeout(FRIENDS_LIST_WAIT, friends_list).await.ok().and_then(Result::ok),
        };
        if list.is_none() {
            log::debug!("gc: Steam sent no friends list for account {}", ctx.account_id());
        }
        session.friends = list.as_ref().map(friend_account_ids).unwrap_or_default();
        Ok(session)
    }

    /// Whether Steam asked this session to step aside for the user's own client. It stays set:
    /// the session makes no more requests.
    pub fn yielded(&self) -> bool {
        self.yielded.load(Ordering::Acquire)
    }

    /// Runs `fut` until Steam asks the session to step aside. The caller still releases.
    async fn unless_yielded<T>(&self, fut: impl Future<Output = Result<T, GcError>>) -> Result<T, GcError> {
        // Subscribed here, before `fut` sends anything, so no event can slip past.
        let watch = until_yield(session_events(&self.conn), self.yielded.clone());
        match select(pin!(watch), pin!(fut)).await {
            Either::Left(((), _)) => Err(GcError::Yielded),
            Either::Right((out, _)) => out,
        }
    }

    /// Reports the account as playing Deadlock and says hello until the GC welcomes the session.
    pub(crate) async fn claim(&self) -> Result<(), GcError> {
        self.unless_yielded(async { self.claim_unwatched().await.map_err(claim_failed) }).await
    }

    async fn claim_unwatched(&self) -> Result<(), GcError> {
        let send = self.conn.send_with_kind(playing(), EMsg::k_EMsgClientGamesPlayedWithDataBlob);
        with_timeout("claim", send).await?;
        let welcome = self.gc.wait_welcome();
        let hellos = async {
            loop {
                if let Err(e) = self.gc.send_hello(CMsgClientHello::default).await {
                    return e;
                }
                tokio::time::sleep(HELLO_INTERVAL).await;
            }
        };
        // The welcome is polled first so it listens before the first hello goes out.
        let handshake = async {
            match select(pin!(welcome), pin!(hellos)).await {
                Either::Left((welcome, _)) => welcome.map(drop),
                Either::Right((e, _)) => Err(e),
            }
        };
        with_timeout("GC handshake", handshake).await
    }

    /// Tells Steam the account stopped playing Deadlock, so the user's own client can launch it
    /// without the "playing on another computer" prompt. Every request already does this; it is
    /// also safe to call when nothing is claimed. Failures are logged, not returned.
    pub async fn release(&self) {
        let send = self.conn.send_with_kind(not_playing(), EMsg::k_EMsgClientGamesPlayedWithDataBlob);
        if let Err(e) = with_timeout("release", send).await {
            log::warn!("gc: could not release account {}: {e}", self.account_id);
        }
    }

    async fn with_claim<T>(&self, label: &str, job: impl AsyncFnOnce() -> Result<T, GcError>) -> Result<T, GcError> {
        let start = Instant::now();
        let out = claimed(self, job).await;
        log::debug!("gc: account {} held Deadlock for {} ms ({label})", self.account_id, start.elapsed().as_millis());
        out
    }

    async fn send_job(&self, req: Vec<u8>, kind: MsgKind, label: &str) -> Result<RawNetMessage, GcError> {
        if self.yielded() {
            return Err(GcError::Yielded);
        }
        let job = async || {
            self.unless_yielded(with_timeout(label, self.gc.job_untyped(UntypedMessage(req), kind, true))).await
        };
        self.with_claim(label, job).await
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
        if account_ids.is_empty() {
            return HashMap::new();
        }
        // Unclaimed on purpose: persona requests go to Steam, not the GC, and need no GamesPlayed.
        let updates = self.conn.on::<CMsgClientPersonaState>();
        let send = async |ids: &[u32]| {
            let mut req = CMsgClientRequestFriendData::new();
            req.persona_state_requested = Some(PERSONA_FLAGS_STATUS_PRESENCE_LAST_SEEN);
            req.friends = ids.iter().map(|&id| STEAM_ID_64_IDENT + u64::from(id)).collect();
            with_timeout("persona request", self.conn.send(req)).await
        };
        collect_personas(updates, account_ids, send, now_secs(), PERSONA_WAITS).await
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
        Ok(history_matches(&page).into_iter().map(|m| m.match_id).collect())
    }

    /// Every match in `account_id`'s history and whether it is complete. When Steam rate-limits
    /// part way, the pages fetched so far come back with `false`. `on_page` gets the number of
    /// matches on each page as it arrives.
    pub async fn fetch_history_matches(
        &self,
        account_id: u32,
        mut on_page: impl FnMut(usize),
    ) -> Result<(Vec<HistoryMatch>, bool), GcError> {
        let mut matches = Vec::new();
        let mut cursor = None;
        loop {
            let resp = match self.history_page(account_id, cursor).await {
                Ok(resp) => resp,
                Err(GcError::GcRateLimited) if !matches.is_empty() => return Ok((matches, false)),
                Err(e) => return Err(e),
            };
            if resp.matches.is_empty() {
                break;
            }
            let before = matches.len();
            matches.extend(history_matches(&resp));
            on_page(matches.len() - before);
            match next_history_cursor(cursor, resp.continue_cursor) {
                Some(next) => cursor = Some(next),
                None => break,
            }
        }
        Ok((matches, true))
    }
}

#[cfg(test)]
mod tests {
    use steam_vent::proto::steammessages_clientserver_friends::cmsg_client_friends_list::Friend;
    use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::Match as HistoryRowProto;
    use valveprotos::deadlock::ECitadelGameMode;

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
    fn a_zero_salt_reads_as_absent() {
        let got = interpret_salts_response(42, 7, &response(EResult::KEResultSuccess, Some(0), Some(2))).unwrap();
        assert_eq!(got.metadata_salt, None);
        assert_eq!(got.replay_salt, Some(2));
    }

    #[test]
    fn all_zero_salts_are_an_error() {
        let e = interpret_salts_response(42, 7, &response(EResult::KEResultSuccess, Some(0), Some(0))).unwrap_err();
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
    fn history_rows_carry_their_start_times() {
        let row = |match_id: Option<u64>, start_time: Option<u32>| HistoryRowProto {
            match_id,
            start_time,
            ..Default::default()
        };
        let resp = CMsgClientToGcGetMatchHistoryResponse {
            matches: vec![
                row(Some(30), Some(5_000)),
                row(None, Some(4_000)),
                row(Some(20), Some(0)),
                row(Some(10), None),
            ],
            ..history(HistoryResult::KEResultSuccess)
        };
        assert_eq!(
            history_matches(&resp),
            [
                HistoryMatch { match_id: 30, start_time: Some(5_000) },
                HistoryMatch { match_id: 20, start_time: None },
                HistoryMatch { match_id: 10, start_time: None },
            ]
        );
    }

    #[test]
    fn only_matchmade_history_rows_are_kept() {
        let row = |match_id: u64, match_mode: Option<ECitadelMatchMode>, game_mode: ECitadelGameMode| HistoryRowProto {
            match_id: Some(match_id),
            match_mode: match_mode.map(|m| m as i32),
            game_mode: Some(game_mode as i32),
            ..Default::default()
        };
        let resp = CMsgClientToGcGetMatchHistoryResponse {
            matches: vec![
                row(1, Some(ECitadelMatchMode::KECitadelMatchModeRanked), ECitadelGameMode::KECitadelGameModeNormal),
                row(2, Some(ECitadelMatchMode::KECitadelMatchModeUnranked), ECitadelGameMode::KECitadelGameModeNormal),
                row(
                    3,
                    Some(ECitadelMatchMode::KECitadelMatchModeUnranked),
                    ECitadelGameMode::KECitadelGameModeStreetBrawl,
                ),
                row(4, None, ECitadelGameMode::KECitadelGameModeNormal),
                row(
                    5,
                    Some(ECitadelMatchMode::KECitadelMatchModePrivateLobby),
                    ECitadelGameMode::KECitadelGameModeNormal,
                ),
                row(6, Some(ECitadelMatchMode::KECitadelMatchModeCoopBot), ECitadelGameMode::KECitadelGameModeNormal),
                row(
                    7,
                    Some(ECitadelMatchMode::KECitadelMatchModeServerTest),
                    ECitadelGameMode::KECitadelGameModeNormal,
                ),
                row(8, Some(ECitadelMatchMode::KECitadelMatchModeTutorial), ECitadelGameMode::KECitadelGameModeNormal),
                row(9, Some(ECitadelMatchMode::KECitadelMatchModeHeroLabs), ECitadelGameMode::KECitadelGameModeNormal),
                row(
                    10,
                    Some(ECitadelMatchMode::KECitadelMatchModeNewPlayerPlacement),
                    ECitadelGameMode::KECitadelGameModeNormal,
                ),
                row(11, Some(ECitadelMatchMode::KECitadelMatchModeInvalid), ECitadelGameMode::KECitadelGameModeNormal),
            ],
            ..history(HistoryResult::KEResultSuccess)
        };
        let ids: Vec<u64> = history_matches(&resp).into_iter().map(|m| m.match_id).collect();
        assert_eq!(ids, [1, 2, 3, 4]);
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

    #[test]
    fn release_reports_no_game_played() {
        assert!(not_playing().games_played.is_empty());
    }

    fn playing_state(blocked: Option<bool>, app: Option<u32>) -> SessionEvent {
        let mut msg = CMsgClientPlayingSessionState::new();
        msg.playing_blocked = blocked;
        msg.playing_app = app;
        SessionEvent::Playing(msg)
    }

    #[test]
    fn a_blocked_session_yields() {
        assert_eq!(on_session_event(&playing_state(Some(true), Some(730))), SessionAction::Yield);
        assert_eq!(on_session_event(&playing_state(Some(true), None)), SessionAction::Yield);
    }

    #[test]
    fn our_own_claim_and_release_keep_going() {
        assert_eq!(on_session_event(&playing_state(Some(false), Some(DEADLOCK_APP_ID))), SessionAction::Keep);
        assert_eq!(on_session_event(&playing_state(Some(false), Some(0))), SessionAction::Keep);
        assert_eq!(on_session_event(&playing_state(None, None)), SessionAction::Keep);
    }

    #[test]
    fn a_logoff_or_a_closed_connection_yields() {
        assert_eq!(on_session_event(&SessionEvent::LoggedOff), SessionAction::Yield);
        assert_eq!(on_session_event(&SessionEvent::Closed), SessionAction::Yield);
    }

    #[test]
    fn a_claim_reports_deadlock_only() {
        let ids: Vec<_> = playing().games_played.iter().map(|g| g.game_id).collect();
        assert_eq!(ids, vec![Some(u64::from(DEADLOCK_APP_ID))]);
    }

    type Update = Result<CMsgClientPersonaState, &'static str>;

    fn persona_state(ids: &[u32]) -> Update {
        let mut msg = CMsgClientPersonaState::new();
        msg.friends = ids
            .iter()
            .map(|&id| {
                let mut f = PersonaFriend::new();
                f.friendid = Some(STEAM_ID_64_IDENT + u64::from(id));
                f.persona_state = Some(1);
                f
            })
            .collect();
        Ok(msg)
    }

    /// A fake Steam: each request is recorded and `reply` turns it into the updates the
    /// subscription then yields. An empty queue never resolves, like a Steam that stays quiet.
    fn run_personas(
        ids: &[u32],
        waits: PersonaWaits,
        mut reply: impl FnMut(usize, &[u32]) -> Vec<Update>,
    ) -> (HashMap<u32, Persona>, Vec<Vec<u32>>, Duration) {
        let queue = std::cell::RefCell::new(std::collections::VecDeque::new());
        let sent = std::cell::RefCell::new(Vec::new());
        let updates = stream::poll_fn(|_| match queue.borrow_mut().pop_front() {
            Some(update) => std::task::Poll::Ready(Some(update)),
            None => std::task::Poll::Pending,
        });
        let send = async |batch: &[u32]| {
            let n = sent.borrow().len();
            sent.borrow_mut().push(batch.to_vec());
            queue.borrow_mut().extend(reply(n, batch));
            Ok(())
        };
        let rt = tokio::runtime::Builder::new_current_thread().enable_time().build().unwrap();
        let start = Instant::now();
        let personas = rt.block_on(collect_personas(updates, ids, send, 100, waits));
        (personas, sent.into_inner(), start.elapsed())
    }

    const QUICK: PersonaWaits = PersonaWaits { batch: Duration::from_millis(100), total: Duration::from_secs(5) };

    #[test]
    fn personas_are_requested_in_batches_of_at_most_eight() {
        let ids: Vec<u32> = (1..=20).collect();
        let (personas, sent, _) = run_personas(&ids, QUICK, |_, batch| vec![persona_state(batch)]);
        assert_eq!(personas.len(), 20);
        assert!(sent.iter().all(|b| b.len() <= PERSONA_BATCH), "{sent:?}");
        assert_eq!(sent.concat(), ids);
    }

    #[test]
    fn a_lagged_receiver_rerequests_the_pending_friends_once() {
        let (personas, sent, _) = run_personas(&[1, 2, 3], QUICK, |n, batch| match n {
            0 => vec![persona_state(&[1]), Err("lagged")],
            _ => vec![Err("lagged"), persona_state(batch)],
        });
        assert_eq!(sent, vec![vec![1, 2, 3], vec![2, 3]]);
        assert_eq!(personas.len(), 3);
    }

    #[test]
    fn a_friend_steam_never_answers_costs_one_batch_wait() {
        let ids: Vec<u32> = (1..=16).collect();
        let waits = PersonaWaits { batch: Duration::from_millis(50), total: Duration::from_secs(5) };
        let (personas, _, elapsed) = run_personas(&ids, waits, |_, batch| {
            let answered: Vec<u32> = batch.iter().copied().filter(|&id| id != 5).collect();
            vec![persona_state(&answered)]
        });
        assert_eq!(personas.len(), 15);
        assert!(elapsed < Duration::from_secs(1), "{elapsed:?}");
    }

    #[test]
    fn a_silent_steam_stops_at_the_pass_limit() {
        let ids: Vec<u32> = (1..=200).collect();
        let waits = PersonaWaits { batch: Duration::from_millis(40), total: Duration::from_millis(200) };
        let (personas, sent, elapsed) = run_personas(&ids, waits, |_, _| Vec::new());
        assert!(personas.is_empty());
        assert!(elapsed < Duration::from_millis(600), "{elapsed:?}");
        assert!(sent.len() < ids.len().div_ceil(PERSONA_BATCH), "{} batches", sent.len());
    }
}
