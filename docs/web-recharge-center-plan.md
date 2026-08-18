# magiorix 网页充值中心实施方案（可直接执行）

> 目标：把充值/支付完全从桌面端解耦，做成独立的网页充值中心（登录/注册/忘记密码 + 扫码充值 + 充值记录 + 消耗记录），桌面端只保留「余额 + 充值按钮」入口，点充值打开系统浏览器。风格参照 `D:\download\pic-vec\redbase-fullstack-latest` 的充值与登录界面，能复用的都复用。
>
> 版本保持 **1.3.5**（不升版本号）。1.3.5 目前是本地 Candidate、无 manifest，可安全重建候选产物；`latest.json` 保持 1.3.4 不动。

---

## 0. 已确认的需求（用户拍板）

1. 网页登录/注册**不需要验证码**；只有**忘记密码**才用短信验证码找回。
2. 桌面端**积分中心整组去掉**（积分充值 / 充值记录 / 消耗记录都只在网页），桌面只留头部「余额 + 充值按钮」，点充值打开浏览器。
3. 支付**以扫码为主**，流程/样式参照 redbase 的 `RechargeView.vue`。
4. 新增**关闭订单接口**，和 redbase 一样，网页充值中心支持「待支付订单拦截 + 取消」。
5. 版本保持 1.3.5。

---

## 1. 现状与复用

### 1.1 现有后端接口（全部复用，无需改契约）
- 认证：`POST /api/auth/login`、`POST /api/auth/register`（可无验证码，仅传 phone+password）、`POST /api/auth/sms/send`（purpose=`reset_password`）、`POST /api/auth/password/reset`、`POST /api/auth/logout`、`GET /api/auth/info`
- 积分：`GET /api/shumiao/balance`、`GET /api/shumiao/packages`、`POST /api/shumiao/recharge`（返回 `orderNo/payUrl/codeUrl/qrCode`）、`GET /api/shumiao/order/:orderNo`、`POST /api/shumiao/order/:orderNo/query`、`GET /api/shumiao/recharge-records`、`GET /api/shumiao/consume-records`、`POST /api/shumiao/consume`
- 网页支付：`GET /pay/:paymentToken`（支付宝 page-pay）、`GET /pay/return`（需升级）
- 鉴权方式：`satoken` 请求头 + `user_tokens` 表（30 天）；CORS 已放开 `*`。网页端沿用 satoken（与桌面端一致），**不改鉴权**。

### 1.2 redbase 参考（已读源码）
- 充值页 `frontend/src/features/billing/views/RechargeView.vue`：
  - 三步入流程（query 驱动 `view=checkout|pay|detail`）：确认页（订单信息 + 选支付方式）→ 支付页（品牌条 + 应付金额 + 248px 大二维码 + 检测支付状态 + 3 秒轮询最多 60 次）→ 详情页（支付成功 / 关闭订单 / 继续支付）。
  - 套餐列表 + 下方「充值订单」表格；kicker（Credits/Orders）+ 标题 + 副标题。
  - 已有待支付订单时新下单弹拦截框「您还有未完成的订单…」，可「返回我的订单 / 确认取消」。
  - 测试模式：后端返回 `fakeSettle` 时订单列表给「测试结算」链接、支付页给「测试快捷付款」。
- 登录 `frontend/src/features/auth/components/AuthPanel.vue`：tab「手机号注册 / 手机号登录」；注册=手机号+昵称+密码（无验证码）；登录=手机号+密码+「忘记密码？」；忘记密码=手机号+验证码（获取验证码 60s 冷却）+新密码。
- 设计令牌：`--workspace-brand:#d84444`、`--workspace-brand-ink:#bb3f3f`、`--workspace-text:#120f10`、白卡、圆角 12–18px、支付宝蓝 `#1672df`、微信绿 `#07c160`、状态点（红=待支付/绿=已支付）、左侧栏 224px。
- 二维码：`qrcode` 库前端 `toDataURL(...,{width:248,margin:1,errorCorrectionLevel:"M",color:{dark:"#111827",light:"#ffffff"}})`。

