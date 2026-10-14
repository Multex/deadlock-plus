use std::path::{Path, PathBuf};

use base64::Engine;
use keyvalues_parser::{Value, Vdf};

use crate::error::GcError;

/// A recovered Steam session for one account. `refresh_token` is a live credential: keep it in
/// memory only. Never log it, persist it or send it anywhere but Steam.
pub struct AuthContext {
    pub account_name: String,
    pub steam_id64: u64,
    pub refresh_token: String,
}

/// The 32-bit account id deadlock-api expects, from a SteamID64.
pub fn account_id_of(steam_id64: u64) -> u32 {
    (steam_id64 & 0xFFFF_FFFF) as u32
}

impl AuthContext {
    pub fn account_id(&self) -> u32 {
        account_id_of(self.steam_id64)
    }
}

impl std::fmt::Debug for AuthContext {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthContext")
            .field("account_name", &self.account_name)
            .field("steam_id64", &self.steam_id64)
            .field("refresh_token", &"<redacted>")
            .finish()
    }
}

fn err(msg: impl Into<String>) -> GcError {
    GcError::AuthUnavailable(msg.into())
}

// Steam reads VDF keys case-insensitively and real files mix casings, so exact lookups miss.
fn child<'a>(value: &'a Value<'a>, key: &str) -> Option<&'a Value<'a>> {
    value.get_obj()?.iter().find(|(k, _)| k.eq_ignore_ascii_case(key))?.1.first()
}

fn parse_vdf<'a>(text: &'a str, what: &str) -> Result<Vdf<'a>, GcError> {
    keyvalues_parser::parse(text).map(Vdf::from).map_err(|e| err(format!("cannot parse {what}: {e}")))
}

pub fn connect_cache_blob(vdf_text: &str, account: &str) -> Result<Vec<u8>, GcError> {
    let vdf = parse_vdf(vdf_text, "local.vdf")?;
    let cache = ["Software", "Valve", "Steam", "ConnectCache"]
        .into_iter()
        .try_fold(&vdf.value, child)
        .and_then(Value::get_obj)
        .ok_or_else(|| err("local.vdf has no ConnectCache section (no remembered Steam login?)"))?;

    let prefix = format!("{:08x}", crc32fast::hash(account.as_bytes()));
    let hex_value = cache
        .iter()
        .find(|(subkey, _)| subkey.get(..prefix.len()).is_some_and(|p| p.eq_ignore_ascii_case(&prefix)))
        .and_then(|(_, values)| values.first())
        .and_then(Value::get_str)
        .ok_or_else(|| err("no ConnectCache entry for this account (logged out or 'remember me' off?)"))?;
    hex::decode(hex_value).map_err(|e| err(format!("invalid ConnectCache hex: {e}")))
}

pub fn steam_id_from_jwt(jwt: &str) -> Result<u64, GcError> {
    let payload = jwt.split('.').nth(1).ok_or_else(|| err("token is not a JWT"))?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|e| err(format!("cannot decode token payload: {e}")))?;
    let json: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| err(format!("cannot parse token payload: {e}")))?;

    if json.get("iss").and_then(serde_json::Value::as_str) != Some("steam") {
        return Err(err("token issuer is not steam"));
    }
    json.get("sub")
        .and_then(serde_json::Value::as_str)
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or_else(|| err("token has no SteamID"))
}

/// Linux Steam encrypts the token with AES-256 keyed by SHA-256 of the account name. The
/// first block is the CBC IV, itself encrypted with the same key in ECB mode.
pub fn decrypt_aes_blob(blob: &[u8], account: &str) -> Result<String, GcError> {
    use aes::cipher::generic_array::GenericArray;
    use aes::cipher::{block_padding::Pkcs7, BlockDecrypt, BlockDecryptMut, KeyInit, KeyIvInit};
    use sha2::{Digest, Sha256};

    if blob.len() < 32 {
        return Err(err("ConnectCache blob too short"));
    }
    let key = Sha256::digest(account.as_bytes());
    let cipher = aes::Aes256::new_from_slice(key.as_slice()).map_err(|e| err(format!("aes key error: {e}")))?;
    let mut iv = GenericArray::clone_from_slice(&blob[0..16]);
    cipher.decrypt_block(&mut iv);

    let plaintext = cbc::Decryptor::<aes::Aes256>::new_from_slices(key.as_slice(), iv.as_slice())
        .map_err(|e| err(format!("aes iv error: {e}")))?
        .decrypt_padded_vec_mut::<Pkcs7>(&blob[16..])
        .map_err(|e| err(format!("aes decrypt failed: {e}")))?;
    String::from_utf8(plaintext).map_err(|e| err(format!("token is not valid UTF-8: {e}")))
}

