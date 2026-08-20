# 1.4.2 任务授权、积分预占与签名回执协议

## 1. 目的与信任边界

本协议用于 1.4.2 Candidate 的付费桌面采集任务。云端是用户积分、设备状态、授权状态与结算结果的唯一权威；渲染进程、JavaScript 资源、localStorage、本地数据库、本地时钟和网络均不可信。采集结果、Cookie、原始 URL、博主或笔记正文均不得上传。

协议采用“预占—短时授权—本地执行—签名回执—结算”的闭环。余额查询仅用于界面展示，不能作为任务启动的安全边界。

## 2. 密钥与规范化

任务 Ticket 采用独立 Ed25519 密钥。服务端仅从 `MAGIORIX_TASK_TICKET_PRIVATE_KEY` 和 `MAGIORIX_TASK_TICKET_KEY_ID` 读取私钥及 key id；发布签名、支付、JWT 和 Webhook 密钥不得复用。仓库只保存可信公钥、key id 和占位配置。客户端支持 key id 到可信公钥的映射，但绝不持有 Ticket 私钥。

Ticket 与 Receipt 的待签名负载必须使用确定性 canonical JSON。签名字段本身和派生哈希字段不参与对应的原文签名：Ticket 的签名覆盖 Ticket 对象；Receipt 的设备签名覆盖移除 `deviceSignature` 与 `receiptHash` 后的 Receipt 对象。`receiptHash` 是该同一 canonical Receipt body 的 SHA-256。

## 3. 数据最小化与 taskDigest

客户端为每个任务生成稳定 `clientTaskId` 和 `TaskDescriptor`。`taskDigest` 为 canonical TaskDescriptor 的 SHA-256，覆盖 pluginId、taskType、clientTaskId、输入数、逐项规范化 SHA-256、输入顺序摘要、排序后的 selectedFields、canonical filterState、maxCount、accountSource、pacePolicyId 和计费选项。

云端只接收 taskDigest、任务类型、数量、客户端版本和设备标识；不接收原始输入、原始 URL、Cookie 或采集结果。临时 UI 状态、时间戳、进度和本地文件路径不得影响 taskDigest。

## 4. 设备登记

设备以 `(user_id, device_key_id)` 唯一识别，状态仅允许 `ACTIVE`、`REVOKED`、`BLOCKED`。客户端过渡期在 Electron 主进程使用 safeStorage 保护 Ed25519 设备私钥；只向云端提交签名公钥、算法、客户端版本、用户选择的设备名称及可选的未来加密公钥。

`POST /api/desktop/devices/register` 创建或更新活跃设备；`POST /api/desktop/devices/rotate-key` 先验证旧设备，再登记新 key id；`GET /api/desktop/devices/current` 返回当前用户的设备元数据；`POST /api/desktop/devices/:id/revoke` 只能撤销当前用户的设备。禁止使用 MAC 地址、CPU 序列号或额外硬件指纹作为授权依据。

## 5. 授权、预占与状态机

授权状态为 `AUTHORIZED`、`STARTED`、`COMPLETED`、`CANCELLED`、`EXPIRED`、`REVOKED`、`REVIEW_REQUIRED`。预占记录状态为 `HELD`、`SETTLED`、`RELEASED`、`REVIEW_REQUIRED`。

创建授权必须在单一数据库事务内完成：验证设备为 ACTIVE，检查客户端版本与数量边界，锁定或等效原子更新用户余额，扣减预占积分，创建 task_authorizations 和 credit_reservations，并写入不含敏感数据的审计记录。余额不得为负。

`(user_id, client_task_id)` 唯一。相同 clientTaskId 与相同 digest 的重试返回原授权；相同 clientTaskId 与不同 digest 返回 409。每个 Ticket jti 只能对应一条授权。未启动且 Ticket 过期的授权可释放预占；已启动任务没有有效最终 Receipt 时进入 REVIEW_REQUIRED，不得以取消为由自动全额退款。

## 6. Ticket

Ticket 字段为 `version`、`kid`、`jti`、`authorizationId`、`userId`、`deviceKeyId`、`clientTaskId`、`taskType`、`taskDigest`、`maxItems`、`pointsPerItem`、`policyVersion`、`minimumClientVersion`、`issuedAt`、`expiresAt` 和 `nonce`。Ticket 短时有效，绑定用户、设备、任务、输入摘要、最大数量和最低客户端版本；不包含原始采集数据。

服务端返回 `authorizationId`、`reservedPoints`、`ticket`、`ticketSignature`、`ticketKeyId` 和 `expiresAt`。客户端必须在 Electron 主进程验证 kid、签名、时间窗口、用户、设备、clientTaskId、taskDigest、maxItems 和 minimumClientVersion；验证失败不得启动 required 模式任务。

## 7. Receipt 链与结算

Receipt 字段为 `authorizationId`、`ticketJti`、`sequence`、`previousReceiptHash`、`processedCount`、`successCount`、`failedCount`、`timestamp`、`taskState`、`final`、`deviceKeyId`、`receiptHash` 与 `deviceSignature`。sequence 从 1 递增，previousReceiptHash 从固定 genesis hash 开始。Receipt 队列只保存计数和状态，不保存采集结果。

云端在事务中验证用户、设备、Ticket jti、状态转换、sequence、链哈希、设备签名、processedCount 单调性及 `successCount + failedCount <= maxItems`。final Receipt 只能完成一次；重复提交同一 final Receipt 幂等返回既有结算，重复 sequence 内容不同则拒绝。

结算积分为 `successCount * pointsPerItem`，不得超过预占。云端将未使用预占返还余额，将 reservation 标记为 SETTLED，并保留仅含授权标识、数量、状态和错误代码的审计记录。

## 8. 接口与启用模式

接口包括设备登记、任务授权创建/查询/start/heartbeat/complete/cancel。所有请求必须经过现有身份认证，发送 `X-Magiorix-Client-Version: 1.4.2`，并实施请求体边界、设备状态、版本检查、授权创建限速和审计日志。

`MAGIORIX_TASK_AUTH_MODE=off` 仅保留测试期旧行为；`shadow` 创建和本地验证授权但不阻断旧流程；`required` 必须存在合法 Ticket，不允许回退到 `/api/shumiao/consume`。开发默认 shadow，测试覆盖 required；1.4.1 继续保留 legacy consume 兼容窗口。

## 9. 故障恢复与不变量

断网时主进程顺序持久化 Receipt，恢复后按 sequence 补交。暂停、继续、崩溃恢复和历史任务恢复必须复用同一 authorizationId 和 ticketJti；输入变化必须创建新的 clientTaskId。已过期或无法证明最终状态的 STARTED 任务必须进入 REVIEW_REQUIRED。

以下不变量必须由测试覆盖：并发授权不能透支；同一任务幂等；不同摘要冲突；Ticket 和 Receipt 篡改被拒绝；错误用户、设备或版本被拒绝；回执不回退、不分叉；complete 幂等；required 模式无 Ticket 不启动；所有上行载荷不含原始 URL、Cookie 或采集结果。
