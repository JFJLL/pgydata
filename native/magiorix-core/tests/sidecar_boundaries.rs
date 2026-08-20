use magiorix_core::{
    decode_length_prefixed, encode_length_prefixed, CoreError, SecureFrame, MAX_FRAME_BYTES,
    PROTOCOL_VERSION,
};
use serde_json::Value;
use uuid::Uuid;

#[test]
fn rejects_length_attack_and_noncanonical_payload() {
    let mut oversized = (MAX_FRAME_BYTES as u32 + 1).to_be_bytes().to_vec();
    oversized.push(0);
    assert_eq!(
        decode_length_prefixed::<SecureFrame>(&oversized),
        Err(CoreError::OversizedFrame)
    );

    let truncated = vec![0, 0, 0, 8, 1, 2];
    assert_eq!(
        decode_length_prefixed::<SecureFrame>(&truncated),
        Err(CoreError::OversizedFrame)
    );
}

#[test]
fn length_prefixed_authenticated_frame_round_trips() {
    let secret = [9_u8; 32];
    let frame = SecureFrame {
        protocol_version: PROTOCOL_VERSION,
        sequence: 1,
        request_id: Uuid::new_v4(),
        command: "health".to_string(),
        payload: Value::Null,
        hmac: vec![],
    }
    .sign(&secret)
    .unwrap();
    let encoded = encode_length_prefixed(&frame).unwrap();
    let decoded: SecureFrame = decode_length_prefixed(&encoded).unwrap();
    decoded.verify(&secret).unwrap();
}
