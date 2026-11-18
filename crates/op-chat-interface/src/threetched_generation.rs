//! Direct Chat_Route → threetched (ZeroClaw) generation over `zeroclaw.v1`.
//!
//! Choice of path: the container-chat design puts Chat_Route and the
//! threetched binary in the same container (no NIC except `lo`). The
//! proven odbus-verified handoff
//! (`op-grpc-bridge` `chat_router_generation`) speaks the binary's
//! native WebSocket protocol (`zeroclaw.v1`, `/ws/chat`,
//! `stateless_generation=1`) on loopback. That is the direct
//! ChatRoute → binary path for this container: loopback WS, not a
//! second Salad/OpenAI HTTP client inside 3tched, and not the browser
//! AI SDK transport.
//!
//! Provider selection, catalogs, and credentials (including Salad as a
//! `custom` OpenAI-compatible slot) stay inside threetched. This module
//! only admits a prompt and streams text back.

use std::time::Duration;

use futures::{Sink, SinkExt, Stream, StreamExt};
use serde_json::Value;
use tokio::sync::oneshot;
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{Message, client::IntoClientRequest, protocol::WebSocketConfig},
};
use url::Url;

use crate::errors::{ErrorKind, TypedError};

const WS_PROTOCOL: &str = "zeroclaw.v1";
const MAX_PROMPT_BYTES: usize = 256 * 1024;
const MAX_FRAME_BYTES: usize = 2 * 1024 * 1024;
const MAX_DELTA_BYTES: usize = 16 * 1024;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_EVENTS: usize = 4096;
const MAX_SESSION_ID_BYTES: usize = 256;
const MAX_AGENT_ALIAS_BYTES: usize = 128;
const TOTAL_TIMEOUT: Duration = Duration::from_secs(600);

/// Loopback HTTP origin of the threetched gateway (e.g. `http://127.0.0.1:18789`).
#[derive(Debug, Clone)]
pub struct ThreetchedEndpoint {
    pub origin: String,
    pub agent_alias: String,
    pub bearer_token: Option<String>,
}

impl ThreetchedEndpoint {
    /// Load from env. Returns `None` when `THREETCHED_ENDPOINT` is unset/blank.
    ///
    /// - `THREETCHED_ENDPOINT` — required for threetched mode (`http://127.0.0.1:<port>`)
    /// - `THREETCHED_AGENT_ALIAS` — optional (default `default`)
    /// - `THREETCHED_BEARER_TOKEN` — optional gateway bearer
    pub fn from_env() -> Option<Self> {
        let origin = std::env::var("THREETCHED_ENDPOINT")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())?;
        let agent_alias = std::env::var("THREETCHED_AGENT_ALIAS")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "default".to_string());
        let bearer_token = std::env::var("THREETCHED_BEARER_TOKEN")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        Some(Self {
            origin,
            agent_alias,
            bearer_token,
        })
    }
}

/// One completed threetched turn.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThreetchedGenerationDone {
    pub full_response: String,
    pub provider: Option<String>,
    pub model: Option<String>,
}

/// Build the WS URL for a stateless generation session (unit-tested).
pub fn build_ws_url(
    origin: &str,
    agent_alias: &str,
    session_id: &str,
) -> Result<String, TypedError> {
    validate_loopback_origin(origin)?;
    let mut endpoint = Url::parse(origin).map_err(|_| {
        TypedError::new(ErrorKind::Configuration, "THREETCHED_ENDPOINT")
            .with_detail("endpoint is not a valid URL")
    })?;
    endpoint.set_scheme("ws").map_err(|_| {
        TypedError::new(ErrorKind::Configuration, "THREETCHED_ENDPOINT")
            .with_detail("failed to set WebSocket scheme")
    })?;
    endpoint.set_path("/ws/chat");
    endpoint.set_query(Some(&format!(
        "agent_alias={}&session_id={}&stateless_generation=1",
        percent_encode(agent_alias),
        percent_encode(session_id),
    )));
    Ok(endpoint.to_string())
}

/// Concatenate UIMessage text into one prompt for the binary.
pub fn prompt_from_ui_messages(messages: &[Value]) -> String {
    let mut parts = Vec::new();
    for msg in messages {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
        let text = ui_message_text(msg);
        if text.is_empty() {
            continue;
        }
        parts.push(format!("{role}: {text}"));
    }
    parts.join("\n\n")
}

