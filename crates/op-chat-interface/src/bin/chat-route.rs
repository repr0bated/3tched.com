//! Container-owned, headless responder. The notification relay launches exactly
//! one assigned turn. This process binds no listener and has no host fallback.
use std::{path::PathBuf, sync::Arc};
use op_chat_interface::{guard::SecretGuard, mounted::MountedBackend, responder::process_pending_turn};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut mount = std::env::var_os("CHAT_ROUTE_MOUNT").map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/run/mounts/3tchedFS"));
    let mut turn = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mount" => mount = args.next().ok_or("--mount requires a path")?.into(),
            "--process-pending-turn" => turn = Some(args.next().ok_or("--process-pending-turn requires a UUID")?),
            "--help" | "-h" => {
                println!("chat-route --process-pending-turn <UUID> [--mount <identity-bound 3tchedFS>]");
                return Ok(());
            }
            _ => return Err("unsupported argument; no standalone host ChatService is available".into()),
        }
    }
    let turn = turn.ok_or("--process-pending-turn is required")?;
    let backend = MountedBackend::open(&mount, Arc::new(SecretGuard::new()))?;
    // Error Display carries only typed kind/item, never provider/private data.
    process_pending_turn(&backend, &turn).await?;
    Ok(())
}