#[cfg(windows)]
fn decrypt_blob(blob: &[u8], account: &str) -> Result<String, GcError> {
    let plaintext = windows_dpapi::decrypt_data(blob, windows_dpapi::Scope::User, Some(account.as_bytes()))
        .map_err(|e| err(format!("DPAPI decrypt failed: {e}")))?;
    String::from_utf8(plaintext).map_err(|e| err(format!("token is not valid UTF-8: {e}")))
}

#[cfg(not(windows))]
fn decrypt_blob(blob: &[u8], account: &str) -> Result<String, GcError> {
    decrypt_aes_blob(blob, account)
}

/// Steam keeps `local.vdf` under `%LOCALAPPDATA%` on Windows and in the Steam folder elsewhere.
pub fn local_vdf_path(steam_dir: &Path) -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Steam").join("local.vdf"))
    } else {
        Some(steam_dir.join("local.vdf"))
    }
}

fn login_users(steam_dir: &Path) -> Result<Vec<(u64, String)>, GcError> {
    let path = steam_dir.join("config").join("loginusers.vdf");
    let text = std::fs::read_to_string(&path).map_err(|e| err(format!("cannot read loginusers.vdf: {e}")))?;
    let vdf = parse_vdf(&text, "loginusers.vdf")?;
    let users = vdf.value.get_obj().ok_or_else(|| err("loginusers.vdf has no users"))?;

    let mut accounts = Vec::new();
    for (key, entries) in users.iter() {
        let Ok(steam_id64) = key.parse::<u64>() else { continue };
        let Some(name) = entries.first().and_then(|u| child(u, "AccountName")).and_then(Value::get_str) else {
            continue;
        };
        accounts.push((steam_id64, name.to_lowercase()));
    }
    Ok(accounts)
}

/// Every remembered Steam account whose refresh token decrypts right now. Accounts that are
/// logged out, have "remember me" off or fail to decrypt are skipped.
pub fn recover_all(steam_dir: &Path) -> Result<Vec<AuthContext>, GcError> {
    let local_vdf = local_vdf_path(steam_dir).ok_or_else(|| err("could not resolve the local.vdf folder"))?;
    let text = std::fs::read_to_string(&local_vdf).map_err(|e| err(format!("cannot read local.vdf: {e}")))?;

    let mut contexts = Vec::new();
    for (steam_id64, account_name) in login_users(steam_dir)? {
        let recovered = connect_cache_blob(&text, &account_name)
            .and_then(|blob| decrypt_blob(&blob, &account_name))
            .and_then(|jwt| steam_id_from_jwt(&jwt).map(|sub| (jwt, sub)));
        match recovered {
            // The cache is keyed by account name, so reject a token whose identity differs from
            // the loginusers.vdf entry it was found through.
            Ok((refresh_token, sub)) if sub == steam_id64 => {
                contexts.push(AuthContext { account_name, steam_id64, refresh_token });
            }
            Ok(_) => log::warn!("gc: skipping account {steam_id64}: token identity mismatch"),
            Err(e) => log::debug!("gc: skipping account {steam_id64}: {e}"),
        }
    }
    if contexts.is_empty() {
        return Err(err("no decryptable Steam account found"));
    }
    Ok(contexts)
}

#[cfg(test)]
mod tests {
    use aes::cipher::generic_array::GenericArray;
    use aes::cipher::{block_padding::Pkcs7, BlockEncrypt, BlockEncryptMut, KeyInit, KeyIvInit};
    use base64::Engine;
    use sha2::{Digest, Sha256};

    use super::*;

    fn local_vdf(valve: &str, steam: &str, subkey: &str, value: &str) -> String {
        format!(
            "\"MachineUserConfigStore\" {{ \"Software\" {{ \"{valve}\" {{ \"{steam}\" {{ \
             \"ConnectCache\" {{ \"{subkey}\" \"{value}\" }} }} }} }} }}"
        )
    }

    fn key_for(account: &str) -> String {
        format!("{:08x}1", crc32fast::hash(account.as_bytes()))
    }

    fn jwt(payload: &str) -> String {
        let enc = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        format!("{}.{}.sig", enc.encode("{}"), enc.encode(payload))
    }

