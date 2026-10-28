pub mod limiter;
pub mod retry;

pub struct Http(pub reqwest::Client);

impl Default for Http {
    fn default() -> Self {
        Self(
            reqwest::Client::builder()
                .user_agent("deadlock-plus")
                .build()
                .expect("reqwest client builds with static config"),
        )
    }
}
