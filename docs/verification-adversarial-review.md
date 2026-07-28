# 1.1.9 R3 对抗性审查

## 第一轮（fresh-context，只读）

结论：FAIL，禁止发布。

- Critical：4 位验证码没有错误次数限制，重置密码可被在线穷举；bcrypt 在验证码验证前造成 CPU DoS 面。
- High：微信/支付宝平台订单没有与本地 30 分钟有效期对齐。
- High：支付宝缺 `ALIPAY_SELLER_ID` 时仍能生成付款页，真实通知会在付款后被拒绝。
- Medium：过期 pending 订单查询不关闭，桌面每 3 秒无限轮询；待支付订单仅存内存，重启不可恢复。
- High gate：根级只读单测硬编码 1.1.8；1.1.9 manifest 已生成后不可同版本重建；无 pass receipt。

审查者实际执行专项测试 16/16 和 `git diff --check`；确认原始微信 body、双渠道签名/商户/应用/金额核对、`BEGIN IMMEDIATE`、交易号唯一索引、1.1.8/runtime/latest 不变及无真实密钥泄漏。

## 第一轮修复

- `sms_codes` 增加 `failed_attempts`/`locked_at`，5 次错误后正确码也拒绝；bcrypt 移到正确码之后。
- 微信 Native 增加 `time_expire`，支付宝 `biz_content` 增加 `timeout_express: 30m`。
- 支付宝 seller ID 改为付款页创建前必填；新增缺配置 fail-fast 测试。
- 支付入账增加进程内队列，专项用并发微信通知验证只到账一次。
- 订单查询发现过期 pending 时转 status 2，使桌面轮询停止。
- 专项测试增至 19/19，fail 0、skipped 0、todo 0。

## 残余发布门禁

- 生成的 1.1.9 桌面资产使用错误 bridge 路径 `window.bridge.shell.openExternal`；preload 实际为 `window.bridge.system.shell.openExternal`。1.1.9 manifest 已存在，按不可变规则不得删除或同版本重建。
- 根级只读单测仍硬编码 1.1.8，最终 verifier 无法 pass。
- 待支付订单在桌面重启后不可恢复；当前不可变 1.1.9 资产无法再修。
- 无新商户真实交易、短信实发或三张安全实机截图证据。

## 第二轮（fresh-context，只读）

结论：FAIL。顺序锁码、bcrypt 后置、seller fail-fast、微信绝对过期、过期 pending 关闭均确认修复；新发现共享 SQLite 连接上的裸请求级事务可互相 `ROLLBACK`，并发 20 次错误码出现 18 个 500；支付宝 `timeout_express: 30m` 会从打开支付页重新计时。

## 第二轮修复

- 在任何 webhook/body parser 前串行化所有会写数据库的 HTTP 请求及会写库的支付/订单 GET，避免共享连接事务交叠。
- 新增并发 20 次错误码回归：5 次 400、15 次 429、0 次 500，正确码继续返回 429。
- 支付宝 timeout 按本地 `expires_at` 的剩余整分钟生成，不再重新计满 30 分钟。
- 专项测试增至 21/21，fail 0、skipped 0、todo 0。

## 第三轮（fresh-context，只读）

结论：FAIL。支付宝由本地 `expires_at` 计算剩余分钟、微信传同一绝对过期时间均确认通过；正常连接下专项 21/21，通过注册事务与支付宝通知并发也保持余额 `100→150`。

- 客户端在注册事务 bcrypt 阶段断连时，`res.close` 会提前释放串行队列；下一注册请求实测 HTTP 500，报 `cannot start a transaction within a transaction`，其异常 `ROLLBACK` 可干扰前一事务。
- 串行化范围不完整：`/api/auth/info`、`/api/shumiao/balance`、`/api/shumiao/check-balance` 可经 `ensureAccount` 写库，鉴权可删除过期 token。
- 语法检查覆盖 server/lib/test 共 7 个 JS 文件，0 失败；未发现真实短信/支付密钥或敏感请求内容写入日志。

达到最多 3 轮限制后停止修复。整体发布仍因上述 SQLite 断连事务、桌面 bridge、不可变 1.1.9 manifest 和根级 unit 门禁保持 FAIL。

## 第四轮（1.1.10 fresh-context，只读）

结论：FAIL。1.1.10 支付幂等、正确 Electron bridge、Candidate 哈希和历史不可变性通过；新发现不完整 JSON 在 body parser 阶段断连时没有进入 `asyncHandler`，后续 API 实测 2 秒超时。版本测试虽统一读取 desktop version，但未锁定 1.1.10 且未核对 prepared assets/manifest；生产仍有公开管理员默认密码。

## 第五轮修复

- mutation queue 增加请求流 `aborted/error` 释放路径；无活动 handler 的解析期断连立即释放，有活动事务时仍等待所有异步 handler settle，避免交叉回滚。
- 新增解析期断连回归与生产管理员密码 fail-fast 回归；后端专项增至 24/24、skipped 0。
- 生产 `ADMIN_PASSWORD` 缺失或短于 12 字符时拒绝启动，测试环境显式使用 test-only 密码。
- 版本契约明确锁定 1.1.10，并校验后端 ASSET_VERSION、版本 manifest、release-info、Candidate EXE/assets.zip、prepared assets 的大小与 SHA256，以及 Electron bridge。

第五轮完成后必须由新的 fresh-context reviewer 复核；若仍 FAIL，按授权停止，不再扩轮。

## 第五轮 fresh-context 最终复核（只读）

结论：FAIL，R3 阻塞。审查者用合法测试 RSA 签名、正确微信商户/应用/订单/金额且省略 `transaction_id`，实际得到 `{"notifyStatus":200,"notify":{"code":"SUCCESS","message":"成功"},"balance":150}`；支付宝缺少 `trade_no` 会进入同一空交易号结算路径。该 High 直接阻止 Candidate 发布。

其余复核通过：不完整/畸形/超大请求体和未知 POST 后队列可继续处理 API、注册与支付；生产管理员密码缺失/过短均 exit 1；版本与 Candidate 哈希严格一致；正确 bridge 存在；不可变 build 不改文件且篡改/缺失会失败；历史 1.1.8/1.1.9/latest diff=0；无敏感材料。后端 24/24、根测试、确定性 R3 通道均为绿色，但不能覆盖上述 High。

新增两轮授权已用完，按硬规则停止，不进入第六轮。
