// Chat_Link protobuf (op_chat.chat.ChatService). This crate owns its copy of
// chat.proto, so it does not depend on op-chat from odbus-verified.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto/chat.proto");
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile_protos(&["proto/chat.proto"], &["proto"])?;
    Ok(())
}
