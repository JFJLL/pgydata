# magiorix 1.1.9 Candidate 进度
1. 已从 `3fce17c59e03ad604cad79fd33bf76cd376e544e` 创建干净 worktree 与分支 `codex/magiorix-1.1.9-pay-sms`；主工作区用户改动未触碰。
2. 基线 `git status --short` 无项目改动（仅 rtk hook 提示）；`git rev-parse HEAD` 输出上述 SHA。
3. `node --check`：`red-magic-api/server.js`、两个 patch 脚本均 exit 0、无错误输出。
4. `verify-change.ps1 -PlanOnly` exit 0：R0、static、fingerprint `e3b0c442…b855`（空 diff 基线）。
5. 静态检查 exit 0：5 个 JavaScript 文件；单元测试 15/15 pass，fail 0，skipped 0，todo 0。
6. 集成基线第 1 次：1/4 pass、3 fail、skipped 0（缺 `sqlite3`/`jszip`）；两目录 `npm ci` 后第 2 次 13/13 pass、fail 0、skipped 0、todo 0，环境红灯已消除。
7. 后端当前无 `npm test`；构建/验收命令以 `verification-policy.json` 与 `scripts/verify-change.ps1` 为准，任务中将新增后端 `npm test`。
8. 1.1.8 主 bundle 为 `assets/1.1.8/assets/index-B09sHfUO.js`；frontend patch 另绑定 `index-CiEqCfGB.js`、`index-IS4kgrUy.js`、`PgyTaskPanel-B4ZGEmDG.js` 等明确目标。
9. 下一项：实现短信与支付的可测试模块、数据库兼容迁移及 API；基线现为 static 5/5、unit 15/15、integration 13/13。
10. 用户确认真实短信配置位于主工作区未跟踪的 `red-magic-api/.env`；代码采用 `ALIYUN_SMS_*` 变量名，不读取、复制、记录或提交真实值。
11. 任务 1/2 后端核心已实现：短信事务、注册/重置、旧接口禁建号、四套餐、双渠道验签、30 分钟 token、`BEGIN IMMEDIATE` 幂等入账及支付页。
12. 反向验证 RED（1.1.8 server）：0/16 pass、16 fail、skipped 0；可复现假短信成功、无 60 秒限制、无 `sms_codes`、旧接口建号、新路由缺失。
13. 同一测试 GREEN（1.1.9 worktree）：16/16 pass、fail 0、skipped 0、todo 0；微信/支付宝非法签名与错金额余额不变，两路合法通知各重放两次后余额仅 `100→150`。
14. 已复制 1.1.8 到新 `assets/1.1.9`（未改 1.1.8），首次 frontend patch exit 0；登录改为单列默认密码＋短信注册/重置，充值改四卡＋浏览器支付＋3秒云端轮询。
15. 阻塞：根级只读测试硬编码 `1.1.8`，与必须升级 `1.1.9` 冲突；详见 `BLOCKED.md`，不越权放宽断言。
16. Frontend patch 顺序修复：第 1 次 idempotence 失败于删除 QR 过早，第 2 次失败于术语替换破坏旧锚点，第 3 次通过；后续重复应用也 exit 0。
17. 对抗性 patch target RED：临时将注册 API 已应用标记改为不存在值，exit 1，明确报 `Missing frontend patch target: enable SMS registration and password reset APIs`；恢复后 GREEN exit 0。
18. Candidate 构建 exit 0：EXE `106581567` bytes / SHA256 `DE578553…B67202`；assets.zip `2533037` bytes / SHA256 `DFFBE81F…BB420`；runtime app.asar 未改。
19. `publish-magiorix-windows-release.ps1 -Stage Prepare` exit 0：原子复制 `public/assets/desktop/1.1.9/assets.zip` 并生成 `public/releases/windows/1.1.9.json`；未运行 Promote、未改 latest。
20. GUI 证据：直接启动 build payload 被本机单实例解析到已有 `D:\Tools\magiorix\magiorix.exe`，捕获报 `no screenshot targets found`；未覆盖安装，详见 `docs/1.1.9-candidate-evidence.md`。
21. Prepare 后发现桌面 `openExternal` bridge 路径错误；因 1.1.9 manifest 已按不可变规则生成，禁止同版本重建，当前 Candidate 保留失败证据并标记阻塞，未删除 manifest。
22. R3 审查第 1 轮 FAIL：发现 4 位码无限试错、平台/本地过期未对齐、缺支付宝 seller fail-fast、过期 pending 无限轮询；保留审查证据。
23. 修复后专项测试增至 19/19 pass、fail 0、skipped 0、todo 0：5 次错误锁码、bcrypt 后置、并发微信重放一次到账、平台30分钟过期、缺 seller 预付款失败、过期查询转 closed。
24. R3 第二轮仍 FAIL：共享 SQLite 裸事务并发可互相回滚，支付宝从打开页面重计30分钟；已作为第2轮修复目标。
25. 第2轮修复后专项 21/21 pass、skipped 0：所有写库请求在 parser/webhook 前串行；并发20错误码为5×400+15×429+0×500；支付宝使用订单剩余有效期。
26. R3 第三轮复核仍 FAIL：正常并发与支付宝/微信剩余有效期通过，但客户端在事务期间断连会因 `res.close` 提前释放串行锁；下一请求可交叉 `BEGIN/ROLLBACK`，且若干 GET 会经 `ensureAccount`/token 清理隐式写库而未纳入队列。按最多 3 轮硬规则停止修复，转入当前最优交付。
27. 最终 R3 verifier 第 1 次：static 全过；unit 14/15（唯一失败为只读判据硬编码 1.1.8）；build 按不可变保护拒绝已有 1.1.9 manifest；smoke 通过；integration 13/13 与 publish-prepare 通过；agent-review FAIL，故 receipt 为 fail。专项 `npm test` 21/21、skipped 0。
28. 外部授权恢复：允许第 4、5 轮并将 1.1.9 正式标记为 Abandoned Candidate；blocked 快照 `e7c1628252243372bf09c0d8e5398b5faec3c100` 已推送为 `origin/codex/magiorix-1.1.9-pay-sms`，未删除、覆盖、发布或 Promote 任何 1.1.9 产物。
29. 已从 `e7c1628` 新建并切换 `codex/magiorix-1.1.10-pay-sms`。新增测试白名单的实际改动目标仅为 `tests/unit/collection-runtime-contract.test.js`：原测试标题、资产路径和四条断言重复硬编码 `1.1.8`；将改为以 `app-source/package.json` 的 `version` 为唯一期望值，并继续严格核对 `assetsVersion`、后端版本、`assets/<version>/version.json`、构建脚本和 Candidate 目录，原因是支持 1.1.10 且不降低断言强度。除该版本一致性测试外不修改其他既有业务测试。
30. 第 4 轮资金事务 RED→GREEN：新增断连注册回归后，临时恢复旧 `res.close` 立即释放逻辑，目标测试 exit 1、`0/1 pass`，第二注册实得 HTTP `500`（期望 `200`）；恢复为仅标记断连并在异步路由 settle 后释放，exit 0、`1/1 pass`、skipped 0。GET `/api/*` 与 `/pay/*` 同步纳入队列，覆盖 `ensureAccount` 和过期 token 的隐式写库。
31. 1.1.10 从只读 `assets/1.1.8` 新建（未复制或重建废弃的 1.1.9 Candidate）；frontend patch 第 1 次失败于既有“树苗余额不足”变体，第 2 次失败于既有 `fetchBalance` 的“刷新树苗余额失败”变体，补充严格旧锚点后第 3 次 exit 0，立即重复执行仍 exit 0。充值 bundle 现使用 `window.bridge.system.shell.openExternal`。
32. 第 4 轮后端全套 `npm test` exit 0：22/22 pass、fail 0、skipped 0、todo 0；含断连事务、验证码锁定、两渠道非法签名/错金额余额不变及合法通知重放两次仅到账一次。
33. 1.1.10 canonical build 完成：NSIS 生成 EXE `106587966` bytes / SHA256 `DD4B3D64…F429BA`，assets.zip `2533031` bytes / SHA256 `B85ABBDB…CDC63D`；来源为 1.1.10 资产，未覆盖 1.1.8/1.1.9/runtime tracked app.asar，尚未 Promote。
34. 版本一致性强制 RED→GREEN：严格测试先 GREEN `1/1`；临时将后端版本改成 `1.1.11` 后 exit 1、`0/1 pass`，明确报 `'1.1.11' !== '1.1.10'`；恢复后 exit 0、`1/1 pass`、skipped 0。测试以 desktop version 为唯一期望，仍严格核对 assetsVersion、backend、assets/version.json、构建脚本和 Candidate release-info。
35. `publish-magiorix-windows-release.ps1 -Stage Prepare` exit 0：原子生成 `public/assets/desktop/1.1.10/assets.zip` 与不可变 `public/releases/windows/1.1.10.json`；未上传、未部署、未执行 Promote，`latest.json` 未改。
36. 为兼容 Prepare 后的 R3 build lane，构建脚本在已有 manifest 且传 `-OverwriteCandidate` 时改为只读不可变校验，不执行重建：逐项核对本地 EXE/assets.zip/release-info、public assets 与 manifest 的版本、文件名、大小、SHA256。实际 exit 0，输出 `Immutable Candidate verified without rebuild: 1.1.10` 及两项上述 SHA；任一缺失或不一致仍抛错。
37. 第 4 轮确定性 R3 预检全绿：static JS 5 files、PowerShell 8 files；unit 15/15；build immutable verify exit 0；smoke 1.1.10 pass；integration 13/13 与 publish-prepare pass；所有测试 skipped 0、todo 0。下一步为 fresh-context agent-review，尚未写 pass evidence。
38. GUI 证据：本会话未暴露 `computer-use` 工具，`playwright-interactive` 的必需 `js_repl` 也不可用，无法按安全技能流程启动/控制 Electron 并保存三张实机截图；未用旧安装版或静态 HTML 冒充，实际限制已写入 `docs/1.1.10-candidate-evidence.md`。
39. 第 4 轮 fresh-context 审查 FAIL：复现请求体解析阶段断连会永久占用 mutation queue；指出版本测试可整体回退且未核对 prepared assets/manifest，并确认生产漏配 `ADMIN_PASSWORD` 会启用公开默认值。其余支付幂等、1.1.10 bridge、Candidate 哈希和历史不可变性审查通过。
40. 第 5 轮修复：mutation queue 同时监听 `req.aborted/error`，解析期无活动 handler 时立即释放、事务期仍等 handler settle；首次目标测试保持 RED（后续请求 2 秒超时），补齐请求流事件后 `3/3 pass`。生产缺少不少于 12 字符管理员密码现 fail-fast；版本测试锁定 `1.1.10` 并核对后端常量、manifest、release-info、Candidate/prepared assets 大小与 SHA256。
41. 第 5 轮后端全套 `npm test` exit 0：24/24 pass、fail 0、skipped 0、todo 0；合法通知重放仍只到账一次。
42. 第 5 轮确定性 R3 预检全绿：static JS 5 files、PowerShell 8 files；unit 15/15；immutable build verify、smoke、integration 13/13、publish-prepare 均 pass；skipped 0、todo 0。
43. 第 5 轮 fresh-context 最终审查仍 FAIL（High）：合法签名、正确商户/应用/订单/金额的微信通知缺失 `transaction_id` 时实际返回 HTTP 200 SUCCESS，余额 `100→150`；支付宝空 `trade_no` 走同一未校验路径。其余断连队列、管理员 fail-fast、版本/哈希/bridge、历史不可变与敏感材料审查通过。已用完新增两轮授权，按硬规则停止，不进入第 6 轮；1.1.10 标记为 Blocked Candidate，禁止发布/Promote。
44. 最终 `verify-change.ps1` 实际 exit 1：static 全过；unit 15/15；immutable build verify、smoke、integration 13/13、publish-prepare 全过；agent-review evidence 为 FAIL，因此 receipt 正确为 fail。没有修改验收脚本或手工编辑 receipt。
