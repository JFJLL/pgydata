use std::io::{self, Read, Write};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use magiorix_core::{
    canonical_messagepack, decode_canonical_messagepack, encode_length_prefixed, plan_pgy_kol,
    CoreError, PgyPlanInput, SecureFrame, SessionGuard, TaskDescriptor, CORE_VERSION,
    MAX_FRAME_BYTES, PROTOCOL_VERSION,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize)]
struct Hello {
    protocol_version: u16,
    app_version: String,
    session_secret_b64: String,
}

#[derive(Debug, Serialize)]
struct Response<'a> {
    ok: bool,
    code: &'a str,
    payload: Value,
}

fn read_frame<R: Read>(input: &mut R) -> Result<Vec<u8>, CoreError> {
    let mut length = [0_u8; 4];
    input
        .read_exact(&mut length)
        .map_err(|_| CoreError::InvalidFrame)?;
    let size = u32::from_be_bytes(length) as usize;
    if size == 0 || size > MAX_FRAME_BYTES {
        return Err(CoreError::OversizedFrame);
    }
    let mut payload = vec![0_u8; size];
    input
        .read_exact(&mut payload)
        .map_err(|_| CoreError::InvalidFrame)?;
    let mut framed = length.to_vec();
    framed.extend_from_slice(&payload);
    Ok(framed)
}

fn write_hello<W: Write>(output: &mut W, hello: &Hello) -> Result<(), CoreError> {
    let payload = canonical_messagepack(&Response {
        ok: true,
        code: "hello",
        payload: json!({"coreVersion": CORE_VERSION, "coreProtocolVersion": PROTOCOL_VERSION, "appVersion": hello.app_version}),
    })?;
    let length = u32::try_from(payload.len()).map_err(|_| CoreError::OversizedFrame)?;
    output
        .write_all(&length.to_be_bytes())
        .map_err(|_| CoreError::InvalidFrame)?;
    output
        .write_all(&payload)
        .map_err(|_| CoreError::InvalidFrame)?;
    output.flush().map_err(|_| CoreError::InvalidFrame)
}

fn dispatch(frame: &SecureFrame) -> Result<(Value, bool), CoreError> {
    match frame.command.as_str() {
        "health" => Ok((
            json!({"coreVersion": CORE_VERSION, "protocolVersion": PROTOCOL_VERSION, "network": false}),
            false,
        )),
        "task.digest" => {
            let descriptor: TaskDescriptor = serde_json::from_value(frame.payload.clone())
                .map_err(|_| CoreError::InvalidFrame)?;
            let canonical = descriptor.canonicalize()?;
            Ok((json!({"taskDigest": canonical.digest()?}), false))
        }
        "task.plan" => {
            let input: PgyPlanInput = serde_json::from_value(frame.payload.clone())
                .map_err(|_| CoreError::InvalidFrame)?;
            let plan = plan_pgy_kol(input)?;
            Ok((
                serde_json::to_value(plan).map_err(|_| CoreError::Serialization)?,
                false,
            ))
        }
        "device.ensure" | "device.rotate" | "ticket.verify" | "receipt.append"
        | "receipt.finalize" => {
            // These commands are wired only after the parent has supplied the explicit trusted-key
            // and protected-state context. They deliberately reject incomplete invocations.
            Err(CoreError::InvalidHandle)
        }
        "strategy.decrypt" => Err(CoreError::UnknownCommand),
        "shutdown" => Ok((json!({"stopping": true}), true)),
        _ => Err(CoreError::UnknownCommand),
    }
}

fn run() -> Result<(), CoreError> {
    let mut stdin = io::stdin().lock();
    let mut stdout = io::stdout().lock();

    // There is no command-line fallback. A direct launch exits without stdout/stderr data.
    let hello_raw = match read_frame(&mut stdin) {
        Ok(value) => value,
        Err(_) => return Ok(()),
    };
    let hello: Hello = decode_canonical_messagepack(&hello_raw)?;
    if hello.protocol_version != PROTOCOL_VERSION || hello.app_version != CORE_VERSION {
        return Err(CoreError::UnsupportedProtocol);
    }
    let secret = BASE64
        .decode(&hello.session_secret_b64)
        .map_err(|_| CoreError::InvalidHmac)?;
    if secret.len() != 32 {
        return Err(CoreError::InvalidHmac);
    }
    let mut secret_array = [0_u8; 32];
    secret_array.copy_from_slice(&secret);
    let mut session = SessionGuard::new(secret_array);
    write_hello(&mut stdout, &hello)?;

    loop {
        let raw = read_frame(&mut stdin)?;
        let frame: SecureFrame = decode_canonical_messagepack(&raw)?;
        session.verify_inbound(&frame)?;
        let request_id: Uuid = frame.request_id;
        let response = match dispatch(&frame) {
            Ok((payload, shutdown)) => (
                Response {
                    ok: true,
                    code: "ok",
                    payload,
                },
                shutdown,
            ),
            Err(error) => (
                Response {
                    ok: false,
                    code: "rejected",
                    payload: json!({"reason": error.to_string()}),
                },
                false,
            ),
        };
        let secure = SecureFrame {
            protocol_version: PROTOCOL_VERSION,
            sequence: frame.sequence,
            request_id,
            command: "response".to_string(),
            payload: serde_json::to_value(response.0).map_err(|_| CoreError::Serialization)?,
            hmac: Vec::new(),
        }
        .sign(&secret_array)?;
        stdout
            .write_all(&encode_length_prefixed(&secure)?)
            .map_err(|_| CoreError::InvalidFrame)?;
        stdout.flush().map_err(|_| CoreError::InvalidFrame)?;
        if response.1 {
            break;
        }
    }
    Ok(())
}

fn main() {
    // stderr intentionally stays silent unless an embedding host chooses to report a generic failure.
    let _ = run();
}
