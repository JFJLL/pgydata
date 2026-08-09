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

启动时会在事务中执行版本迁移、保留历史数据，并初始化四档积分套餐。生产环境必须显式设置 `ADMIN_PASSWORD` 和 `SMS_SECRET`；支付宝、短信和对账开关默认关闭。

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
