# red-magic-api

这是一个可直接部署到服务器的最小后端目录，用于兼容 magiorix 客户端切换到 `https://magiorix.red-magic.cn` 后的基础接口。

当前部署建议同时保留 `https://xhs.red-magic.cn` 入口，供尚未同步 Windows 域名修改的 mac 客户端继续使用；两个域名都代理到同一个 Node 服务。

技术栈：Node.js + Express + SQLite。无需 Redis、MySQL、Docker。

## 本地启动

```bash
cd red-magic-api
cp .env.example .env
npm install
npm start
```

默认端口是 `3050`，本地地址：

```text
http://127.0.0.1:3050
```

## 服务器上传

把整个 `red-magic-api` 目录上传到服务器，例如：

```text
/www/red-magic-api
```

至少需要包含：

```text
package.json
server.js
.env.example
README.md
deploy-nginx.conf.example
public/
```

服务器上执行：

```bash
cd /www/red-magic-api
cp .env.example .env
npm install
npm start
```

生产环境建议用 PM2：

```bash
npm install -g pm2
cd /www/red-magic-api
pm2 start server.js --name red-magic-api
pm2 save
pm2 startup
```

## 环境变量

`.env.example` 默认内容：

```env
PORT=3050
BASE_URL=https://magiorix.red-magic.cn
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
TRUST_PROXY=127.0.0.1,::1
SMS_SECRET=
SMS_IP_HASH_SECRET=
LOG_IP_HASH_SECRET=
SMS_CODE_TTL_MS=300000
SMS_ENABLED=0
ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_TEMPLATE_CODE=
ALIYUN_SMS_REGION_ID=cn-beijing
ALIYUN_SMS_ENDPOINT=https://dysmsapi.aliyuncs.com
ALIPAY_ENABLED=0
ALIPAY_APP_ID=
ALIPAY_SELLER_ID=
ALIPAY_PRIVATE_KEY_PATH=
ALIPAY_PUBLIC_KEY_PATH=
ALIPAY_NOTIFY_URL=https://magiorix.red-magic.cn/api/shumiao/alipay/notify
ALIPAY_RETURN_URL=https://magiorix.red-magic.cn/pay/return
WXPAY_ENABLED=0
WXPAY_APP_ID=
WXPAY_MCH_ID=
WXPAY_SERIAL_NO=
WXPAY_PRIVATE_KEY_PATH=
WXPAY_API_V3_KEY=
WXPAY_PUBLIC_KEY_PATH=
WXPAY_PUBLIC_KEY_ID=
WXPAY_NOTIFY_URL=https://magiorix.red-magic.cn/api/shumiao/wxpay/notify
RECONCILIATION_ENABLED=0
LOG_DIR=./logs
```

SQLite 数据库会自动创建到：

```text
data/red-magic-api.sqlite
```

运行日志默认写入：

```text
logs/server-YYYY-MM-DD.log
```

日志会记录启动、请求错误、管理员登录和积分调整等排查信息，不会主动记录密码或登录 token。

启动时会在事务中执行版本迁移、保留历史数据，并初始化四档积分套餐。生产环境必须显式设置 `ADMIN_PASSWORD` 和 `SMS_SECRET`；支付宝、微信支付、短信和对账开关默认关闭。

充值接口 `POST /api/shumiao/recharge` 通过 `channel` 字段选择支付方式（`alipay` 默认 / `wxpay`）。支付宝使用预下单（`alipay.trade.precreate`）返回二维码，微信支付使用 V3 NATIVE 扫码模式；下单返回 `codeUrl`（支付宝为 `payUrl` 兼容值、微信为 `weixin://` 二维码内容）与 `qrCode`（客户端弹窗直接渲染：支付宝为二维码图片地址、微信为 `weixin://` 内容），客户端在软件内弹窗展示二维码并轮询订单状态，不再跳转浏览器。支付结果由 `POST /api/shumiao/alipay/notify`、`POST /api/shumiao/wxpay/notify` 回调入账。微信支付需要商户号、API 证书私钥、APIv3 密钥和微信支付平台公钥，`WXPAY_NOTIFY_URL` 必须为公网 HTTPS 地址。