    fn aes_encrypt(plain: &[u8], account: &str) -> Vec<u8> {
        let key = Sha256::digest(account.as_bytes());
        let iv = [7u8; 16];
        let mut enc_iv = GenericArray::clone_from_slice(&iv);
        aes::Aes256::new_from_slice(&key).unwrap().encrypt_block(&mut enc_iv);
        let body =
            cbc::Encryptor::<aes::Aes256>::new_from_slices(&key, &iv).unwrap().encrypt_padded_vec_mut::<Pkcs7>(plain);
        [enc_iv.as_slice(), &body].concat()
    }

    #[test]
    fn account_id_is_the_low_32_bits() {
        let ctx = AuthContext { account_name: "a".into(), steam_id64: 76561198000000042, refresh_token: "t".into() };
        assert_eq!(ctx.account_id(), (76561198000000042u64 & 0xFFFF_FFFF) as u32);
    }

    #[test]
    fn debug_never_prints_the_token() {
        let ctx = AuthContext { account_name: "a".into(), steam_id64: 1, refresh_token: "SECRET-TOKEN".into() };
        let shown = format!("{ctx:?}");
        assert!(!shown.contains("SECRET-TOKEN"));
        assert!(shown.contains("redacted"));
    }

    #[test]
    fn connect_cache_lookup_ignores_key_case() {
        for (valve, steam) in [("Valve", "Steam"), ("valve", "steam"), ("VALVE", "sTeAm")] {
            let text = local_vdf(valve, steam, &key_for("someuser"), "0a0b");
            assert_eq!(connect_cache_blob(&text, "someuser"), Ok(vec![0x0a, 0x0b]), "{valve}/{steam}");
        }
    }

    #[test]
    fn connect_cache_lookup_ignores_hex_case() {
        let text = local_vdf("valve", "steam", &key_for("someuser").to_uppercase(), "0a0b");
        assert_eq!(connect_cache_blob(&text, "someuser"), Ok(vec![0x0a, 0x0b]));
    }

    #[test]
    fn connect_cache_lookup_misses_other_account() {
        let text = local_vdf("Valve", "Steam", &key_for("someoneelse"), "0a0b");
        let e = connect_cache_blob(&text, "someuser").unwrap_err();
        assert!(e.to_string().contains("no ConnectCache entry"), "{e}");
    }

    #[test]
    fn jwt_subject_is_read_from_a_steam_token() {
        assert_eq!(steam_id_from_jwt(&jwt(r#"{"iss":"steam","sub":"76561198000000042"}"#)), Ok(76561198000000042));
    }

    #[test]
    fn jwt_from_another_issuer_is_rejected() {
        assert!(steam_id_from_jwt(&jwt(r#"{"iss":"other","sub":"1"}"#)).is_err());
    }

    #[test]
    fn jwt_without_a_numeric_subject_is_rejected() {
        assert!(steam_id_from_jwt(&jwt(r#"{"iss":"steam","sub":"abc"}"#)).is_err());
        assert!(steam_id_from_jwt("not-a-jwt").is_err());
    }

    #[test]
    fn aes_blob_round_trips_with_the_account_as_key() {
        let blob = aes_encrypt(b"header.payload.sig", "someuser");
        assert_eq!(decrypt_aes_blob(&blob, "someuser"), Ok("header.payload.sig".into()));
    }

    #[test]
    fn aes_blob_for_another_account_fails() {
        let blob = aes_encrypt(b"header.payload.sig", "someuser");
        assert!(decrypt_aes_blob(&blob, "someoneelse").is_err());
    }

    #[test]
    fn aes_blob_too_short_fails() {
        assert!(decrypt_aes_blob(&[0; 16], "someuser").is_err());
    }

    #[test]
    fn local_vdf_lives_where_the_platform_keeps_it() {
        let dir = Path::new("steam-root");
        let path = local_vdf_path(dir).unwrap();
        if cfg!(windows) {
            assert_eq!(path.file_name().unwrap(), "local.vdf");
            assert!(!path.starts_with(dir));
        } else {
            assert_eq!(path, dir.join("local.vdf"));
        }
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_blob_round_trips_with_the_account_as_entropy() {
        let blob =
            windows_dpapi::encrypt_data(b"header.payload.sig", windows_dpapi::Scope::User, Some(b"someuser")).unwrap();
        assert_eq!(decrypt_blob(&blob, "someuser"), Ok("header.payload.sig".into()));
        assert!(decrypt_blob(&blob, "someoneelse").is_err());
    }
}