### 1.3 关键事实
- 桌面端菜单来自 `red-magic-api/server.js` 的 `getDefaultClientMenus()`；前端 `pgyKolWithLocalMenu` 只在开发模式加本地菜单，**生产菜单完全由服务端决定**——去掉 `points` 分组即可让桌面端积分中心整体消失，无需动前端 bundle。
- 桌面端「充值」按钮（`As` 组件）当前是 `const n=l=>{l.stopPropagation(),e("/shumiao/recharge")}`（在 `assets/1.3.5/assets/index-B09sHfUO.js`，已确认存在）。
- Electron `openSafeExternal`（开系统浏览器）走 `pgySafeExternalOrigins` 白名单，**当前不含 `magiorix.red-magic.cn`**，必须加，否则点充值没反应。
- 桌面端「余额不足」文案在补丁脚本第 723/725 行的 `请先充值后再开始采集`。
- 两个支付网关目前都没有关闭交易方法；关闭订单按「先查状态、已支付则入账、未支付才关闭」的安全写法实现，复用现有 `claimPendingOrder` / `setQueryStatus` / `settleRechargeOrder`。
- 1.3.5 无 manifest（`releases/windows/` 只有到 1.3.4），可重建候选产物；构建脚本同版本需 `-OverwriteCandidate`。

---

## 2. 总体架构

```
桌面端（只留入口）                    网页充值中心（业务全部在这）
┌──────────────────┐                ┌─────────────────────────────────┐
│ 头部 余额+充值按钮  │──浏览器打开──▶│ https://magiorix.red-magic.cn/recharge │
│ 积分中心菜单已去掉   │                │ #/login 登录/注册/忘记密码           │
│ 余额不足→提示去网页  │                │ #/recharge 套餐+扫码支付(三步入流程)  │
└──────────────────┘                │ #/recharge?view=checkout|pay|detail │
                                    │ #/records/recharge 充值记录(分页)    │
                                    │ #/records/consume 消耗记录(分页)    │
                                    └───────────────┬─────────────────┘
                                        同源 /api/*（satoken 头，独立会话）
                                    ┌────────────────▼─────────────────┐
                                    │ red-magic-api（Express+SQLite）     │
                                    │  + 新增 关闭订单接口 / /recharge 路由 │
                                    └──────────────────────────────────┘
```

---

## 3. 后端改动（`red-magic-api/`）

### 3.1 新增关闭订单接口 `POST /api/shumiao/order/:orderNo/close`
放在 `server.js` 的 `/api/shumiao/order/:orderNo/query` 处理器之后。逻辑（安全优先，绝不误关已支付订单）：

1. `authRequired`；按 `user_id + order_no` 查订单，404「订单不存在」。
2. `status !== PENDING` → 直接返回当前订单（幂等），message「订单已处理，无需关闭」。
3. 是 `isManualReviewOrder` → 返回当前订单，message「订单已进入人工复核，请联系客服」。
4. 渠道开关检查（channel 对应 enabled），未开启 → 503（与 query 一致）。
5. 用 `claimPendingOrder({ db, orderNo, now, minIntervalMs:15000, allowExpiredRetry:true, channel })` 串行化；拿不到 claim → 返回当前订单 + `queryInProgress:true` + message「查询请求已排队，请稍后刷新」。
6. 查网关：alipay 用 `gateway.queryTrade({orderNo})`，wxpay 用 `gateway.queryOrder({orderNo})`；校验 `outTradeNo` 一致。
7. `isSuccessfulTradeStatus(status)` → 调 `settleRechargeOrder({ source: channel==="wxpay"?"wxpay-close":"alipay-close", orderNo, channel, amountCents, merchantId: response.sellerId, appId: response.appId, transactionId: response.tradeNo, paidAt: response.gmtPayment })` → 返回 `{ order: paymentOrderView(最新), paidOnClose: true }`，message「订单已支付，积分已到账」。
8. `isDefinitiveUnpaidStatus(status)` → `setQueryStatus({ db, orderNo, status, close:true })` → 返回 `{ order: paymentOrderView(最新), closed: true }`，message「订单已关闭」。
9. 其它状态（仍在等待支付 / 未知）→ **不关闭**，返回当前订单，message「订单仍可支付，暂不关闭」。返回码用 200（带 order）并在 message 提示，避免前端把 409 当异常吞掉；或按 redbase 用 409 + order 字段。**建议**：返回 200 + order + message，前端按 message 展示。
10. 网关异常 → 不关闭，`setQueryStatus({ status:"ERROR:QUERY_FAILED" })`，返回当前订单，message「支付状态暂未确认，请稍后重试」。

