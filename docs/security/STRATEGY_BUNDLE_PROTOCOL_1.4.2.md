# 1.4.2 策略包签名、加密与撤销协议

## 1. 密钥隔离

策略签名密钥与支付、Ticket、release manifest、JWT、Webhook 密钥完全隔离。服务端仅从 `MAGIORIX_POLICY_SIGNING_PRIVATE_KEY` 和 `MAGIORIX_POLICY_SIGNING_KEY_ID` 装载 Ed25519 策略签名私钥；私钥不进入数据库、日志、构建产物或策略包。每个策略签名信封必须携带可轮换的 `keyId`。

策略保密使用 RFC 9180 HPKE Base mode：`DHKEM(X25519, HKDF-SHA256)`、`HKDF-SHA256`、`ChaCha20-Poly1305`。服务端只使用设备登记的 X25519 encryption public key；native core 的对应私钥仅位于受保护设备密钥后端。HPKE 的 `info` 与 AEAD AAD 均由绑定上下文的 canonical JSON 派生，以防跨任务、跨设备或跨版本复制。

## 2. 策略请求与响应

客户端仅在已获得授权 Ticket 后请求 `POST /api/desktop/strategy-bundles`。请求字段为 `authorizationId`、`ticketJti`、`deviceKeyId`、`taskDigest`、`taskType`、`clientVersion`、`coreVersion`、`coreProtocolVersion`、`releaseManifestKeyId`、`ticketKeyId`、`policyKeyId`、`policyVersion`。

服务端必须在单次读取中验证用户授权、设备活动状态、Ticket jti、授权 task digest/type、版本撤销、策略版本撤销和短时有效窗口。成功时，服务端构造最小策略正文，生成 `bundleDigest`，对密文绑定元数据签名，并以设备 encryption public key HPKE 加密。响应仅返回 `encryptedBundle`、`encapsulatedKey`、`bundleSignature`、`keyId`、`policyVersion`、`issuedAt`、`expiresAt`、`bundleDigest` 与公开绑定元数据。

## 3. 绑定上下文

以下字段必须同时出现在签名 payload 与 HPKE AAD：`authorizationId`、`ticketJti`、`deviceKeyId`、`taskDigest`、`taskType`、`clientVersion`、`coreVersion`、`coreProtocolVersion`、`policyVersion`、`issuedAt`、`expiresAt`、`bundleDigest`。core 在任何一项不匹配时拒绝解密或使用策略。策略正文不得包含 Cookie、URL、采集结果、云端私钥、支付密钥或其他用户数据。

## 4. 时间、断网与撤销

新任务必须在线获得 Ticket 和策略包。core 使用签名服务器时间、monotonic elapsed time 和最近可信服务器时间判定有效期并检测明显回拨。已合法启动的任务可以在策略仍驻留内存且未到期时短时断网继续；新任务不得复用旧策略或离线进入免费模式。

服务端控制 `minimumSupportedClientVersion`、`minimumSupportedCoreVersion`、已撤销 client/core/policy 版本、Ticket jti、设备 ID 和各类 key id。撤销状态优先于缓存。1.4.2 不允许将 Header 降级为 1.4.1 以回退 legacy consume。

## 5. required 模式

正式 Candidate 的 `MAGIORIX_TASK_AUTH_MODE` 必须为 `required`。该模式下 native core 缺失、release/资源/core 完整性失败、Ticket 或策略签名无效、设备/摘要/版本绑定不符、策略过期或 core 超时/崩溃均拒绝付费任务。它不能回退 JavaScript 验签、legacy consume 或本地免费模式。`off`/`shadow` 只能用于明确开发测试环境，并在正式生产构建中被构建脚本拒绝。

## 6. 内存边界与审计

core 只返回最小 authorization handle 或策略派生的安全结果，不向 renderer 返回完整明文策略。策略明文只在 native 内存处理，任务结束、失败或 handle 失效时零化；不得写入磁盘或 Electron 日志。审计只记录脱敏代码、key id、version、授权/设备标识的不可逆摘要和时间，不记录策略正文。
