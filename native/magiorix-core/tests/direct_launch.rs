use std::process::Command;

#[test]
fn direct_launch_without_handshake_exits_cleanly_without_sensitive_output() {
    let output = Command::new(env!("CARGO_BIN_EXE_magiorix-core"))
        .output()
        .expect("core binary should launch");
    assert!(output.status.success());
    assert!(output.stdout.is_empty());
    assert!(output.stderr.is_empty());
}