响应统一 `{ order: paymentOrderView(...), closed?, paidOnClose?, queryInProgress? }`（`closed`/`paidOnClose` 为布尔标志，供前端区分）。

### 3.2 移除桌面积分中心菜单
`getDefaultClientMenus()` 删除整个 `points` 分组（积分充值 / 充值记录 / 消耗记录三个子项）。桌面端菜单即消失。

### 3.3 新增 `/recharge` 静态路由
```js
app.get("/recharge", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.sendFile(path.join(__dirname, "public", "recharge", "index.html"));
});
app.use("/recharge", express.static(path.join(__dirname, "public", "recharge")));
```
（`express.static` 负责 `/recharge/` 及 `app.js/style.css/vendor/*`；显式 `GET /recharge` 处理无尾斜杠。）

### 3.4 升级 `/pay/return`
由「请返回客户端」占位页改为可轮询的结果页（内联 HTML+JS，沿用 `setPaymentHeaders` 的 CSP，`script-src 'unsafe-inline'` 可用）：
- 读取 URL query 的 `out_trade_no`；
- 读取同源 `localStorage["magiorix-recharge-auth"]` 的 token，带 `satoken` 头轮询 `GET /api/shumiao/order/:orderNo`（15s 后调 `POST .../query`）；
- 显示「支付结果确认中…」→ 已支付显示「支付成功，积分已到账」+「查看充值记录」按钮（跳 `/recharge#/records/recharge`）；未支付显示「订单待支付」+「返回充值中心」按钮（跳 `/recharge`）。
- 若拿不到 token（非网页会话进入），仅显示提示 + 返回充值中心按钮。

### 3.5 后端测试
在 `red-magic-api/test/` 新增或扩展：
- `GET /recharge` 返回 200 且为 HTML。
- `POST /api/shumiao/order/:orderNo/close`：
  - 测试模式（`ALIPAY_TEST_MODE=1`）下，`ALIPAY_TEST_QUERY_STATUS=WAIT_BUYER_PAY` → 关闭返回 `closed:true`；
  - `ALIPAY_TEST_QUERY_STATUS=TRADE_SUCCESS` → 返回 `paidOnClose:true` 且余额增加。
- 运行 `cd red-magic-api && npm test`。

---

## 4. 网页充值中心（`red-magic-api/public/recharge/`）

### 4.1 文件与形态
```
public/recharge/
├── index.html          # 单页入口（无构建）
├── style.css           # 设计令牌 + 布局 + 组件样式
├── app.js              # 路由(基于 location.hash)、状态、API 封装、页面渲染
└── vendor/qrcode.min.js # 本地内置二维码库（qrcode 浏览器构建，MIT，不引 CDN）
```
技术形态：纯 HTML/CSS/JS，无框架、无构建步骤（与下载页/管理后台一致），方便直接部署与浏览器调试。hash 路由。

### 4.2 设计令牌（对齐 redbase）
```css
:root{
  --brand:#d84444; --brand-ink:#bb3f3f; --text:#120f10; --muted:#6b7280;
  --border:#eee8e6; --radius:12px; --bg:#faf7f5; --card:#fff;
  --alipay:#1672df; --wxpay:#07c160;
  --font:"Inter","Microsoft YaHei","PingFang SC",Arial,sans-serif;
}
```
布局：左侧栏 224px（品牌「Σ.magiorix」+ 导航「充值 / 充值记录 / 消耗记录」+ 底部用户昵称 + 退出登录），主内容区。登录页为独立居中面板。

### 4.3 路由（hash）
| hash | 说明 |
|---|---|
| `#/login` | 未登录默认。tab「手机号登录 / 手机号注册」+「忘记密码」表单 |
| `#/recharge` | 登录后默认。余额卡片 + 套餐卡片 + 充值订单表格 |
| `#/recharge?view=checkout&plan=<id>` | 确认页：订单信息 + 选择支付方式 + 立即支付 |
| `#/recharge?view=pay&orderNo=<no>` | 支付页（扫码为主）：品牌条 + 应付金额 + 248px 二维码 + 检测状态 + 轮询 |
| `#/recharge?view=detail&orderNo=<no>` | 详情页：支付成功 / 订单详情 + 关闭订单 + 继续支付 |
| `#/records/recharge` | 充值记录（分页表格） |
| `#/records/consume` | 消耗记录（分页表格） |