fn ui_message_text(msg: &Value) -> String {
    let mut out = String::new();
    if let Some(parts) = msg.get("parts").and_then(|p| p.as_array()) {
        for part in parts {
            if part.get("type").and_then(|t| t.as_str()) == Some("text")
                && let Some(t) = part.get("text").and_then(|t| t.as_str())
            {
                out.push_str(t);
            }
        }
    }
    if out.is_empty()
        && let Some(c) = msg.get("content").and_then(|c| c.as_str())
    {
        out.push_str(c);
    }
    out
}

/// Parse one inbound JSON frame body into a generation event (unit-tested).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrameEvent {
    TextDelta(String),
    Done(ThreetchedGenerationDone),
    Cancelled,
    Ignore,
}

pub fn parse_generation_frame(value: &Value) -> Result<FrameEvent, TypedError> {
    match value.get("type").and_then(Value::as_str).unwrap_or("") {
        "chunk" => {
            let delta = value
                .get("content")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    TypedError::new(ErrorKind::Provider, "threetched")
                        .with_detail("chunk frame missing content")
                })?;
            if delta.len() > MAX_DELTA_BYTES {
                return Err(TypedError::new(ErrorKind::Provider, "threetched")
                    .with_detail("chunk delta exceeds bound"));
            }
            Ok(FrameEvent::TextDelta(delta.to_string()))
        }
        "thinking" | "plan" | "history_trimmed" => Ok(FrameEvent::Ignore),
        "done" => {
            let full_response = value
                .get("full_response")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    TypedError::new(ErrorKind::Provider, "threetched")
                        .with_detail("done frame missing full_response")
                })?;
            if full_response.len() > MAX_OUTPUT_BYTES {
                return Err(TypedError::new(ErrorKind::Provider, "threetched")
                    .with_detail("full_response exceeds bound"));
            }
            Ok(FrameEvent::Done(ThreetchedGenerationDone {
                full_response: full_response.to_string(),
                provider: bounded_label(value.get("provider")),
                model: bounded_label(value.get("model")),
            }))
        }
        "aborted" => Ok(FrameEvent::Cancelled),
        "error" => {
            let code = value.get("code").and_then(Value::as_str).unwrap_or("");
            let kind = match code {
                "AUTH_ERROR" => ErrorKind::Denial,
                "TIMEOUT" => ErrorKind::Provider,
                "PROVIDER_ERROR" => ErrorKind::Provider,
                _ => ErrorKind::Provider,
            };
            Err(TypedError::new(kind, "threetched")
                .with_detail(format!("native generation error code {code}")))
        }
        "tool_call" | "tool_result" | "approval_request" | "session_start" => {
            Err(TypedError::new(ErrorKind::Provider, "threetched")
                .with_detail("unexpected native frame type for stateless generation"))
        }
        other => Err(TypedError::new(ErrorKind::Provider, "threetched")
            .with_detail(format!("unknown native frame type: {other}"))),
    }
}

