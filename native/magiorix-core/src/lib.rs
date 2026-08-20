use std::collections::{BTreeMap, HashMap, HashSet};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hmac::{Hmac, Mac};
use hpke::{
    aead::{AeadTag, AesGcm256},
    kdf::HkdfSha256,
    kem::X25519HkdfSha256,
    Deserializable, Kem as KemTrait, OpModeR, Serializable,
};
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
pub const POLICY_PROTOCOL: &str = "magiorix-policy-hpke-v1";
pub const POLICY_AEAD: &str = "AES-256-GCM";
pub const MAX_STRATEGY_BUNDLE_BYTES: usize = 64 * 1024;

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
    #[error("strategy bundle validation failed: {0}")]
    Strategy(&'static str),
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

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    if value.len() % 2 != 0 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).ok())
        .collect()
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
#[serde(rename_all = "camelCase")]
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
    pub issued_at: String,
    pub expires_at: String,
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
        signature_hex: &str,
        expected: &TicketBinding<'_>,
        now_unix: i64,
    ) -> CoreResult<AuthorizationHandle> {
        let key = self
            .trusted_keys
            .get(&ticket.kid)
            .ok_or(CoreError::Ticket("untrusted kid"))?;
        let signature_bytes =
            hex_decode(signature_hex).ok_or(CoreError::Ticket("invalid signature encoding"))?;
        let signature = Signature::from_slice(&signature_bytes)
            .map_err(|_| CoreError::Ticket("invalid signature"))?;
        let signed_value = serde_json::to_value(ticket).map_err(|_| CoreError::Serialization)?;
        key.verify(canonical_json(&signed_value)?.as_bytes(), &signature)
            .map_err(|_| CoreError::Ticket("signature mismatch"))?;
        let issued = time::OffsetDateTime::parse(
            &ticket.issued_at,
            &time::format_description::well_known::Rfc3339,
        )
        .map_err(|_| CoreError::Ticket("invalid issue time"))?
        .unix_timestamp();
        let expires = time::OffsetDateTime::parse(
            &ticket.expires_at,
            &time::format_description::well_known::Rfc3339,
        )
        .map_err(|_| CoreError::Ticket("invalid expiry time"))?
        .unix_timestamp();
        if expires <= now_unix
            || issued > now_unix.saturating_add(60)
            || expires <= issued
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StrategyBundle {
    pub protocol: String,
    pub authorization_id: String,
    pub ticket_jti: String,
    pub device_key_id: String,
    pub task_digest: String,
    pub task_type: String,
    pub client_version: String,
    pub core_version: String,
    pub core_protocol_version: u16,
    pub release_manifest_key_id: Option<String>,
    pub ticket_key_id: String,
    pub policy_key_id: String,
    pub policy_version: String,
    pub issued_at: String,
    pub expires_at: String,
    pub bundle_digest: String,
    pub encapsulated_key: String,
    pub encrypted_bundle: String,
    pub bundle_signature: String,
    pub key_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StrategyBinding {
    pub protocol: String,
    pub authorization_id: String,
    pub ticket_jti: String,
    pub device_key_id: String,
    pub task_digest: String,
    pub task_type: String,
    pub client_version: String,
    pub core_version: String,
    pub core_protocol_version: u16,
    pub release_manifest_key_id: Option<String>,
    pub ticket_key_id: String,
    pub policy_key_id: String,
    pub policy_version: String,
    pub issued_at: String,
    pub expires_at: String,
    pub bundle_digest: String,
}

impl From<&StrategyBundle> for StrategyBinding {
    fn from(bundle: &StrategyBundle) -> Self {
        Self {
            protocol: bundle.protocol.clone(),
            authorization_id: bundle.authorization_id.clone(),
            ticket_jti: bundle.ticket_jti.clone(),
            device_key_id: bundle.device_key_id.clone(),
            task_digest: bundle.task_digest.clone(),
            task_type: bundle.task_type.clone(),
            client_version: bundle.client_version.clone(),
            core_version: bundle.core_version.clone(),
            core_protocol_version: bundle.core_protocol_version,
            release_manifest_key_id: bundle.release_manifest_key_id.clone(),
            ticket_key_id: bundle.ticket_key_id.clone(),
            policy_key_id: bundle.policy_key_id.clone(),
            policy_version: bundle.policy_version.clone(),
            issued_at: bundle.issued_at.clone(),
            expires_at: bundle.expires_at.clone(),
            bundle_digest: bundle.bundle_digest.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StrategyExpectedBinding {
    pub authorization_id: String,
    pub ticket_jti: String,
    pub device_key_id: String,
    pub task_digest: String,
    pub task_type: String,
    pub client_version: String,
    pub core_version: String,
    pub core_protocol_version: u16,
    pub release_manifest_key_id: Option<String>,
    pub ticket_key_id: String,
    pub policy_key_id: String,
    pub policy_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StrategyPolicy {
    pub policy_version: String,
    pub task_type: String,
    pub max_items: u32,
    pub points_per_item: u32,
    pub capabilities: StrategyCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StrategyCapabilities {
    pub export: bool,
    pub resume: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StrategyDecision {
    pub authorization_id: String,
    pub task_digest: String,
    pub task_type: String,
    pub policy_version: String,
    pub max_items: u32,
    pub points_per_item: u32,
    pub export_allowed: bool,
    pub resume_allowed: bool,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct SignedStrategyEnvelope {
    #[serde(flatten)]
    binding: StrategyBinding,
    encapsulated_key: String,
    encrypted_bundle: String,
}

pub struct StrategyVerifier {
    trusted_keys: BTreeMap<String, VerifyingKey>,
}

impl StrategyVerifier {
    pub fn new(trusted_keys: BTreeMap<String, VerifyingKey>) -> Self {
        Self { trusted_keys }
    }

    pub fn verify_and_decrypt(
        &self,
        bundle: &StrategyBundle,
        expected: &StrategyExpectedBinding,
        recipient_private_key: &[u8],
        now_unix: i64,
    ) -> CoreResult<StrategyDecision> {
        if bundle.protocol != POLICY_PROTOCOL || bundle.core_protocol_version != PROTOCOL_VERSION {
            return Err(CoreError::Strategy("unsupported policy protocol"));
        }
        if bundle.policy_key_id != bundle.key_id || bundle.policy_key_id != expected.policy_key_id {
            return Err(CoreError::Strategy("unexpected policy key id"));
        }
        let key = self
            .trusted_keys
            .get(&bundle.key_id)
            .ok_or(CoreError::Strategy("untrusted policy key"))?;
        let binding = StrategyBinding::from(bundle);
        let signed = SignedStrategyEnvelope {
            binding: binding.clone(),
            encapsulated_key: bundle.encapsulated_key.clone(),
            encrypted_bundle: bundle.encrypted_bundle.clone(),
        };
        let signed_value = serde_json::to_value(signed).map_err(|_| CoreError::Serialization)?;
        let signed_bytes = canonical_json(&signed_value)?.into_bytes();
        let signature_bytes = BASE64
            .decode(&bundle.bundle_signature)
            .map_err(|_| CoreError::Strategy("invalid strategy signature encoding"))?;
        let signature = Signature::from_slice(&signature_bytes)
            .map_err(|_| CoreError::Strategy("invalid strategy signature"))?;
        key.verify(&signed_bytes, &signature)
            .map_err(|_| CoreError::Strategy("strategy signature mismatch"))?;
        self.validate_binding(&binding, expected, now_unix)?;
        if recipient_private_key.len() != 32 {
            return Err(CoreError::Strategy("recipient private key is invalid"));
        }
        let mut key_bytes = recipient_private_key.to_vec();
        let recipient_key = <X25519HkdfSha256 as KemTrait>::PrivateKey::from_bytes(&key_bytes)
            .map_err(|_| CoreError::Strategy("recipient private key is malformed"))?;
        key_bytes.zeroize();
        let encapsulated = BASE64
            .decode(&bundle.encapsulated_key)
            .map_err(|_| CoreError::Strategy("encapsulated key encoding is invalid"))?;
        if encapsulated.len() != 32 {
            return Err(CoreError::Strategy("encapsulated key has invalid length"));
        }
        let encapped_key = <X25519HkdfSha256 as KemTrait>::EncappedKey::from_bytes(&encapsulated)
            .map_err(|_| CoreError::Strategy("encapsulated key is malformed"))?;
        let ciphertext = BASE64
            .decode(&bundle.encrypted_bundle)
            .map_err(|_| CoreError::Strategy("encrypted bundle encoding is invalid"))?;
        if ciphertext.len() <= 16 || ciphertext.len() > MAX_STRATEGY_BUNDLE_BYTES {
            return Err(CoreError::Strategy("encrypted bundle size is invalid"));
        }
        let context =
            canonical_json(&serde_json::to_value(&binding).map_err(|_| CoreError::Serialization)?)?
                .into_bytes();
        let mut receiver = hpke::setup_receiver::<AesGcm256, HkdfSha256, X25519HkdfSha256>(
            &OpModeR::Base,
            &recipient_key,
            &encapped_key,
            &context,
        )
        .map_err(|_| CoreError::Strategy("HPKE receiver setup failed"))?;
        let (encrypted, tag_bytes) = ciphertext.split_at(ciphertext.len() - 16);
        let tag = AeadTag::<AesGcm256>::from_bytes(tag_bytes)
            .map_err(|_| CoreError::Strategy("strategy authentication tag is invalid"))?;
        let mut plaintext = encrypted.to_vec();
        let open_result = receiver.open_in_place_detached(&mut plaintext, &context, &tag);
        if open_result.is_err() {
            plaintext.zeroize();
            return Err(CoreError::Strategy("HPKE authentication failed"));
        }
        if sha256_hex(&plaintext) != bundle.bundle_digest {
            plaintext.zeroize();
            return Err(CoreError::Strategy("strategy plaintext digest mismatch"));
        }
        let parsed = serde_json::from_slice::<StrategyPolicy>(&plaintext)
            .map_err(|_| CoreError::Strategy("strategy plaintext schema is invalid"));
        plaintext.zeroize();
        let policy = parsed?;
        if policy.policy_version != binding.policy_version
            || policy.task_type != binding.task_type
            || policy.max_items == 0
            || policy.points_per_item == 0
        {
            return Err(CoreError::Strategy("strategy plaintext binding mismatch"));
        }
        Ok(StrategyDecision {
            authorization_id: binding.authorization_id,
            task_digest: binding.task_digest,
            task_type: binding.task_type,
            policy_version: binding.policy_version,
            max_items: policy.max_items,
            points_per_item: policy.points_per_item,
            export_allowed: policy.capabilities.export,
            resume_allowed: policy.capabilities.resume,
            expires_at: binding.expires_at,
        })
    }

    fn validate_binding(
        &self,
        binding: &StrategyBinding,
        expected: &StrategyExpectedBinding,
        now_unix: i64,
    ) -> CoreResult<()> {
        if binding.protocol != POLICY_PROTOCOL
            || binding.authorization_id != expected.authorization_id
            || binding.ticket_jti != expected.ticket_jti
            || binding.device_key_id != expected.device_key_id
            || binding.task_digest != expected.task_digest
            || binding.task_type != expected.task_type
            || binding.client_version != expected.client_version
            || binding.core_version != expected.core_version
            || binding.core_protocol_version != expected.core_protocol_version
            || binding.release_manifest_key_id != expected.release_manifest_key_id
            || binding.ticket_key_id != expected.ticket_key_id
            || binding.policy_key_id != expected.policy_key_id
            || binding.policy_version != expected.policy_version
        {
            return Err(CoreError::Strategy("strategy binding mismatch"));
        }
        let issued = time::OffsetDateTime::parse(
            &binding.issued_at,
            &time::format_description::well_known::Rfc3339,
        )
        .map_err(|_| CoreError::Strategy("strategy issue time is invalid"))?
        .unix_timestamp();
        let expires = time::OffsetDateTime::parse(
            &binding.expires_at,
            &time::format_description::well_known::Rfc3339,
        )
        .map_err(|_| CoreError::Strategy("strategy expiry time is invalid"))?
        .unix_timestamp();
        if issued > now_unix.saturating_add(60) || expires <= now_unix || expires <= issued {
            return Err(CoreError::Strategy("strategy time window is invalid"));
        }
        if binding.bundle_digest.len() != 64
            || !binding
                .bundle_digest
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(CoreError::Strategy("strategy digest is invalid"));
        }
        Ok(())
    }
}

pub fn generate_device_encryption_keypair() -> (Vec<u8>, Vec<u8>) {
    let (private, public) = X25519HkdfSha256::gen_keypair(&mut rand_core::OsRng);
    (private.to_bytes().to_vec(), public.to_bytes().to_vec())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceEncryptionIdentity {
    pub encryption_public_key_b64: String,
    pub protected_private_key_b64: String,
    pub encryption_algorithm: String,
    pub key_backend: String,
}

fn load_embedded_ed25519_keys(
    config_variable: &str,
    missing_message: &'static str,
) -> CoreResult<BTreeMap<String, VerifyingKey>> {
    let config = match config_variable {
        "MAGIORIX_POLICY_PUBLIC_KEYS_JSON" => option_env!("MAGIORIX_POLICY_PUBLIC_KEYS_JSON"),
        "MAGIORIX_TICKET_PUBLIC_KEYS_JSON" => option_env!("MAGIORIX_TICKET_PUBLIC_KEYS_JSON"),
        _ => None,
    }
    .ok_or(CoreError::Ticket(missing_message))?;
    let configured: BTreeMap<String, String> = serde_json::from_str(config)
        .map_err(|_| CoreError::Ticket("embedded public-key configuration is invalid"))?;
    if configured.is_empty() || configured.len() > 16 {
        return Err(CoreError::Ticket(
            "embedded public-key configuration is empty or oversized",
        ));
    }
    let mut keys = BTreeMap::new();
    for (key_id, raw_key_b64) in configured {
        if key_id.is_empty()
            || key_id.len() > 96
            || !key_id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        {
            return Err(CoreError::Ticket("embedded public key id is invalid"));
        }
        let raw_key = BASE64
            .decode(raw_key_b64)
            .map_err(|_| CoreError::Ticket("embedded public key encoding is invalid"))?;
        let verifying_key = VerifyingKey::from_bytes(
            raw_key
                .as_slice()
                .try_into()
                .map_err(|_| CoreError::Ticket("embedded public key length is invalid"))?,
        )
        .map_err(|_| CoreError::Ticket("embedded public key is invalid"))?;
        keys.insert(key_id, verifying_key);
    }
    Ok(keys)
}

pub fn embedded_ticket_verifier() -> CoreResult<TicketVerifier> {
    Ok(TicketVerifier::new(load_embedded_ed25519_keys(
        "MAGIORIX_TICKET_PUBLIC_KEYS_JSON",
        "embedded Ticket trust configuration is missing",
    )?))
}

pub fn embedded_strategy_verifier() -> CoreResult<StrategyVerifier> {
    let keys = load_embedded_ed25519_keys(
        "MAGIORIX_POLICY_PUBLIC_KEYS_JSON",
        "embedded policy trust configuration is missing",
    )
    .map_err(|_| CoreError::Strategy("embedded policy trust configuration is invalid"))?;
    Ok(StrategyVerifier::new(keys))
}

pub fn generate_dpapi_device_encryption_identity() -> CoreResult<DeviceEncryptionIdentity> {
    #[cfg(windows)]
    {
        let (mut private, public) = generate_device_encryption_keypair();
        let protected = dpapi::protect_current_user(&private)
            .map_err(|_| CoreError::Strategy("recipient key DPAPI protect failed"));
        private.zeroize();
        let protected = protected?;
        Ok(DeviceEncryptionIdentity {
            encryption_public_key_b64: BASE64.encode(public),
            protected_private_key_b64: BASE64.encode(protected),
            encryption_algorithm: "HPKE-X25519-HKDF-SHA256-AES-256-GCM".to_string(),
            key_backend: "dpapi-current-user".to_string(),
        })
    }
    #[cfg(not(windows))]
    {
        Err(CoreError::Strategy(
            "device encryption backend is unavailable",
        ))
    }
}

pub fn decrypt_strategy_with_dpapi_key(
    verifier: &StrategyVerifier,
    bundle: &StrategyBundle,
    expected: &StrategyExpectedBinding,
    protected_private_key_b64: &str,
    now_unix: i64,
) -> CoreResult<StrategyDecision> {
    #[cfg(windows)]
    {
        let protected = BASE64
            .decode(protected_private_key_b64)
            .map_err(|_| CoreError::Strategy("protected recipient key encoding is invalid"))?;
        let mut private = dpapi::unprotect_current_user(&protected)
            .map_err(|_| CoreError::Strategy("recipient key DPAPI unprotect failed"))?;
        let result = verifier.verify_and_decrypt(bundle, expected, &private, now_unix);
        private.zeroize();
        result
    }
    #[cfg(not(windows))]
    {
        let _ = (
            verifier,
            bundle,
            expected,
            protected_private_key_b64,
            now_unix,
        );
        Err(CoreError::Strategy(
            "device encryption backend is unavailable",
        ))
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
    use hpke::OpModeS;

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
            issued_at: "2026-08-20T00:00:00Z".into(),
            expires_at: "2026-08-20T00:05:00Z".into(),
            nonce: "n".into(),
        };
        let signature = ticket_signer
            .sign(
                canonical_json(&serde_json::to_value(&ticket).unwrap())
                    .unwrap()
                    .as_bytes(),
            )
            .to_bytes()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let binding = TicketBinding {
            user_id: 7,
            device_key_id: "device-1",
            client_task_id: "task-1",
            task_digest: &ticket.task_digest,
            requested_items: 2,
            client_version: "1.4.2",
        };
        let mut verifier = TicketVerifier::new(keys);
        let handle = verifier
            .verify(&ticket, &signature, &binding, 1_787_184_060)
            .unwrap();
        assert_eq!(
            verifier.verify(&ticket, &signature, &binding, 1_787_184_060),
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
    fn strategy_bundle_is_signed_bound_decrypted_and_tamper_rejected() {
        let policy_signer = SigningKey::from_bytes(&[9_u8; 32]);
        let mut trusted = BTreeMap::new();
        trusted.insert("policy-key-1".to_string(), policy_signer.verifying_key());
        let verifier = StrategyVerifier::new(trusted);
        let (recipient_private, recipient_public) = generate_device_encryption_keypair();
        let binding = StrategyBinding {
            protocol: POLICY_PROTOCOL.to_string(),
            authorization_id: "auth-1".to_string(),
            ticket_jti: "ticket-jti-1".to_string(),
            device_key_id: "device-1".to_string(),
            task_digest: "a".repeat(64),
            task_type: "pgy-kol.search".to_string(),
            client_version: CORE_VERSION.to_string(),
            core_version: CORE_VERSION.to_string(),
            core_protocol_version: PROTOCOL_VERSION,
            release_manifest_key_id: Some("release-key-1".to_string()),
            ticket_key_id: "ticket-key-1".to_string(),
            policy_key_id: "policy-key-1".to_string(),
            policy_version: "policy-1".to_string(),
            issued_at: "2026-08-20T00:00:00Z".to_string(),
            expires_at: "2026-08-20T00:05:00Z".to_string(),
            bundle_digest: String::new(),
        };
        let policy = StrategyPolicy {
            policy_version: "policy-1".to_string(),
            task_type: "pgy-kol.search".to_string(),
            max_items: 20,
            points_per_item: 3,
            capabilities: StrategyCapabilities {
                export: false,
                resume: true,
            },
        };
        let plaintext = canonical_json(&serde_json::to_value(&policy).unwrap())
            .unwrap()
            .into_bytes();
        let mut binding = binding;
        binding.bundle_digest = sha256_hex(&plaintext);
        let context = canonical_json(&serde_json::to_value(&binding).unwrap())
            .unwrap()
            .into_bytes();
        let recipient =
            <X25519HkdfSha256 as KemTrait>::PublicKey::from_bytes(&recipient_public).unwrap();
        let (encapped, mut sender) =
            hpke::setup_sender::<AesGcm256, HkdfSha256, X25519HkdfSha256, _>(
                &OpModeS::Base,
                &recipient,
                &context,
                &mut rand_core::OsRng,
            )
            .unwrap();
        let mut ciphertext = plaintext.clone();
        let tag = sender
            .seal_in_place_detached(&mut ciphertext, &context)
            .unwrap();
        ciphertext.extend_from_slice(&tag.to_bytes());
        let unsigned = SignedStrategyEnvelope {
            binding: binding.clone(),
            encapsulated_key: BASE64.encode(encapped.to_bytes()),
            encrypted_bundle: BASE64.encode(&ciphertext),
        };
        let signature_payload = canonical_json(&serde_json::to_value(&unsigned).unwrap()).unwrap();
        let bundle = StrategyBundle {
            protocol: binding.protocol.clone(),
            authorization_id: binding.authorization_id.clone(),
            ticket_jti: binding.ticket_jti.clone(),
            device_key_id: binding.device_key_id.clone(),
            task_digest: binding.task_digest.clone(),
            task_type: binding.task_type.clone(),
            client_version: binding.client_version.clone(),
            core_version: binding.core_version.clone(),
            core_protocol_version: binding.core_protocol_version,
            release_manifest_key_id: binding.release_manifest_key_id.clone(),
            ticket_key_id: binding.ticket_key_id.clone(),
            policy_key_id: binding.policy_key_id.clone(),
            policy_version: binding.policy_version.clone(),
            issued_at: binding.issued_at.clone(),
            expires_at: binding.expires_at.clone(),
            bundle_digest: binding.bundle_digest.clone(),
            encapsulated_key: unsigned.encapsulated_key,
            encrypted_bundle: unsigned.encrypted_bundle,
            bundle_signature: BASE64
                .encode(policy_signer.sign(signature_payload.as_bytes()).to_bytes()),
            key_id: "policy-key-1".to_string(),
        };
        let expected = StrategyExpectedBinding {
            authorization_id: "auth-1".to_string(),
            ticket_jti: "ticket-jti-1".to_string(),
            device_key_id: "device-1".to_string(),
            task_digest: "a".repeat(64),
            task_type: "pgy-kol.search".to_string(),
            client_version: CORE_VERSION.to_string(),
            core_version: CORE_VERSION.to_string(),
            core_protocol_version: PROTOCOL_VERSION,
            release_manifest_key_id: Some("release-key-1".to_string()),
            ticket_key_id: "ticket-key-1".to_string(),
            policy_key_id: "policy-key-1".to_string(),
            policy_version: "policy-1".to_string(),
        };
        let decision = verifier
            .verify_and_decrypt(&bundle, &expected, &recipient_private, 1_787_184_060)
            .unwrap();
        assert_eq!(decision.max_items, 20);
        assert!(!decision.export_allowed);
        assert!(decision.resume_allowed);
        let mut tampered = bundle;
        tampered.task_digest = "b".repeat(64);
        assert_eq!(
            verifier.verify_and_decrypt(&tampered, &expected, &recipient_private, 1_787_184_060),
            Err(CoreError::Strategy("strategy signature mismatch"))
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