未登录访问任意页 → 跳到 `#/login`；登录后默认 `#/recharge`。

### 4.4 登录 / 注册 / 忘记密码（参照 redbase AuthPanel）
- 登录：手机号 + 密码 +「忘记密码？」（`POST /api/auth/login`）
- 注册：手机号 + 密码（8–64 位，**无验证码**）（`POST /api/auth/register`）
- 忘记密码：手机号 + 「获取验证码」按钮（`POST /api/auth/sms/send {purpose:"reset_password"}`，60s 冷却；测试环境响应含 `debugCode` 直接提示）+ 验证码 + 新密码（`POST /api/auth/password/reset`）
- 成功后存 `localStorage["magiorix-recharge-auth"] = {token, userInfo}`，跳 `#/recharge`。
- 注：`SMS_ENABLED=0` 时忘记密码不可用，界面给出提示「短信服务暂未开启」。

### 4.5 充值三步入流程（扫码为主，参照 RechargeView）
1. **列表**：余额卡片（`GET /api/shumiao/balance`）+ 套餐卡片（`GET /api/shumiao/packages`，金额大字/基础积分/到账积分/赠送角标/「立即充值」按钮）。点击套餐：若存在待支付订单（status=0）→ 弹拦截框；否则进 checkout。
2. **确认页 checkout**：左「订单信息」（订单号=待支付生成/商品=套餐名/支付金额/有效期 30 分钟）+ 右「选择支付方式」（支付宝/微信卡片单选）+ 底部大「立即支付」→ `POST /api/shumiao/recharge {packageId, channel}` → 进 pay。
3. **支付页 pay（扫码为主）**：
   - 品牌条（支付宝蓝渐变/微信绿渐变 + 大「支/微」字标）；
   - 左：应付金额大字；支付宝额外给「打开支付宝付款」链接（`payUrl` → `/pay/:paymentToken` 走 page-pay）+「复制支付链接」；
   - 右：**248px 大二维码**（支付宝=`<img src=qrCode>`；微信=`QRCode.toDataURL(qrCode)` 渲染 `weixin://`）+「请使用微信/支付宝扫码付款」+「↻ 检测支付状态」按钮；
   - 3 秒轮询 `GET /api/shumiao/order/:orderNo`（15s 后调 `POST .../query`），最多 60 次；
   - 已支付 → 绿色「支付完成」→ 刷新余额 → 跳 detail。
4. **详情页 detail**：已支付 → 绿色 ✓「支付完成」+「返回充值中心」；待支付 → 订单信息卡片 + 「关闭订单」（调 close 接口）+「继续支付」（回 pay）。

### 4.6 待支付订单拦截与关闭（redbase 同款）
- 进入 `#/recharge` 时拉 `GET /api/shumiao/recharge-records?page=1&pageSize=20`，筛出 status=0 的待支付订单。
- 有待支付订单时点套餐 → 弹框「您还有未完成的订单，购买前需要先取消，确定要取消之前的订单吗？」：按钮「返回我的订单」（跳该订单 pay 页）/「确认取消」（`POST /api/shumiao/order/:orderNo/close`，成功后刷新列表并进 checkout）。

### 4.7 充值记录 / 消耗记录
- 充值记录：`GET /api/shumiao/recharge-records?page=&pageSize=10`，表格（订单号/套餐/金额/积分/支付方式/状态徽标/创建时间/支付时间），待支付订单可点进 pay 页，分页器。
- 消耗记录：`GET /api/shumiao/consume-records?page=&pageSize=10`，表格（时间/消耗积分/明细条数/备注/消耗后余额），分页器。
- 状态徽标：待支付(红点)/已到账(绿点)/已关闭(灰点)/人工复核(橙点)。

### 4.8 API 封装
所有请求带 `satoken` 头（读 `magiorix-recharge-auth`）；响应 401 → 清会话跳 `#/login`；统一错误提示。`x-new-token` 头存在时更新本地 token（与桌面端一致）。

---

## 5. 桌面端改动

### 5.1 前端补丁（`scripts/apply-magiorix-frontend-patches.js`）
1. **头部「充值」按钮**：把 bundle 中的
   `const n=l=>{l.stopPropagation(),e("/shumiao/recharge")}`
   替换为
   `const n=l=>{l.stopPropagation(),window.bridge?.system?.shell?.openSafeExternal?.("https://magiorix.red-magic.cn/recharge")}`
   （用 `replaceOnce`，label 如 "header recharge opens browser"；若该字符串在补丁脚本中已存在则跳过）。