用户端消耗记录接口 `GET /api/shumiao/consume-records` 与管理后台一致：同一提交任务（`task_id`）聚合为一条流水（`consumeCount` 为明细合计、`itemCount` 为明细条数、`balanceAfter` 取任务结束时的余额），无任务标识的历史记录仍按条展示。

## 管理后台

后端内置了一个独立管理页：

```text
https://magiorix.red-magic.cn/admin
```

管理员账号和密码由 `.env` 配置：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
```

登录后可以搜索用户，并通过“加减积分”按钮给用户增加或扣减积分。客户端不再使用原首页仪表盘，登录后会直接进入蒲公英采集页面。


### 数据中心与产品分析

`/admin` 已升级为 **magiorix 运营与产品数据中心**。管理员登录后可按最近 7、30、90 天或最多 366 天的自定义日期范围查看数据总览、用户分析、功能分析、充值与积分、系统质量、用户管理和流水记录。页面不依赖第三方图表库，使用原生 SVG 与 CSS 渲染趋势和分布。

所有新增统计统一按 **UTC+8 / 中国标准时间** 划分自然日，统计范围为开始日含、结束日含。核心口径如下：有效活跃用户、DAU、WAU、MAU 均以 `consume_records` 中发生过有效消费的去重用户计算，而不是以尚未过期的登录 token 代替活跃；有效任务以同一用户同一 `task_id` 聚合，无任务标识的历史消费记录各计一项；成功采集量为消费记录的 `SUM(count)`。新用户已激活表示注册后曾发生有效消费，不表示严格 24 小时激活。D1、D7、D30 留存按 UTC+8 注册 cohort 和对应日的有效消费计算，只展示已经成熟的 cohort；没有成熟样本时返回空值而不是 0%。

管理员专用分析接口均要求 Bearer 管理员会话，并统一支持 `range=7d|30d|90d` 或 `from=YYYY-MM-DD&to=YYYY-MM-DD`：

- `GET /api/admin/analytics/overview`：核心 KPI、上一等长周期对比和日趋势。
- `GET /api/admin/analytics/users`：用户、激活、DAU/WAU/MAU、留存和增长趋势。
- `GET /api/admin/analytics/usage`：历史核心采集使用、功能和输入来源，以及新增产品事件摘要。
- `GET /api/admin/analytics/finance`：已到账充值收入、创建 cohort 支付转化、渠道、套餐、首充优惠和积分流向。
- `GET /api/admin/analytics/system`：事件覆盖时间、客户端版本、任务/更新结果和支付异常。
- `GET /api/admin/users/:id/analytics`：不含密码、token、Cookie 或支付密钥的用户数据详情。

真正的充值收入只统计 `status = CREDITED` 且 `credited_at` 存在的订单；AOV 为已到账收入除以已到账订单数，ARPPU 为已到账收入除以付费用户数。支付转化以订单 `created_at` cohort 为分母、该 cohort 最终已到账订单为分子。首次付费用户与复购付费用户按历史已到账订单顺序识别；首充优惠使用是独立指标。系统不展示缺少成本依据的虚假“利润”或“佣金”。

数据库 schema 已升级到 **v5**。迁移会为 `consume_records` 增加 `plugin_id`、`task_type`、`planned_count`、`valid_count`，并从历史 `detail_json` 安全回填；无法解析的 JSON 保持 NULL，不会阻断迁移或改变既有积分/流水。迁移同时新增 `client_events` 及消费、用户、订单、事件分析索引。

客户端可向受登录保护的 `POST /api/analytics/events` 小批量提交最多 20 条白名单事件。第一版仅允许软件启动、任务开始/完成/失败/取消、导出完成、充值打开、更新成功/失败等明确字段；接口不接受 Cookie、token、密码、采集 URL、Excel 内容、用户内容、设备指纹、请求响应原文或任意 `meta_json`。客户端应异步最佳努力上报：埋点失败绝不影响采集、积分扣费、充值、登录、导出、启动或更新。产品事件统计会返回 `coverageStartAt`，并仅从埋点客户端版本开始累计。

## Nginx 配置

参考 `deploy-nginx.conf.example`，复制到服务器 Nginx 配置目录，例如：

```bash
sudo cp deploy-nginx.conf.example /etc/nginx/conf.d/magiorix.red-magic.cn.conf
sudo nginx -t
sudo systemctl reload nginx
```

配置会把 `magiorix.red-magic.cn` 和 `xhs.red-magic.cn` 的全部请求代理到：

```text
http://127.0.0.1:3050
```

Express 已经挂载：

```text
/assets -> public/assets
```

所以 Nginx 不需要单独配置 `/assets` alias。

## HTTPS 证书

示例配置使用已有证书路径：

```text
/etc/nginx/ssl/red-magic.cn/fullchain.pem
/etc/nginx/ssl/red-magic.cn/privkey.pem
```

如果服务器还没有证书，可以用 certbot 申请或续签。常见流程：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d magiorix.red-magic.cn -d xhs.red-magic.cn
sudo certbot renew --dry-run
```

