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

## 诊断与反馈（一键上传诊断信息）

当用户在客户端遇到偶发故障、卡顿、任务失败或难以复现的问题时，可通过客户端「设置」→「诊断与反馈」一键生成并上传诊断包。

### 1. 诊断报告编号是什么

上传成功后，系统会为本次诊断生成唯一的**诊断报告编号**，例如：

```text
MGR-20260902-8F32BA
```

客服或开发人员仅需让用户提供该编号，即可在管理后台「诊断中心」直接定位问题。

### 2. 诊断包包含什么

诊断包经过统一脱敏后打包为标准 ZIP 文件（不超过 20MB），包含以下结构化信息：

- `manifest.json`：诊断清单（报告 ID、版本、平台、生成时间、关联任务、采集器状态等）。
- `system.json`：系统基础信息（OS 类型与版本、CPU 型号与核心数、内存总量与空闲、目录读写权限等）。
- `app.json`：应用环境信息（Electron / Chromium / Node 版本、客户端与资源版本、安装实例 ID 等）。
- `logs/`：最近 48 小时内的运行日志（自动截断并脱敏）。
- `errors/recent-errors.jsonl`：主进程及渲染进程的未捕获异常与堆栈。
- `tasks/`：最近任务的脱敏摘要（`tasks.json`）及关联任务的高价值执行轨迹（`<taskId>-trace.jsonl`）。
- `network/summary.json`：网络请求质量统计（请求量、超时数、状态码分布、平均耗时等）。
- `update/status.json`：更新检测与资源完整性状态。

### 3. 诊断包不包含什么（隐私与安全保护）

系统通过统一脱敏器（`DiagnosticRedactor`）及字段白名单保证敏感信息绝不泄漏：

- **业务数据**：不包含用户采集的具体数据行（`row` / `sourceRows`）、目标 URL 列表（`urls`）、用户上传的文件内容。
- **登录凭据与身份**：不包含密码、Token、`satoken`、`Bearer` 认证头、Cookie（`a1`、`web_session`、`sid` 等）、短信验证码。
- **个人隐私**：手机号已自动掩码处理（如 `138****5678`），邮箱掩码处理（如 `u***@example.com`）。
- **本地路径**：本地用户目录（如 `C:\Users\zhangsan\...` 或 `/Users/zhangsan/...`）均已自动脱敏替换为 `<USER_HOME>`。
- **硬件指纹**：禁止采集 MAC 地址、主板序列号、CPU 序列号、磁盘序列号或设备硬件 UUID。

### 4. 离线/上传失败时的本地导出

在断网或网络异常情况下，点击「上传诊断信息」失败后，可点击弹出的「**保存诊断包到本地**」按钮，将 ZIP 诊断包直接保存到本地磁盘，之后可通过邮件或聊天工具发送给技术人员进行离线分析。