2. **余额不足文案**：把两处（723/725 行）的 `请先充值后再开始采集` 替换为 `请点击右上角「充值」在浏览器中完成充值后再开始采集`（`replaceAllIfExists`）。

### 5.2 运行时补丁（`scripts/apply-magiorix-runtime-patches.js`）
3. 在 `pgySafeExternalOrigins` 数组里（`"https://xingtu.cn"` 之后）追加一行 `"https://magiorix.red-magic.cn",`，使 `openSafeExternal` 能打开充值中心。

### 5.3 重打包 1.3.5 候选
- 构建脚本同版本候选需 `-OverwriteCandidate`：
  `rtk pwsh -NoProfile -Command '& "D:\download\pic-vec\pgydata\scripts\build-magiorix-windows-installer.ps1" -OverwriteCandidate'`
- 产物：`assets/1.3.5/`、`red-magic-api/public/assets/desktop/1.3.5/assets.zip`、`runtime/magiorix-desktop/resources/app.asar`、`desktop-versions/windows/1.3.5/` 安装包。
- 注意：`PointsRecharge` bundle 在菜单移除后成为不可达死代码，本次不动（可选后续清理）。

---

## 6. 版本与发布（保持 1.3.5）

- **不升版本号**：`app-source/package.json` 保持 1.3.5；`latest.json` 保持 1.3.4 不动。
- 网页充值中心属后端静态页：部署 `server.js` + `public/recharge/` 即可生效，`pm2 restart red-magic-api`。
- 桌面端产物按 1.3.5 候选重建；待用户决定发布时再走 `publish-magiorix-windows-release.ps1` 的 Prepare/Promote。
- 更新 `CHANGELOG.md` 1.3.5 条目（描述本次解耦改动 + 新资源包 SHA256）。

---

## 7. 测试与验收清单

后端：
- [ ] `cd red-magic-api && npm test` 全绿（含新增 /recharge 与 close 断言）。
- [ ] 本地 `npm start` 后浏览器打开 `http://127.0.0.1:3050/recharge` 可访问。
- [ ] 注册（无验证码）→ 登录 → 退出；忘记密码（测试环境 `debugCode`）→ 重置 → 新密码登录。
- [ ] `ALIPAY_TEST_MODE=1` + `ALIPAY_TEST_QUERY_STATUS=TRADE_SUCCESS`：充值 → 扫码页 → 检测/轮询 → 到账 → 充值记录/消耗记录可见。
- [ ] `ALIPAY_TEST_QUERY_STATUS=WAIT_BUYER_PAY`：待支付订单拦截 + 关闭订单 → 状态变已关闭。

桌面端（重建 1.3.5 候选后）：
- [ ] 头部「充值」按钮 → 系统浏览器打开 `https://magiorix.red-magic.cn/recharge`。
- [ ] 左侧栏积分中心（积分充值/充值记录/消耗记录）不再显示。
- [ ] 余额显示正常；余额不足时提示引导去网页充值。

发布前回归：按 `docs/test_checklist.md`。

---

## 8. 风险与回滚

- 桌面端是构建产物黑盒：补丁脚本保持幂等（`replaceOnce`/`replaceAllIfExists`），改前备份，回滚=`git revert` 对应提交后重打包。
- `pgySafeExternalOrigins` 加域名属安全相关改动，但该域名本就在支付弹窗白名单内，风险可控。
- 关闭订单接口安全设计：**先查状态，已支付才入账，未支付才关闭，状态未知绝不关闭**，避免误关已支付订单。
- 网页端沿用 satoken + localStorage（非 HttpOnly Cookie），与桌面端一致；页面无第三方脚本，XSS 面可控。
- 生产部署不覆盖 `red-magic-api/data/`、服务器 `.env`、日志、`latest.json`。

---

## 9. 实施顺序建议

1. 后端：关闭订单接口 + 移除 points 菜单 + `/recharge` 路由 + `/pay/return` 升级 + 测试。
2. 网页充值中心：`public/recharge/` 四个文件。
3. 本地起服务，按第 7 节手动验收网页端。
4. 桌面端：前端补丁 + 运行时补丁 + 重打包 1.3.5 候选。
5. 更新 CHANGELOG；等用户确认后再部署/发布。