/// Run one stateless generation turn against the threetched gateway.
pub async fn generate(
    endpoint: &ThreetchedEndpoint,
    prompt: &str,
    session_id: &str,
    expected_model: Option<&str>,
) -> Result<ThreetchedGenerationDone, TypedError> {
    validate_generation_inputs(endpoint, prompt, session_id)?;
    let ws = build_ws_url(&endpoint.origin, &endpoint.agent_alias, session_id)?;

    let mut handshake = ws.into_client_request().map_err(|_| {
        TypedError::new(ErrorKind::Configuration, "THREETCHED_ENDPOINT")
            .with_detail("failed to construct WebSocket request")
    })?;
    handshake.headers_mut().insert(
        "Sec-WebSocket-Protocol",
        WS_PROTOCOL.parse().map_err(|_| {
            TypedError::new(ErrorKind::Configuration, "THREETCHED_ENDPOINT")
                .with_detail("invalid WebSocket protocol")
        })?,
    );
    if let Some(token) = endpoint.bearer_token.as_deref() {
        let mut authorization =
            tokio_tungstenite::tungstenite::http::HeaderValue::from_str(&format!("Bearer {token}"))
                .map_err(|_| {
                    TypedError::new(ErrorKind::Configuration, "THREETCHED_BEARER_TOKEN")
                        .with_detail("invalid bearer token")
                })?;
        authorization.set_sensitive(true);
        handshake
            .headers_mut()
            .insert("Authorization", authorization);
    }

    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_FRAME_BYTES))
        .max_frame_size(Some(MAX_FRAME_BYTES));
    let deadline = tokio::time::Instant::now() + TOTAL_TIMEOUT;
    let connect_deadline = std::cmp::min(
        deadline,
        tokio::time::Instant::now() + Duration::from_secs(15),
    );

    let (mut socket, response) = tokio::time::timeout_at(
        connect_deadline,
        connect_async_with_config(handshake, Some(config), false),
    )
    .await
    .map_err(|_| {
        TypedError::new(ErrorKind::Provider, "threetched").with_detail("connect timed out")
    })?
    .map_err(|e| {
        TypedError::new(ErrorKind::Transport, "threetched")
            .with_detail(format!("WebSocket connect failed: {e}"))
    })?;

    let selected = response
        .headers()
        .get("Sec-WebSocket-Protocol")
        .and_then(|v| v.to_str().ok());
    if selected != Some(WS_PROTOCOL) {
        let _ = close_socket(&mut socket).await;
        return Err(TypedError::new(ErrorKind::Provider, "threetched")
            .with_detail("peer did not select zeroclaw.v1"));
    }

    let (_cancel_tx, mut cancel_rx) = oneshot::channel::<()>();

    send_json(
        &mut socket,
        serde_json::json!({
            "type": "connect",
            "session_id": session_id,
        }),
        &mut cancel_rx,
        deadline,
    )
    .await?;

    let session_start =
        parse_json_frame(recv_message(&mut socket, &mut cancel_rx, deadline).await?)?;
    if session_start.get("type").and_then(Value::as_str) != Some("session_start")
        || session_start.get("resumed").and_then(Value::as_bool) != Some(false)
        || session_start.get("message_count").and_then(Value::as_u64) != Some(0)
    {
        let _ = close_socket(&mut socket).await;
        return Err(TypedError::new(ErrorKind::Provider, "threetched")
            .with_detail("expected fresh stateless session_start"));
    }

    let connected = parse_json_frame(recv_message(&mut socket, &mut cancel_rx, deadline).await?)?;
    if connected.get("type").and_then(Value::as_str) != Some("connected") {
        let _ = close_socket(&mut socket).await;
        return Err(TypedError::new(ErrorKind::Provider, "threetched")
            .with_detail("expected connected frame"));
    }

    send_json(
        &mut socket,
        serde_json::json!({
            "type": "message",
            "content": prompt,
        }),
        &mut cancel_rx,
        deadline,
    )
    .await?;

    let mut output = String::new();
    let mut events = 0usize;
    loop {
        let message = tokio::select! {
            _ = tokio::time::sleep_until(deadline) => {
                let _ = close_socket(&mut socket).await;
                return Err(TypedError::new(ErrorKind::Provider, "threetched")
                    .with_detail("generation timed out"));
            }
            message = socket.next() => message,
        };
        let Some(message) = message else {
            return Err(TypedError::new(ErrorKind::Transport, "threetched")
                .with_detail("connection ended before done"));
        };
        let message = message.map_err(|e| {
            TypedError::new(ErrorKind::Transport, "threetched")
                .with_detail(format!("receive failed: {e}"))
        })?;
        let text = match message {
            Message::Text(text) => text,
            Message::Binary(_) | Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => {
                continue;
            }
            Message::Close(_) => {
                return Err(TypedError::new(ErrorKind::Transport, "threetched")
                    .with_detail("peer closed before done"));
            }
        };
        if text.len() > MAX_FRAME_BYTES {
            let _ = close_socket(&mut socket).await;
            return Err(TypedError::new(ErrorKind::Provider, "threetched")
                .with_detail("frame exceeds bound"));
        }
        events = events.saturating_add(1);
        if events > MAX_EVENTS {
            let _ = close_socket(&mut socket).await;
            return Err(
                TypedError::new(ErrorKind::Provider, "threetched").with_detail("too many events")
            );
        }
        let value: Value = serde_json::from_str(text.as_ref()).map_err(|_| {
            TypedError::new(ErrorKind::Provider, "threetched").with_detail("invalid JSON frame")
        })?;
        match parse_generation_frame(&value)? {
            FrameEvent::TextDelta(delta) => {
                if output.len().saturating_add(delta.len()) > MAX_OUTPUT_BYTES {
                    let _ = close_socket(&mut socket).await;
                    return Err(TypedError::new(ErrorKind::Provider, "threetched")
                        .with_detail("output exceeds bound"));
                }
                output.push_str(&delta);
            }
            FrameEvent::Ignore => {}
            FrameEvent::Cancelled => {
                return Err(TypedError::new(ErrorKind::Provider, "threetched")
                    .with_detail("generation aborted"));
            }
            FrameEvent::Done(done) => {
                if done.full_response.trim() != output.trim() {
                    return Err(TypedError::new(ErrorKind::Provider, "threetched")
                        .with_detail("full_response does not match streamed chunks"));
                }
                if expected_model
                    .filter(|m| !m.is_empty())
                    .is_some_and(|expected| done.model.as_deref() != Some(expected))
                {
                    return Err(TypedError::new(ErrorKind::Provider, "threetched")
                        .with_detail("terminal model attribution mismatch"));
                }
                let _ = close_socket(&mut socket).await;
                return Ok(done);
            }
        }
    }
}

