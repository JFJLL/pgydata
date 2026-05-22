# 故障排查

## 桌面端日志

桌面端主进程日志默认写到用户数据目录：

```text
Windows: %APPDATA%\magiorix-desktop\logs\magiorix-main-YYYY-MM-DD.log
macOS: ~/Library/Application Support/magiorix-desktop/logs/magiorix-main-YYYY-MM-DD.log
```

常见事件：

- `桌面端启动`：记录平台、架构、版本、`userData` 和 `resourcesPath`。
- `加载前端资源失败`：通常和资源包、完整性校验、路径有关。
- `本地资源校验失败`：通常是 `integrity-manifest.json` 或资源文件被改动。
- `渲染进程崩溃`：前端页面崩溃。
- `未处理的 Promise 异常` / `未捕获异常`：主进程未捕获错误。
- `应用准备退出`：应用开始退出。

## 后端日志

后端 `red-magic-api` 默认把日志写到：

```text
red-magic-api/logs/server-YYYY-MM-DD.log
```

也可以通过 `.env` 修改日志目录：

```env
LOG_DIR=./logs
```

日志是一行一条 JSON，常见事件：

- `server_started`：服务启动成功。
- `http_request_failed`：接口返回 4xx/5xx。
- `request_error`：接口执行过程中抛错。
- `database_init_failed`：数据库初始化失败。
- `admin_login_success` / `admin_login_failed`：管理员登录结果。
- `admin_add_points`：管理员给用户加积分。
- `unhandled_rejection` / `uncaught_exception`：未捕获异常。

## 反馈问题时需要提供

- 问题发生时间。
- 操作步骤。
- 桌面端对应日期的 `magiorix-main-YYYY-MM-DD.log`。
- 对应日期的 `server-YYYY-MM-DD.log`。
- 如果是安装失败，提供 `%TEMP%\magiorix-install.log`。

不要发送 `.env`、SQLite 数据库、真实 Cookie、token 或账号密码。