如果你使用的是通配符证书，把证书文件放到示例配置中的路径即可。证书必须覆盖 `magiorix.red-magic.cn` 和 `xhs.red-magic.cn`。

## assets.zip 放置位置

桌面资源包必须放到：

```text
public/assets/desktop/1.2.0/assets.zip
```

部署后应能通过这个地址访问：

```text
https://magiorix.red-magic.cn/assets/desktop/1.2.0/assets.zip
```

兼容期内旧域名也应能访问同一资源：

```text
https://xhs.red-magic.cn/assets/desktop/1.2.0/assets.zip
```

接口 `GET /api/frontend-assets/latest/desktop` 会自动读取这个文件并计算 `size` 和 `sha256`。

## 关键接口测试

手机号注册、密码登录和密码重置：

先申请注册验证码；测试环境才会在响应中返回 `debugCode`，生产环境只通过短信发送：

```bash
curl -X POST http://127.0.0.1:3050/api/auth/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","purpose":"register"}'
```

使用短信验证码注册：

```bash
curl -X POST http://127.0.0.1:3050/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","code":"1234","password":"replace-with-password"}'
```

已有账号使用手机号和密码登录：

```bash
curl -X POST http://127.0.0.1:3050/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","password":"replace-with-password"}'
```

找回密码时使用 `purpose=reset_password` 申请验证码，再调用：

```bash
curl -X POST http://127.0.0.1:3050/api/auth/password/reset \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","code":"1234","newPassword":"replace-with-new-password"}'
```

复制返回的 `data.token`，后续接口带请求头 `satoken`。

查询用户信息：

```bash
curl http://127.0.0.1:3050/api/auth/info \
  -H "satoken: 这里替换成登录返回的token"
```

查询积分余额：

```bash
curl http://127.0.0.1:3050/api/shumiao/balance \
  -H "satoken: 这里替换成登录返回的token"
```

扣减积分：

```bash
curl -X POST http://127.0.0.1:3050/api/shumiao/consume \
  -H "Content-Type: application/json" \
  -H "satoken: 这里替换成登录返回的token" \
  -d '{"count":1}'
```

创建待支付订单：

```bash
curl -X POST http://127.0.0.1:3050/api/shumiao/recharge \
  -H "Content-Type: application/json" \
  -H "satoken: 这里替换成登录返回的token" \
  -d '{"packageId":"pkg_10"}'
```

查询桌面资源：

```bash
curl http://127.0.0.1:3050/api/frontend-assets/latest/desktop
```

如果还没有上传 `assets.zip`，该接口会返回清晰的资源文件不存在错误。
