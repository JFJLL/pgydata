# 1.4.2 原生核心侧车协议

## 1. 目标与信任边界

`magiorix-core.exe` 是 1.4.2 Candidate 的 Windows 原生安全核心。它只在 Electron 主进程启动的受约束子进程会话中工作，负责设备签名密钥、Ticket 验证、任务摘要、授权 handle、预算计数和 Receipt 链。渲染进程、已加载 JavaScript、localStorage、可修改的本地任务文件和本地时钟均不可信。

核心不开放 TCP/HTTP 服务，不执行任意 shell 命令，不接收任意文件路径，不保存 Cookie、原始 URL 或采集结果。直接双击时因没有合法 stdin 握手而静默退出。校验失败只拒绝敏感任务并输出脱敏错误；不进行自毁、进程注入、对抗杀毒或破坏用户文件。

## 2. 版本与帧格式

- `coreVersion`：`1.4.2`
- `coreProtocolVersion`：`1`
- 编码：canonical MessagePack；map key 必须按 UTF-8 字节序排序，禁止重复 key、浮点 NaN 和未定义字段。
- 外层帧：`u32` big-endian 长度 + MessagePack payload。
- 最大帧：1 MiB；空帧、超长帧、截断帧均立即拒绝并关闭会话。

第一个帧只能是未签名 `hello`，由父进程通过 stdin 发送 256-bit 随机 `sessionSecret`、协议版本和 app 版本。它不得经命令行、环境变量、日志或文件传递。hello 成功后，每个请求和响应都包含 `protocolVersion`、`sequence`、`requestId`、`command`、`payload` 和 32-byte HMAC-SHA-256。HMAC 覆盖移除 `hmac` 后的 canonical MessagePack。

核心要求主进程请求 sequence 从 1 严格递增；乱序、重放、HMAC 错误、未知命令和协议不匹配均拒绝。响应携带关联 requestId，并使用相同会话密钥认证。会话结束或 core 崩溃后所有 authorization handle 立即失效。

## 3. 命令白名单

| 命令 | 职责 | 可接收数据 |
|---|---|---|
| `hello` | 建立单次受认证会话 | protocol/app version、256-bit secret |
| `health` | 返回非敏感版本和状态 | 无 |
| `device.ensure` | 获取或建立 DPAPI 保护的设备签名密钥 | 迁移元数据，不含私钥 |
| `device.rotate` | 创建新原生密钥并报告待云端 rotate 的公钥 | 旧 key id、新 key 标签 |
| `task.digest` | canonical TaskDescriptor 和 SHA-256 | 已规范化任务参数；不含 Cookie/采集结果 |
| `ticket.verify` | Ed25519 Ticket 验证与 handle 创建 | Ticket、签名、可信公钥、绑定上下文 |
| `receipt.append` | 由核心维护预算并追加 Receipt 链 | handle、受处理条数增量、任务状态 |
| `receipt.finalize` | 生成唯一最终 Receipt | handle、最终状态 |
| `task.plan` | pgy-kol filter/budget 规范化与分页边界 | filterState、budget、page 参数 |
| `strategy.decrypt` | 阶段四保留；当前总是拒绝 | 无 |
| `shutdown` | 正常关闭会话 | 无 |

## 4. 设备密钥与本地状态

Candidate 的可用后端为 `dpapi-current-user`：Ed25519 PKCS#8 私钥由 Windows DPAPI CurrentUser 加密后存放在 `%LOCALAPPDATA%\magiorix-desktop\core\device-key.bin`，文件写入采用临时文件加原子替换。私钥不会以明文落盘或返回给 Electron。

CNG/NCrypt 不可导出签名 key 和 TPM 选择逻辑保留为后端探测接口；当部署环境启用该后端后，应优先选择并向服务端登记 `keyBackend`。safeStorage 迁移必须显式：导入成功后原 JS 副本删除；失败时不自动生成第二个同 key id 的设备身份。

核心状态快照同样由 DPAPI 保护并带 HMAC 完整性标签，仅保存 Ticket jti、authorization id、taskDigest、最大预算、已处理/成功/失败计数、Receipt sequence 与上一个 hash。快照不保存采集结果、Cookie、URL 或私钥。

## 5. Ticket、handle 与 Receipt

Ticket 验证使用 Ed25519 和 `kid` 选择可信公钥，检查签名、有效期、userId、deviceKeyId、clientTaskId、taskDigest、minimumClientVersion 和 maxItems。每个成功 Ticket 只在当前 core 会话产生一个不可序列化 handle；同一 jti 的重放被拒绝。

`receipt.append` 接收的是受处理条数增量而非任意累计成功数。核心自己维护累计预算并拒绝超过 Ticket maxItems 或非法状态迁移。Receipt hash 为去除 `receiptHash`、`deviceSignature` 后的 canonical Receipt body 的 SHA-256；设备签名仅由核心私钥完成。finalize 只能成功一次。

## 6. 原生迁移边界

原生侧必须拥有完整的 TaskDescriptor canonicalization、digest、Ticket 验签、jti 防重放、handle、Receipt 链、预算计数，以及 pgy-kol 的 filterState 安全规范化、预算上限和分页边界规划。JavaScript 只收集参数、校验 IPC 来源、发起侧车调用和映射既有用户输出；required 模式不允许 JavaScript 验签或 legacy consume fallback。

## 7. Electron 侧车启动与真实性

主进程启动前验证 core 处于安装目录，路径不含符号链接/重定向，SHA-256 与已签名 release manifest 匹配，并验证 Authenticode。unsigned-local Candidate 仅在明确开发模式允许跳过 Authenticode；正式模式缺 manifest、摘要、签名、协议或版本任一项都 fail closed。

启动使用 `stdio: ["pipe", "pipe", "pipe"]`，禁用 shell 和窗口，设置超时与单例会话。stderr 只允许固定长度的脱敏诊断。core 不监听端口，且每个命令均有固定 schema 与大小边界。

## 8. 测试不变量

测试覆盖 Ticket 篡改、错误 kid、过期、设备/摘要不匹配、预算超限、jti 重放、Receipt 链/sequence、DPAPI 状态篡改、非 canonical 编码、帧攻击、HMAC 错误、乱序、重放、直接启动和协议错误。Electron 集成层覆盖 core 缺失/替换/摘要错误/超时/崩溃，且 required 模式必须确认没有 JS fallback。
