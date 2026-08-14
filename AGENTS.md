# 项目长期记忆

本文件只保留长期稳定的维护规则。版本流水账、发布步骤、部署细节请看下方分工文档。

## 项目基础信息

- 项目名称：`magiorix`
- 桌面端包名：`magiorix-desktop`
- 主分支：`master`
- GitHub 仓库：`git@github.com:JFJLL/pgydata.git`
- Windows 安装包使用 NSIS 构建。
- 正式发布产物输出目录：`desktop-versions/windows/<version>/`
- `desktop-versions/` 不进 git。
- 大体积运行文件通过 Git LFS 管理，包括 `runtime/magiorix-desktop/resources/app.asar`。

## 关键目录

- Electron 源码：`app-source`
- Windows 桌面端运行时：`runtime/magiorix-desktop`
- 前端资源目录：`assets/<version>`
- 后端服务目录：`red-magic-api`
- 桌面端资源包：`red-magic-api/public/assets/desktop/<version>/assets.zip`
- Windows 打包脚本：`scripts/build-magiorix-windows-installer.ps1`
- 前端资源补丁脚本：`scripts/apply-magiorix-frontend-patches.js`
- Electron 运行时补丁脚本：`scripts/apply-magiorix-runtime-patches.js`

## Codex 工作规则

- 默认使用中文回复，除非用户明确要求其他语言。
- 修改前先说明计划和影响范围。
- 不要直接做大面积重构，优先最小改动。
- 不要修改核心业务逻辑，除非用户明确要求。
- 涉及打包、发布、数据库、密钥、登录鉴权、服务器部署时，必须先提示风险和影响面。
- 每次修改后必须说明：改了哪些文件、为什么改、如何测试、如何回滚。
- 删除、移动、清理文件前，必须确认绝对路径、目标范围和回滚方式。
- 发版前必须阅读 [`docs/release_process.md`](D:\download\pic-vec\pgydata\docs\release_process.md)。

## 品牌和命名红线

- 禁止重新引入旧项目名称或旧品牌痕迹：`zs`、`@zsdesktop`、`PYGdata`、旧 Emagic/PYG 命名等。

## 版本号规则

- patch，例如 `1.1.1`：修 bug、修日志、修下载页、修打包脚本等小改动。
- minor，例如 `1.2.0`：新增用户可见功能、新平台、新菜单模块。
- major，例如 `2.0.0`：数据结构、安装方式、服务端 API 或核心使用流程出现不兼容变化。
- 功能合并到 `master` 并准备重新打包给同事使用时，应同步升级版本号。

## Git 与发布规则

- 功能开发优先使用 feature branch 或 worktree。
- 合并到 `master` 前先检查差异和工作区状态。
- 发布时应追加单独的版本发布提交。
- 本地构建和验证通过后，再推送 `master`。
- 以下目录或产物不提交：`desktop-versions/`、`red-magic-api/data/`、`red-magic-api/logs/`、`node_modules/`。
- `red-magic-api/public/releases/windows/<version>.json` 和 `latest.json` 属于发布状态与用户成果，不得当作构建残留删除、覆盖或回退。
- 已存在版本 manifest 时，构建脚本拒绝同版本重建是不可变发布保护；不得删除 manifest 来绕过。若需改变产物，升级 patch 版本。
- manifest、`latest.json`、本地产物或线上文件发生冲突时，先停止并向用户确认发布阶段和文件归属；不得为了让验证通过而擅自改变发布状态。
- 每次推送包含 Git LFS 大文件的提交（如 `runtime/magiorix-desktop/resources/app.asar`、`magiorix.exe`、`pgy-chart-renderer.exe`）后，应执行 `git lfs prune`（必要时加 `git gc --prune=now`）清理本地历史 LFS 对象缓存，避免 `.git` 体积无限堆积；被清理对象在远程仓库仍有备份，可随时按需拉取，不影响历史完整性。

## 安全红线

- 不提交生产数据库。
- 不提交 cookie、token、API key、真实账号密码、`.env`、服务器日志。
- 不覆盖 `red-magic-api/data/`、服务器 `.env`、日志目录、服务器备份文件。
- 不删除用户创建的 worktree，除非用户明确要求。

## 文档分工

- [`CHANGELOG.md`](D:\download\pic-vec\pgydata\CHANGELOG.md)：版本历史、发布记录、安装包路径、SHA256。
- [`docs/release_process.md`](D:\download\pic-vec\pgydata\docs\release_process.md)：版本升级、Windows 打包、发布与验证流程。
- [`docs/deploy.md`](D:\download\pic-vec\pgydata\docs\deploy.md)：服务器目录、部署同步、接口检查、重启要求。
- [`docs/test_checklist.md`](D:\download\pic-vec\pgydata\docs\test_checklist.md)：发布前测试与验收清单。
