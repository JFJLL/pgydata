# 故障排查

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
- 对应日期的 `server-YYYY-MM-DD.log`。
- 如果是安装失败，提供 `%TEMP%\PYGdata-install.log`。

不要发送 `.env`、SQLite 数据库、真实 Cookie、token 或账号密码。
