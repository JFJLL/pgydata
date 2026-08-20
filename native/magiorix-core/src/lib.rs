use std::collections::{BTreeMap, HashMap, HashSet};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hmac::{Hmac, Mac};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroize;

type HmacSha256 = Hmac<Sha256>;

pub const CORE_VERSION: &str = "1.4.2";
pub const PROTOCOL_VERSION: u16 = 1;
pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
pub const RECEIPT_GENESIS_HASH: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CoreError {
    #[error("protocol version is not supported")]
    UnsupportedProtocol,
    #[error("frame exceeds the maximum permitted size")]
    OversizedFrame,
    #[error("frame is truncated or malformed")]
    InvalidFrame,
    #[error("frame encoding is not canonical MessagePack")]
    NonCanonicalFrame,
    #[error("frame HMAC verification failed")]
    InvalidHmac,
    #[error("frame sequence is not strictly increasing")]
    InvalidSequence,
    #[error("command is not permitted")]
    UnknownCommand,
    #[error("ticket validation failed: {0}")]
    Ticket(&'static str),
    #[error("authorization handle is not valid in this core session")]
    InvalidHandle,
    #[error("receipt state transition is invalid")]
    ReceiptState,
    #[error("budget limit would be exceeded")]
    BudgetExceeded,
    #[error("pgy-kol planning input is invalid: {0}")]
    PgyPlan(&'static str),
    #[error("serialization failed")]
    Serialization,
}

pub type CoreResult<T> = Result<T, CoreError>;

pub fn canonical_messagepack<T: Serialize>(value: &T) -> CoreResult<Vec<u8>> {
    rmp_serde::to_vec_named(value).map_err(|_| CoreError::Serialization)
}

pub fn decode_canonical_messagepack<T>(raw: &[u8]) -> CoreResult<T>
where
    T: DeserializeOwned + Serialize,
{
    let value: T = rmp_serde::from_slice(raw).map_err(|_| CoreError::InvalidFrame)?;
    if canonical_messagepack(&value)? != raw {
        return Err(CoreError::NonCanonicalFrame);
    }
    Ok(value)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecureFrame {
    pub protocol_version: u16,
    pub sequence: u64,
    pub request_id: Uuid,
    pub command: String,
    pub payload: Value,
    pub hmac: Vec<u8>,
}

impl SecureFrame {
    pub fn unsigned_bytes(&self) -> CoreResult<Vec<u8>> {
        #[derive(Serialize)]
        struct Unsigned<'a> {
            protocol_version: u16,
            sequence: u64,
            request_id: Uuid,
            command: &'a str,
            payload: &'a Value,
        }
        canonical_messagepack(&Unsigned {
            protocol_version: self.protocol_version,
            sequence: self.sequence,
            request_id: self.request_id,
            command: &self.command,
            payload: &self.payload,
        })
    }

    pub fn sign(mut self, secret: &[u8; 32]) -> CoreResult<Self> {
        let mut mac =
            HmacSha256::new_from_slice(secret).expect("HMAC accepts arbitrary key length");
        mac.update(&self.unsigned_bytes()?);
        self.hmac = mac.finalize().into_bytes().to_vec();
        Ok(self)
    }

    pub fn verify(&self, secret: &[u8; 32]) -> CoreResult<()> {
        if self.protocol_version != PROTOCOL_VERSION {
            return Err(CoreError::UnsupportedProtocol);
        }
        let mut mac =
            HmacSha256::new_from_slice(secret).expect("HMAC accepts arbitrary key length");
        mac.update(&self.unsigned_bytes()?);
        mac.verify_slice(&self.hmac)
            .map_err(|_| CoreError::InvalidHmac)
    }
}

pub fn encode_length_prefixed(frame: &SecureFrame) -> CoreResult<Vec<u8>> {
    let body = canonical_messagepack(frame)?;
    if body.is_empty() || body.len() > MAX_FRAME_BYTES {
        return Err(CoreError::OversizedFrame);
    }
    let length = u32::try_from(body.len()).map_err(|_| CoreError::OversizedFrame)?;
    let mut encoded = Vec::with_capacity(body.len() + 4);
    encoded.extend_from_slice(&length.to_be_bytes());
    encoded.extend_from_slice(&body);
    Ok(encoded)
}

pub fn decode_length_prefixed<T>(raw: &[u8]) -> CoreResult<T>
where
    T: DeserializeOwned + Serialize,
{
    if raw.len() < 5 {
        return Err(CoreError::InvalidFrame);
    }
    let size =
        u32::from_be_bytes(raw[0..4].try_into().map_err(|_| CoreError::InvalidFrame)?) as usize;
    if size == 0 || size > MAX_FRAME_BYTES || raw.len() != size + 4 {
        return Err(CoreError::OversizedFrame);
    }
    decode_canonical_messagepack(&raw[4..])
}

pub struct SessionGuard {
    secret: [u8; 32],
    next_sequence: u64,
    used_request_ids: HashSet<Uuid>,
}

impl SessionGuard {
    pub fn new(secret: [u8; 32]) -> Self {
        Self {
            secret,
            next_sequence: 1,
            used_request_ids: HashSet::new(),
        }
    }

    pub fn verify_inbound(&mut self, frame: &SecureFrame) -> CoreResult<()> {
        frame.verify(&self.secret)?;
        if frame.sequence != self.next_sequence || !self.used_request_ids.insert(frame.request_id) {
            return Err(CoreError::InvalidSequence);
        }
        self.next_sequence += 1;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PricingPolicy {
    pub points_per_item: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskDescriptor {
    pub plugin_id: String,
    pub task_type: String,
    pub client_task_id: String,
    pub item_count: u32,
    pub input_merkle_root: String,
    pub selected_fields: Vec<String>,
    pub filter_state: BTreeMap<String, Value>,
    pub max_count: Option<u32>,
    pub account_source: String,
    pub pace_policy_id: String,
    pub pricing_policy: PricingPolicy,
}

fn canonical_json(value: &Value) -> CoreResult<String> {
    match value {
        Value::Null => Ok("null".to_string()),
        Value::Bool(value) => Ok(if *value {
            "true".to_string()
        } else {
            "false".to_string()
        }),
        Value::Number(value) => Ok(value.to_string()),
        Value::String(value) => serde_json::to_string(value).map_err(|_| CoreError::Serialization),
        Value::Array(values) => {
            let mut encoded = Vec::with_capacity(values.len());
            for value in values {
                encoded.push(canonical_json(value)?);
            }
            Ok(format!("[{}]", encoded.join(",")))
        }
        Value::Object(values) => {
            let mut ordered = values.iter().collect::<Vec<_>>();
            ordered.sort_by(|(left, _), (right, _)| left.as_bytes().cmp(right.as_bytes()));
            let mut encoded = Vec::with_capacity(ordered.len());
            for (key, value) in ordered {
                encoded.push(format!(
                    "{}:{}",
                    serde_json::to_string(key).map_err(|_| CoreError::Serialization)?,
                    canonical_json(value)?
                ));
            }
            Ok(format!("{{{}}}", encoded.join(",")))
        }
    }
}

impl TaskDescriptor {
    pub fn canonicalize(mut self) -> CoreResult<Self> {
        self.plugin_id = self.plugin_id.trim().to_string();
        self.task_type = self.task_type.trim().to_string();
        self.client_task_id = self.client_task_id.trim().to_string();
        self.account_source = self.account_source.trim().to_string();
        self.pace_policy_id = self.pace_policy_id.trim().to_string();
        if self.plugin_id.is_empty()
            || self.task_type.is_empty()
            || self.client_task_id.is_empty()
            || self.item_count == 0
        {
            return Err(CoreError::Ticket(
                "task descriptor identity or item count is missing",
            ));
        }
        if self.input_merkle_root.len() != 64
            || !self
                .input_merkle_root
                .bytes()
                .all(|b| b.is_ascii_hexdigit())
        {
            return Err(CoreError::Ticket(
                "task descriptor input Merkle root is invalid",
            ));
        }
        self.selected_fields = self
            .selected_fields
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect();
        self.selected_fields.sort();
        self.selected_fields.dedup();
        Ok(self)
    }

    pub fn canonical_json(&self) -> CoreResult<String> {
        let value = serde_json::to_value(self).map_err(|_| CoreError::Serialization)?;
        canonical_json(&value)
    }

    pub fn digest(&self) -> CoreResult<String> {
        Ok(sha256_hex(self.canonical_json()?.as_bytes()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TicketPayload {
    pub version: String,
    pub kid: String,
    pub jti: String,
    pub authorization_id: String,
    pub user_id: u64,
    pub device_key_id: String,
    pub client_task_id: String,
    pub task_type: String,
    pub task_digest: String,
    pub max_items: u32,
    pub points_per_item: u32,
    pub policy_version: String,
    pub minimum_client_version: String,
    pub issued_at_unix: i64,
    pub expires_at_unix: i64,
    pub nonce: String,
}

#[derive(Debug, Clone)]
pub struct TicketBinding<'a> {
    pub user_id: u64,
    pub device_key_id: &'a str,
    pub client_task_id: &'a str,
    pub task_digest: &'a str,
    pub requested_items: u32,
    pub client_version: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthorizationHandle {
    pub handle: Uuid,
    pub authorization_id: String,
    pub ticket_jti: String,
    pub task_digest: String,
    pub max_items: u32,
}

pub struct TicketVerifier {
    trusted_keys: BTreeMap<String, VerifyingKey>,
    consumed_jtis: HashSet<String>,
}

impl TicketVerifier {
    pub fn new(keys: BTreeMap<String, VerifyingKey>) -> Self {
        Self {
            trusted_keys: keys,
            consumed_jtis: HashSet::new(),
        }
    }

    pub fn verify(
        &mut self,
        ticket: &TicketPayload,
        signature_b64: &str,
        expected: &TicketBinding<'_>,
        now_unix: i64,
    ) -> CoreResult<AuthorizationHandle> {
        let key = self
            .trusted_keys
            .get(&ticket.kid)
            .ok_or(CoreError::Ticket("untrusted kid"))?;
        let signature_bytes = BASE64
            .decode(signature_b64)
            .map_err(|_| CoreError::Ticket("invalid signature encoding"))?;
        let signature = Signature::from_slice(&signature_bytes)
            .map_err(|_| CoreError::Ticket("invalid signature"))?;
        key.verify(&canonical_messagepack(ticket)?, &signature)
            .map_err(|_| CoreError::Ticket("signature mismatch"))?;
        if ticket.expires_at_unix <= now_unix
            || ticket.issued_at_unix > now_unix
            || ticket.max_items == 0
        {
            return Err(CoreError::Ticket("expired or invalid time window"));
        }
        if ticket.user_id != expected.user_id
            || ticket.device_key_id != expected.device_key_id
            || ticket.client_task_id != expected.client_task_id
            || ticket.task_digest != expected.task_digest
            || ticket.max_items < expected.requested_items
            || ticket.minimum_client_version.as_str() > expected.client_version
        {
            return Err(CoreError::Ticket("ticket binding mismatch"));
        }
        if !self.consumed_jtis.insert(ticket.jti.clone()) {
            return Err(CoreError::Ticket("ticket jti replay"));
        }
        Ok(AuthorizationHandle {
            handle: Uuid::new_v4(),
            authorization_id: ticket.authorization_id.clone(),
            ticket_jti: ticket.jti.clone(),
            task_digest: ticket.task_digest.clone(),
            max_items: ticket.max_items,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Receipt {
    pub authorization_id: String,
    pub ticket_jti: String,
    pub sequence: u64,
    pub previous_receipt_hash: String,
    pub processed_count: u32,
    pub success_count: u32,
    pub failed_count: u32,
    pub task_state: String,
    pub final_receipt: bool,
    pub device_key_id: String,
    pub receipt_hash: String,
    pub device_signature_b64: String,
}

pub struct ReceiptEngine {
    device_key_id: String,
    signing_key: SigningKey,
    active: HashMap<Uuid, ReceiptState>,
}

struct ReceiptState {
    handle: AuthorizationHandle,
    processed: u32,
    success: u32,
    failed: u32,
    sequence: u64,
    previous_hash: String,
    finalized: bool,
}

impl ReceiptEngine {
    pub fn new(device_key_id: String, signing_key: SigningKey) -> Self {
        Self {
            device_key_id,
            signing_key,
            active: HashMap::new(),
        }
    }

    pub fn begin(&mut self, handle: AuthorizationHandle) {
        self.active.insert(
            handle.handle,
            ReceiptState {
                handle,
                processed: 0,
                success: 0,
                failed: 0,
                sequence: 0,
                previous_hash: RECEIPT_GENESIS_HASH.to_string(),
                finalized: false,
            },
        );
    }

    pub fn append(
        &mut self,
        handle_id: Uuid,
        success_delta: u32,
        failed_delta: u32,
        task_state: &str,
        final_receipt: bool,
    ) -> CoreResult<Receipt> {
        let state = self
            .active
            .get_mut(&handle_id)
            .ok_or(CoreError::InvalidHandle)?;
        if state.finalized {
            return Err(CoreError::ReceiptState);
        }
        let delta = success_delta
            .checked_add(failed_delta)
            .ok_or(CoreError::BudgetExceeded)?;
        let next_processed = state
            .processed
            .checked_add(delta)
            .ok_or(CoreError::BudgetExceeded)?;
        if next_processed > state.handle.max_items {
            return Err(CoreError::BudgetExceeded);
        }
        state.processed = next_processed;
        state.success = state
            .success
            .checked_add(success_delta)
            .ok_or(CoreError::BudgetExceeded)?;
        state.failed = state
            .failed
            .checked_add(failed_delta)
            .ok_or(CoreError::BudgetExceeded)?;
        state.sequence += 1;
        #[derive(Serialize)]
        struct ReceiptBody<'a> {
            authorization_id: &'a str,
            ticket_jti: &'a str,
            sequence: u64,
            previous_receipt_hash: &'a str,
            processed_count: u32,
            success_count: u32,
            failed_count: u32,
            task_state: &'a str,
            final_receipt: bool,
            device_key_id: &'a str,
        }
        let body = ReceiptBody {
            authorization_id: &state.handle.authorization_id,
            ticket_jti: &state.handle.ticket_jti,
            sequence: state.sequence,
            previous_receipt_hash: &state.previous_hash,
            processed_count: state.processed,
            success_count: state.success,
            failed_count: state.failed,
            task_state,
            final_receipt,
            device_key_id: &self.device_key_id,
        };
        let canonical = canonical_messagepack(&body)?;
        let receipt_hash = sha256_hex(&canonical);
        let signature = BASE64.encode(self.signing_key.sign(&canonical).to_bytes());
        let receipt = Receipt {
            authorization_id: state.handle.authorization_id.clone(),
            ticket_jti: state.handle.ticket_jti.clone(),
            sequence: state.sequence,
            previous_receipt_hash: state.previous_hash.clone(),
            processed_count: state.processed,
            success_count: state.success,
            failed_count: state.failed,
            task_state: task_state.to_string(),
            final_receipt,
            device_key_id: self.device_key_id.clone(),
            receipt_hash: receipt_hash.clone(),
            device_signature_b64: signature,
        };
        state.previous_hash = receipt_hash;
        state.finalized = final_receipt;
        Ok(receipt)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PgyPlanInput {
    pub filter_state: BTreeMap<String, Value>,
    pub max_count: u32,
    pub page_size: u16,
    pub max_pages: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PgyPlan {
    pub normalized_filter_state: BTreeMap<String, Value>,
    pub page_size: u16,
    pub max_pages: u16,
    pub permitted_items: u32,
}

pub fn plan_pgy_kol(mut input: PgyPlanInput) -> CoreResult<PgyPlan> {
    if input.max_count == 0
        || input.page_size == 0
        || input.page_size > 100
        || input.max_pages == 0
        || input.max_pages > 250
    {
        return Err(CoreError::PgyPlan("budget is outside permitted bounds"));
    }
    for (key, value) in input.filter_state.iter_mut() {
        if key.is_empty()
            || key.len() > 96
            || !key
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        {
            return Err(CoreError::PgyPlan("filter key is invalid"));
        }
        if let Value::String(text) = value {
            let normalized = text.trim();
            if normalized.len() > 512 {
                return Err(CoreError::PgyPlan("filter string is too long"));
            }
            *text = normalized.to_string();
        }
    }
    let capacity = u32::from(input.page_size) * u32::from(input.max_pages);
    Ok(PgyPlan {
        normalized_filter_state: input.filter_state,
        page_size: input.page_size,
        max_pages: input.max_pages,
        permitted_items: input.max_count.min(capacity),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DevicePublicIdentity {
    pub device_key_id: String,
    pub signing_public_key_b64: String,
    pub signing_algorithm: String,
    pub key_backend: String,
}

pub struct DeviceSigningKey {
    device_key_id: String,
    signing_key: SigningKey,
    key_backend: String,
}

impl DeviceSigningKey {
    pub fn generate_software(device_key_id: String) -> Self {
        let signing_key = SigningKey::generate(&mut rand_core::OsRng);
        Self {
            device_key_id,
            signing_key,
            key_backend: "dpapi-current-user".to_string(),
        }
    }

    pub fn public_identity(&self) -> DevicePublicIdentity {
        DevicePublicIdentity {
            device_key_id: self.device_key_id.clone(),
            signing_public_key_b64: BASE64.encode(self.signing_key.verifying_key().to_bytes()),
            signing_algorithm: "Ed25519".to_string(),
            key_backend: self.key_backend.clone(),
        }
    }

    pub fn sign(&self, payload: &[u8]) -> String {
        BASE64.encode(self.signing_key.sign(payload).to_bytes())
    }

    pub fn export_dpapi_protected(&self) -> CoreResult<Vec<u8>> {
        #[cfg(windows)]
        {
            return dpapi::protect_current_user(&self.signing_key.to_keypair_bytes());
        }
        #[cfg(not(windows))]
        {
            Err(CoreError::Ticket(
                "DPAPI backend is only available on Windows",
            ))
        }
    }
}

#[cfg(windows)]
pub mod dpapi {
    use super::{CoreError, CoreResult};
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, DATA_BLOB,
        },
        System::Memory::LocalFree,
    };

    fn blob(bytes: &[u8]) -> DATA_BLOB {
        DATA_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        }
    }

    unsafe fn consume(blob: DATA_BLOB) -> Vec<u8> {
        let result = slice::from_raw_parts(blob.pbData, blob.cbData as usize).to_vec();
        LocalFree(blob.pbData as isize);
        result
    }

    pub fn protect_current_user(plaintext: &[u8]) -> CoreResult<Vec<u8>> {
        if plaintext.is_empty() {
            return Err(CoreError::Ticket("device key material is empty"));
        }
        let input = blob(plaintext);
        let mut output = DATA_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &input,
                ptr::null(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 || output.pbData.is_null() {
            return Err(CoreError::Ticket("DPAPI protect failed"));
        }
        Ok(unsafe { consume(output) })
    }

    pub fn unprotect_current_user(ciphertext: &[u8]) -> CoreResult<Vec<u8>> {
        if ciphertext.is_empty() {
            return Err(CoreError::Ticket("protected device key material is empty"));
        }
        let input = blob(ciphertext);
        let mut output = DATA_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 || output.pbData.is_null() {
            return Err(CoreError::Ticket("DPAPI unprotect failed"));
        }
        Ok(unsafe { consume(output) })
    }
}

pub struct SecretMaterial(pub [u8; 32]);
impl Drop for SecretMaterial {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;

    #[test]
    fn frame_rejects_sequence_replay_and_hmac_tamper() {
        let secret = [7_u8; 32];
        let mut guard = SessionGuard::new(secret);
        let frame = SecureFrame {
            protocol_version: PROTOCOL_VERSION,
            sequence: 1,
            request_id: Uuid::new_v4(),
            command: "health".into(),
            payload: Value::Null,
            hmac: vec![],
        }
        .sign(&secret)
        .unwrap();
        guard.verify_inbound(&frame).unwrap();
        assert_eq!(
            guard.verify_inbound(&frame),
            Err(CoreError::InvalidSequence)
        );
        let mut bad = SecureFrame {
            protocol_version: PROTOCOL_VERSION,
            sequence: 2,
            request_id: Uuid::new_v4(),
            command: "health".into(),
            payload: Value::Null,
            hmac: vec![],
        }
        .sign(&secret)
        .unwrap();
        bad.hmac[0] ^= 1;
        assert_eq!(guard.verify_inbound(&bad), Err(CoreError::InvalidHmac));
    }

    #[test]
    fn ticket_binding_replay_and_receipt_budget_are_enforced() {
        let ticket_signer = SigningKey::from_bytes(&[3_u8; 32]);
        let mut keys = BTreeMap::new();
        keys.insert("key-1".to_string(), ticket_signer.verifying_key());
        let ticket = TicketPayload {
            version: "1".into(),
            kid: "key-1".into(),
            jti: "jti-1".into(),
            authorization_id: "auth-1".into(),
            user_id: 7,
            device_key_id: "device-1".into(),
            client_task_id: "task-1".into(),
            task_type: "pgy".into(),
            task_digest: "a".repeat(64),
            max_items: 2,
            points_per_item: 1,
            policy_version: "1".into(),
            minimum_client_version: "1.4.2".into(),
            issued_at_unix: 100,
            expires_at_unix: 200,
            nonce: "n".into(),
        };
        let signature = BASE64.encode(
            ticket_signer
                .sign(&canonical_messagepack(&ticket).unwrap())
                .to_bytes(),
        );
        let binding = TicketBinding {
            user_id: 7,
            device_key_id: "device-1",
            client_task_id: "task-1",
            task_digest: &ticket.task_digest,
            requested_items: 2,
            client_version: "1.4.2",
        };
        let mut verifier = TicketVerifier::new(keys);
        let handle = verifier.verify(&ticket, &signature, &binding, 150).unwrap();
        assert_eq!(
            verifier.verify(&ticket, &signature, &binding, 150),
            Err(CoreError::Ticket("ticket jti replay"))
        );
        let device = SigningKey::from_bytes(&[4_u8; 32]);
        let mut receipts = ReceiptEngine::new("device-1".into(), device);
        receipts.begin(handle.clone());
        let receipt = receipts
            .append(handle.handle, 1, 1, "completed", true)
            .unwrap();
        assert_eq!(receipt.processed_count, 2);
        assert_eq!(
            receipts.append(handle.handle, 1, 0, "completed", false),
            Err(CoreError::ReceiptState)
        );
    }

    #[test]
    fn task_digest_and_pgy_plan_are_deterministic_and_bounded() {
        let descriptor = TaskDescriptor {
            plugin_id: "pgy-kol".into(),
            task_type: "search".into(),
            client_task_id: "task".into(),
            item_count: 1,
            input_merkle_root: "a".repeat(64),
            selected_fields: vec!["b".into(), "a".into(), "a".into()],
            filter_state: BTreeMap::new(),
            max_count: Some(10),
            account_source: "default".into(),
            pace_policy_id: "default".into(),
            pricing_policy: PricingPolicy { points_per_item: 1 },
        }
        .canonicalize()
        .unwrap();
        assert_eq!(descriptor.selected_fields, vec!["a", "b"]);
        assert_eq!(descriptor.digest().unwrap(), descriptor.digest().unwrap());
        let plan = plan_pgy_kol(PgyPlanInput {
            filter_state: BTreeMap::new(),
            max_count: 1000,
            page_size: 20,
            max_pages: 3,
        })
        .unwrap();
        assert_eq!(plan.permitted_items, 60);
        assert!(plan_pgy_kol(PgyPlanInput {
            filter_state: BTreeMap::new(),
            max_count: 1,
            page_size: 101,
            max_pages: 1
        })
        .is_err());
    }
}
