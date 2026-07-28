# red-magic-api

这是 magiorix 的 Express + SQLite 云端服务，1.1.10 提供短信注册/重置密码、四档积分充值、支付宝电脑网站支付与微信 Native 支付。

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

环境变量完整清单以 `.env.example` 为准。真实 AccessKey、APIv3 密钥、私钥和证书只放服务器 `.env` 或受限文件路径，不复制到仓库；`SMS_CODE_SECRET` 需使用独立的随机值。

SQLite 数据库会自动创建到：

```text
data/red-magic-api.sqlite
```

运行日志默认写入：

```text
logs/server-YYYY-MM-DD.log
```

日志会记录启动、请求错误、管理员登录和积分调整等排查信息，不会主动记录密码或登录 token。

启动时会兼容迁移 `sms_codes`、积分套餐与支付订单字段；旧套餐保留但禁用，新接口只返回 10/100/500/1000 元四档。

## 管理后台

后端内置了一个独立管理页：

```text
https://magiorix.red-magic.cn/admin
```

管理员账号和密码由 `.env` 配置：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成强密码
```

登录后可以搜索用户，并通过“加减积分”按钮给用户增加或扣减树苗积分。客户端不再使用原首页仪表盘，登录后会直接进入蒲公英采集页面。

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
public/assets/desktop/1.1.2/assets.zip
```

部署后应能通过这个地址访问：

```text
https://magiorix.red-magic.cn/assets/desktop/1.1.2/assets.zip
```

兼容期内旧域名也应能访问同一资源：

```text
https://xhs.red-magic.cn/assets/desktop/1.1.2/assets.zip
```

接口 `GET /api/frontend-assets/latest/desktop` 会自动读取这个文件并计算 `size` 和 `sha256`。

## 关键接口测试

短信注册分三步：

```bash
curl -X POST http://127.0.0.1:3050/api/auth/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","purpose":"register"}'

curl -X POST http://127.0.0.1:3050/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","code":"四位验证码","password":"至少8位密码"}'
```

重置密码把 `purpose` 改为 `reset_password`，再调用 `/api/auth/password/reset`。旧 `/api/auth/sms/login` 仅兼容已有用户的手机号密码登录，不再创建账号。

复制返回的 `data.token`，后续接口带请求头 `satoken`。

查询用户信息：

```bash
curl http://127.0.0.1:3050/api/auth/info \
  -H "satoken: 这里替换成登录返回的token"
```

查询积分余额（内部兼容路径仍为 `/api/shumiao/*`）：

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
  -d '{"packageId":"points_1000"}'
```

响应里的 `payUrl` 是 30 分钟有效的浏览器支付页，用户在页面内选择支付宝或微信。微信通知固定为 `POST /order`，支付宝通知为 `/order/alipay/notify`；两路都必须通过签名、商户/应用、订单、金额和有效期校验后才原子入账，通知重放只返回成功而不重复加分。

自动验收：

```bash
npm test
```

测试用临时数据库和运行时生成的 RSA/AES 夹具覆盖短信限流、过期/错误/一次性验证码、旧接口禁建号、100 初始积分、双渠道非法签名/错金额/过期订单及通知重放，不能替代新商户真实密钥联调。

查询桌面资源：

```bash
curl http://127.0.0.1:3050/api/frontend-assets/latest/desktop
```

如果还没有上传 `assets.zip`，该接口会返回清晰的资源文件不存在错误。
