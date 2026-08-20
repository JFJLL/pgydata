# magiorix-core 内部构建说明

`magiorix-core` 是随 Windows 安装包分发的受约束 sidecar，不是用户命令行工具。用户电脑不需要 Rust、Cargo 或 Visual Studio。

## 构建

在受保护的 Windows 发布环境中执行：

```powershell
rustup toolchain install 1.85.0
rustup target add x86_64-pc-windows-msvc --toolchain 1.85.0
cargo +1.85.0 build --locked --release --target x86_64-pc-windows-msvc
```

输出文件为 `target/x86_64-pc-windows-msvc/release/magiorix-core.exe`。构建脚本负责将它复制到运行时安装目录、写入已签名 release manifest、在正式模式下进行 Authenticode 签名和验证。不得提交 `target/`、PDB、私钥或测试用户数据。

## 本地候选约束

本地 unsigned Candidate 只用于开发和验证。它必须明确标记为 `unsigned-local`，不能发布或提升为正式版本。正式模式要求 core 的安装路径、release manifest SHA-256、Authenticode、协议版本和 coreVersion 均匹配，否则 Electron 必须拒绝付费任务。

## 安全边界

core 只处理长度前缀 canonical MessagePack 帧。会话 secret 只经 stdin hello 帧传递；后续所有消息都需单调 sequence 和 HMAC。没有合法握手时 core 静默退出。core 不监听端口、不接受 shell/文件路径通用命令、不记录 Cookie、URL、采集正文或私钥。
