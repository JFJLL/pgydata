# 发布前测试清单

本清单用于 Windows 发布前验收。建议逐项勾选并记录结论。

## 1. 构建产物

- [ ] 能成功执行 `scripts/build-magiorix-windows-installer.ps1`。
- [ ] `desktop-versions/windows/<version>/` 下生成了 `.exe`、`assets.zip`、`.sha256.txt`、`release-info.json`。
- [ ] `red-magic-api/public/assets/desktop/<version>/assets.zip` 已同步更新。
- [ ] `.exe` 和 `assets.zip` 的 SHA256 已记录到 `CHANGELOG.md`。

## 2. 安装与运行

- [ ] 新 `.exe` 可正常安装。
- [ ] 安装完成后应用可正常启动。
- [ ] 已安装环境重新覆盖安装后，运行时行为仍正常。
- [ ] 未出现旧 `app.asar` 导致的旧日志或旧界面行为。

## 3. 版本与下载接口

- [ ] `/api/desktop-download/latest` 返回正确版本号、文件名、下载地址。
- [ ] `/api/frontend-assets/latest/desktop` 返回正确版本号、下载地址、校验信息。
- [ ] `/api/desktop-versions/check` 返回结果符合当前版本预期。
- [ ] OSS 上的 Windows 安装包链接可下载。
- [ ] 服务器上的 `assets.zip` 链接可下载。

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

## 6. 品牌与命名检查

- [ ] 代码和文案中未重新引入 `zs`、`@zsdesktop`、`PYGdata`、旧 Emagic/PYG 命名。
- [ ] 安装包名、下载页、接口返回字段保持 `magiorix` / `magiorix-desktop` 命名。

## 7. 发布收尾

- [ ] `CHANGELOG.md` 已补充本次版本记录、安装包路径、资源包路径和 SHA256。
- [ ] 已阅读 `docs/release_process.md` 并按流程完成发布。
- [ ] 已阅读 `docs/deploy.md` 并确认没有覆盖数据库、`.env`、日志和备份文件。
- [ ] 如需推送，已确认工作区状态、版本提交和发布提交都正确。