fn validate_generation_inputs(
    endpoint: &ThreetchedEndpoint,
    prompt: &str,
    session_id: &str,
) -> Result<(), TypedError> {
    validate_loopback_origin(&endpoint.origin)?;
    if endpoint.agent_alias.is_empty() || endpoint.agent_alias.len() > MAX_AGENT_ALIAS_BYTES {
        return Err(
            TypedError::new(ErrorKind::Configuration, "THREETCHED_AGENT_ALIAS")
                .with_detail("agent alias empty or too long"),
        );
    }
    if session_id.is_empty() || session_id.len() > MAX_SESSION_ID_BYTES {
        return Err(TypedError::new(ErrorKind::Validation, "conversation_id")
            .with_detail("session id empty or too long"));
    }
    if prompt.is_empty() {
        return Err(
            TypedError::new(ErrorKind::Validation, "ui_messages").with_detail("prompt is empty")
        );
    }
    if prompt.len() > MAX_PROMPT_BYTES {
        return Err(TypedError::new(ErrorKind::Validation, "ui_messages")
            .with_detail("prompt exceeds bound"));
    }
    Ok(())
}

fn validate_loopback_origin(origin: &str) -> Result<(), TypedError> {
    let endpoint = Url::parse(origin).map_err(|_| {
        TypedError::new(ErrorKind::Configuration, "THREETCHED_ENDPOINT")
            .with_detail("endpoint is not a valid URL")
    })?;
    if endpoint.scheme() != "http"
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
        || !matches!(endpoint.path(), "" | "/")
    {
        return Err(
            TypedError::new(ErrorKind::Configuration, "THREETCHED_ENDPOINT")
                .with_detail("endpoint must be a loopback HTTP origin (container lo only)"),
        );
    }
    let host = endpoint.host_str().ok_or_else(|| {
        TypedError::new(ErrorKind::Configuration, "THREETCHED_ENDPOINT")
            .with_detail("endpoint has no host")
    })?;
    let host_is_loopback = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<std::net::IpAddr>()
        .map(|ip| ip.is_loopback())
        .unwrap_or(false);
    if !host_is_loopback {
        return Err(
            TypedError::new(ErrorKind::Configuration, "THREETCHED_ENDPOINT")
                .with_detail("endpoint must be loopback (127.0.0.1 / ::1)"),
        );
    }
    Ok(())
}

fn percent_encode(value: &str) -> String {
    value.bytes().fold(String::new(), |mut out, byte| {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
        out
    })
}

fn bounded_label(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.len() <= 256)
        .map(str::to_string)
}

async fn send_json<S>(
    socket: &mut S,
    value: Value,
    cancel_rx: &mut oneshot::Receiver<()>,
    deadline: tokio::time::Instant,
) -> Result<(), TypedError>
where
    S: Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    let text = serde_json::to_string(&value).map_err(|_| {
        TypedError::new(ErrorKind::Transport, "threetched").with_detail("serialize failed")
    })?;
    if text.len() > MAX_FRAME_BYTES {
        return Err(TypedError::new(ErrorKind::Provider, "threetched")
            .with_detail("outbound frame exceeds bound"));
    }
    tokio::select! {
        _ = cancel_rx => Err(TypedError::new(ErrorKind::Provider, "threetched")
            .with_detail("cancelled")),
        _ = tokio::time::sleep_until(deadline) => Err(
            TypedError::new(ErrorKind::Provider, "threetched").with_detail("send timed out")
        ),
        result = socket.send(Message::Text(text.into())) => result.map_err(|e| {
            TypedError::new(ErrorKind::Transport, "threetched")
                .with_detail(format!("send failed: {e}"))
        }),
    }
}

