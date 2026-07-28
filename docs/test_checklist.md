# 发布前测试清单

本清单用于 Windows 发布前验收。建议逐项勾选并记录结论。

## 1. 构建产物

- [ ] 能成功执行 `scripts/build-magiorix-windows-installer.ps1`。
- [ ] `desktop-versions/windows/<version>/` 下生成了 `.exe`、`assets.zip`、`.sha256.txt`、`release-info.json`。
- [ ] `red-magic-api/public/assets/desktop/<version>/assets.zip` 已同步更新。
- [ ] `<version>.json` 与 `latest.json` 通过 schema 校验，且 latest 最后更新。
- [ ] `.exe` 和 `assets.zip` 的 SHA256 与 `release-info.json` 一致。

## 2. 安装与运行

- [ ] 新 `.exe` 可正常安装。
- [ ] 安装完成后应用可正常启动。
- [ ] 已安装环境重新覆盖安装后，运行时行为仍正常。
- [ ] 软件仍在运行时触发升级，安装器会等待旧进程退出后再写文件。
- [ ] 同时触发桌面更新和资源更新时只有一个写入者。
- [ ] 下载中断或资源校验失败后，旧版 `version.json` 和旧资源仍可启动。
- [ ] 中文用户名和带空格安装路径升级正常。
- [ ] 未出现旧 `app.asar` 导致的旧日志或旧界面行为。

## 3. 版本与下载接口

- [ ] `/api/desktop-download/latest` 返回正确版本号、文件名、下载地址。
- [ ] `/api/frontend-assets/latest/desktop` 返回正确版本号、下载地址、校验信息。
- [ ] `/api/desktop-versions/check` 返回结果符合当前版本预期。
- [ ] OSS 上的 Windows 安装包链接可下载。
- [ ] 服务器上的 `assets.zip` 链接可下载。
- [ ] 本地安装包 SHA = release-info SHA = 远端安装包 SHA = latest 接口 SHA。
- [ ] 错误 SHA、错误大小或远端文件缺失时 Promote 失败且旧 latest 不变。

## 4. 下载页与展示

- [ ] 下载页显示的新版本号正确。
- [ ] 下载页不显示安装包大小。
- [ ] 下载按钮指向正确安装包地址。
- [ ] 官网/帮助页的新增说明、截图和链接展示正常。

## 5. 日志与功能回归

- [ ] 主进程日志时间为北京时间。
- [ ] 日志中能看到任务平台、任务类型、进度和结果统计。
- [ ] 日志中出现 `采集调度器云端同步已关闭`。
- [ ] 本次发布涉及的新功能可以走通最小使用路径。
- [ ] 登录页默认手机号+密码，且没有二维码登录、左区和竖分割线。
- [ ] 注册/重置仅接受 4 位短信码；过期、错误、重复使用和 60 秒重发均拒绝。
- [ ] 新用户初始 100 积分；1.1.8 已有用户仍能用密码登录；旧短信登录接口不能建号。
- [ ] 充值页一行四卡，窄窗横向滚动；后三档赠送标签和最终获得积分正确。
- [ ] 点击唯一“立即充值”用系统浏览器打开 30 分钟支付页，支付页可选支付宝/微信。
- [ ] 两渠道非法签名、错金额、过期/关闭订单余额不变；同一合法通知重放两次只加分一次。
- [ ] 支付轮询、窗口聚焦和手动刷新都读取云端余额；成功后停止轮询并刷新记录。
- [ ] 日志不含验证码、密码、AccessKey、私钥、APIv3 密钥或真实通知报文。

## 6. 品牌与命名检查

- [ ] 代码和文案中未重新引入 `zs`、`@zsdesktop`、`PYGdata`、旧 Emagic/PYG 命名。
- [ ] 安装包名、下载页、接口返回字段保持 `magiorix` / `magiorix-desktop` 命名。

## 7. 发布收尾

- [ ] `CHANGELOG.md` 已补充本次版本记录、安装包路径、资源包路径和 SHA256。
- [ ] 已阅读 `docs/release_process.md` 并按流程完成发布。
- [ ] 已阅读 `docs/deploy.md` 并确认没有覆盖数据库、`.env`、日志和备份文件。
- [ ] 如需推送，已确认工作区状态、版本提交和发布提交都正确。
- [ ] `pwsh -NoProfile -File scripts/verify-change.ps1` 生成当前 diff 对应的通过回执。
- [ ] Hook 和 CI 未启用；本次后台发布链路不要求浏览器测试。
