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