async fn recv_message<S>(
    socket: &mut S,
    cancel_rx: &mut oneshot::Receiver<()>,
    deadline: tokio::time::Instant,
) -> Result<Message, TypedError>
where
    S: Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    tokio::select! {
        _ = cancel_rx => Err(TypedError::new(ErrorKind::Provider, "threetched")
            .with_detail("cancelled")),
        _ = tokio::time::sleep_until(deadline) => Err(
            TypedError::new(ErrorKind::Provider, "threetched").with_detail("recv timed out")
        ),
        result = socket.next() => {
            let message = result.ok_or_else(|| {
                TypedError::new(ErrorKind::Transport, "threetched")
                    .with_detail("connection ended")
            })?;
            message.map_err(|e| {
                TypedError::new(ErrorKind::Transport, "threetched")
                    .with_detail(format!("recv failed: {e}"))
            })
        },
    }
}

fn parse_json_frame(message: Message) -> Result<Value, TypedError> {
    let text = match message {
        Message::Text(text) => text,
        _ => {
            return Err(TypedError::new(ErrorKind::Provider, "threetched")
                .with_detail("expected text frame"));
        }
    };
    if text.len() > MAX_FRAME_BYTES {
        return Err(
            TypedError::new(ErrorKind::Provider, "threetched").with_detail("frame exceeds bound")
        );
    }
    serde_json::from_str(text.as_ref()).map_err(|_| {
        TypedError::new(ErrorKind::Provider, "threetched").with_detail("invalid JSON frame")
    })
}

async fn close_socket<S>(socket: &mut S) -> Result<(), ()>
where
    S: Sink<Message> + Unpin,
{
    tokio::time::timeout(Duration::from_secs(1), socket.close())
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}

/// Operator-facing message when threetched is selected but not configured.
pub fn missing_endpoint_message() -> &'static str {
    "chat-route: threetched mode requires THREETCHED_ENDPOINT \
     (loopback HTTP origin, e.g. http://127.0.0.1:18789). \
     Set the endpoint, or use --provider synthetic for the offline harness."
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn ws_url_uses_stateless_generation_query() {
        let url = build_ws_url("http://127.0.0.1:18789", "default", "sess-1").unwrap();
        assert!(url.starts_with("ws://127.0.0.1:18789/ws/chat?"));
        assert!(url.contains("agent_alias=default"));
        assert!(url.contains("session_id=sess-1"));
        assert!(url.contains("stateless_generation=1"));
    }

    #[test]
    fn rejects_non_loopback_endpoint() {
        let err = build_ws_url("http://10.0.0.2:18789", "default", "s").unwrap_err();
        assert_eq!(err.kind, ErrorKind::Configuration);
    }

    #[test]
    fn prompt_from_ui_messages_joins_roles() {
        let msgs = vec![
            json!({
                "role": "user",
                "parts": [{"type": "text", "text": "Hello"}]
            }),
            json!({
                "role": "assistant",
                "content": "Hi"
            }),
        ];
        assert_eq!(
            prompt_from_ui_messages(&msgs),
            "user: Hello\n\nassistant: Hi"
        );
    }

    #[test]
    fn parse_chunk_and_done_frames() {
        let chunk = json!({"type": "chunk", "content": "Hel"});
        assert_eq!(
            parse_generation_frame(&chunk).unwrap(),
            FrameEvent::TextDelta("Hel".into())
        );
        let done = json!({
            "type": "done",
            "full_response": "Hello",
            "provider": "custom",
            "model": "qwen3.6-35b-a3b"
        });
        match parse_generation_frame(&done).unwrap() {
            FrameEvent::Done(d) => {
                assert_eq!(d.full_response, "Hello");
                assert_eq!(d.provider.as_deref(), Some("custom"));
                assert_eq!(d.model.as_deref(), Some("qwen3.6-35b-a3b"));
            }
            other => panic!("expected done, got {other:?}"),
        }
    }

    #[test]
    fn parse_error_frame_maps_auth() {
        let err =
            parse_generation_frame(&json!({"type": "error", "code": "AUTH_ERROR"})).unwrap_err();
        assert_eq!(err.kind, ErrorKind::Denial);
    }
}
