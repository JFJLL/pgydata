# 1.4.2 受限对抗测试记录

本记录仅覆盖本产品在本地测试夹具中的拒绝行为；不包含可复用于其他软件的攻击代码、扫描器或绕过工具。

| 编号 | 场景 | 预期安全结果 | 验证方式 | 结果 |
|---|---|---|---|---|
| HT-01 | 策略包签名被替换 | 原生核心在解密前拒绝 | `strategy_bundle_is_signed_bound_decrypted_and_tamper_rejected` | 通过 |
| HT-02 | 策略密文或 AAD 绑定被修改 | HPKE AES-256-GCM 认证失败，不输出策略正文 | Rust 原生核心单元测试 | 通过 |
| HT-03 | Ticket 签名编码或载荷被修改 | canonical JSON/Ed25519 校验失败 | Rust Ticket 单元测试 | 通过 |
| HT-04 | Ticket jti 重放 | 同一侧车会话内拒绝第二次验证 | Rust Ticket 单元测试 | 通过 |
| HT-05 | required 模式缺少原生核心 | 不创建或启动付费任务 | `TaskAuthorizationProvider` 门禁 | 通过 |
| HT-06 | required 模式策略验证失败 | 取消待启动授权，不调用 start | `task-authorization-provider-required.test.mjs` | 通过 |
| HT-07 | 核心文件 SHA-256 不匹配 | 侧车客户端拒绝启动 | `native-core-client.test.mjs` | 通过 |
| HT-08 | ASAR 或 Fuse 被篡改 | Electron Fuse/完整性测试失败 | `security-fuses-and-tamper.test.mjs` | 通过 |
| HT-09 | 生产构建配置为 off/shadow | 构建前失败 | `build-magiorix-core.ps1` 负向测试 | 通过 |

> 结论：required 路径不允许 JS 验签、旧 consume 或 shadow/off 回退。生产候选仍须在受控环境中提供两个**公钥**信任根，并完成签名和安装包验证。
