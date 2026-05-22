# 项目维护记忆

本文档用于给后续 Codex 会话、开发者或维护人员快速了解当前项目状态和发布流程。除非项目实际流程变化，否则后续会话应优先参考这里。

## 当前项目概况

- 项目名称：`magiorix`
- 桌面端包名：`magiorix-desktop`
- 当前 Windows 正式版本：`1.1.0`
- 主分支：`master`
- GitHub 仓库：`git@github.com:JFJLL/pgydata.git`
- Windows 安装包使用 NSIS 构建。
- 正式发布产物统一生成到 `desktop-versions/windows/<version>/`，但 `desktop-versions/` 不进 git。
- 大体积运行文件通过 Git LFS 管理，包括 `runtime/magiorix-desktop/resources/app.asar`。
- 不要重新引入旧项目名称或旧品牌痕迹，例如 `zs`、`@zsdesktop`、`PYGdata`、旧 Emagic/PYG 命名等。

## 重要本地目录

- 项目根目录：`D:\download\pic-vec\pgydata`
- Windows 桌面端运行时：`runtime/magiorix-desktop`
- Electron 源码目录：`app-source`
- 前端资源目录：`assets/<version>`
- 后端服务目录：`red-magic-api`
- 后端服务中的桌面端资源包：`red-magic-api/public/assets/desktop/<version>/assets.zip`
- Windows 打包脚本：`scripts/build-magiorix-windows-installer.ps1`
- 前端资源补丁脚本：`scripts/apply-magiorix-frontend-patches.js`
- Electron 运行时补丁脚本：`scripts/apply-magiorix-runtime-patches.js`
- 当前统一使用的 logo 源文件：`D:\download\pic-vec\pgydata\red-magic-api\public\emagic-logo.png`

## 当前 1.1.0 版本记录

- 已合并的功能分支 / worktree：`codex/starmap-menu`
- 新增功能：左侧菜单新增“抖音”，并提供“星图主页采集”入口。
- 相关提交：
  - `607cffe feat: show douyin starmap menu`
  - `722c880 style: enlarge primary sidebar icons`
  - `7712e4f chore: release magiorix 1.1.0`
- 当前 Windows 安装包：
  - `D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.0\magiorix-desktop-1.1.0-windows.exe`
  - SHA256：`DCCDEDE631AFA75A45FC7A001BBEA6D46FCB456DAD5FEB3C4E9F11861E7A282D`
- 当前前端资源包：
  - `D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.0\magiorix-desktop-1.1.0-assets.zip`
  - SHA256：`5BEB66392ABDDB1D879E7A520F39A90CE96DADD8EE484B131163171E2A61E08D`

## 版本号规则

- 补丁版本，例如 `1.1.1`：修 bug、修日志、修下载页、修打包脚本等小改动。
- 小版本，例如 `1.2.0`：新增用户可见功能、新平台、新菜单模块。
- 大版本，例如 `2.0.0`：数据结构、安装方式、服务端 API 或核心使用流程出现不兼容变化。
- 如果某个功能合并到 `master`，并准备重新打包给同事使用，应同步升级版本号。

## 升级 Windows 版本时必须同步修改的文件

升级版本时不要只改一个地方。至少检查并同步以下文件：

- `app-source/package.json`
  - `version`
  - `assetsVersion`
- `app-source/package-lock.json`
  - 根包版本字段
- `scripts/build-magiorix-windows-installer.ps1`
  - `$version`
- `scripts/apply-magiorix-frontend-patches.js`
  - `assetVersion`
- `red-magic-api/server.js`
  - `ASSET_VERSION`
  - `INSTALLER_FILE_NAME`
  - `INSTALLER_DOWNLOAD_URL`
  - 返回 latest version 的接口字段
- `red-magic-api/public/index.html`
  - 下载按钮默认地址
  - 接口失败时显示的兜底版本号
- `assets/<old-version>` 应重命名或复制为 `assets/<new-version>`
- `red-magic-api/public/assets/desktop/<old-version>` 应重命名或复制为 `red-magic-api/public/assets/desktop/<new-version>`

## Windows 打包流程

在项目根目录执行：

```powershell
rtk pwsh -NoProfile -Command '& "D:\download\pic-vec\pgydata\scripts\build-magiorix-windows-installer.ps1"'
```

打包脚本会自动完成：

- 应用前端资源补丁。
- 生成 `assets/<version>/integrity-manifest.json`。
- 生成 `desktop-versions/windows/<version>/magiorix-desktop-<version>-assets.zip`。
- 同步资源包到 `red-magic-api/public/assets/desktop/<version>/assets.zip`。
- 应用 Electron runtime 补丁。
- 重新打包 `runtime/magiorix-desktop/resources/app.asar`。
- 生成 `desktop-versions/windows/<version>/magiorix-desktop-<version>-windows.exe`。
- 生成 `.sha256.txt` 和 `release-info.json`。

打包后至少验证：

```powershell
rtk node --check red-magic-api/server.js
rtk node --check scripts/apply-magiorix-frontend-patches.js
rtk node --check scripts/apply-magiorix-runtime-patches.js
rtk pwsh -NoProfile -Command 'Get-Item -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe"; Get-FileHash -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe" -Algorithm SHA256'
```

## 服务器目录布局

生产服务器项目目录：

```text
/home/red/work/moneyboost/red-magic-api
```

服务器上预期结构：

```text
red-magic-api/
├── data/
│   └── red-magic-api.sqlite
├── public/
│   ├── admin/
│   │   └── index.html
│   ├── assets/
│   │   ├── desktop/
│   │   │   └── <version>/
│   │   │       └── assets.zip
│   │   ├── guide-authorizing.png
│   │   ├── guide-login.png
│   │   ├── magiorix-logo.png
│   │   └── software-screenshot.png
│   ├── emagic-logo.png
│   └── index.html
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

不要覆盖或删除：

- `data/red-magic-api.sqlite`
- 服务器上的 `.env`，如果存在
- 服务器日志
- 任何只存在于生产服务器上的备份文件

## 每次发布需要上传什么

Windows 安装包上传到 OSS：

```text
https://redmagic.oss-cn-beijing.aliyuncs.com/exe/magiorix-desktop-<version>-windows.exe
```

服务器上需要更新这些文件：

```text
/home/red/work/moneyboost/red-magic-api/server.js
/home/red/work/moneyboost/red-magic-api/public/index.html
/home/red/work/moneyboost/red-magic-api/public/assets/desktop/<version>/assets.zip
```

如果静态图片有变化，也同步：

```text
/home/red/work/moneyboost/red-magic-api/public/assets/magiorix-logo.png
/home/red/work/moneyboost/red-magic-api/public/assets/software-screenshot.png
/home/red/work/moneyboost/red-magic-api/public/emagic-logo.png
```

上传完成后：

- 重启后端服务，例如使用 PM2 时执行 `pm2 restart red-magic-api`。
- 检查 `/api/desktop-download/latest` 是否返回新版本和新安装包地址。
- 检查 `/api/frontend-assets/latest/desktop` 是否返回新版本资源包。
- 打开下载页，确认页面只显示版本号，不显示安装包大小。

确认新版本可用后，旧文件可以先备份再清理：

- `public/assets/desktop/<old-version>/`
- `public/downloads/EmagicDataCrawler-Setup.exe`
- 根目录下旧的 `downloads/EmagicDataCrawler-Setup.exe`

## Git 与 worktree 流程

- 功能开发优先使用 feature branch 或 worktree。
- 合并到 `master` 前先检查差异和工作区状态。
- 如果合并后要发布，应在功能提交之后追加一个单独的版本发布提交。
- 本地构建和验证通过后，再推送 `master` 到 GitHub。
- `desktop-versions/` 是本地发布输出目录，不提交。
- `red-magic-api/data/`、`red-magic-api/logs/`、`node_modules/` 等目录应保持忽略，不提交。

常用检查命令：

```powershell
rtk git status -sb
rtk git log -4 --oneline
rtk git push origin master
```

推送 GitHub 时，如果 Git LFS 大文件已经上传完成，但连接在更新分支引用前断开，可以先检查远端：

```powershell
rtk pwsh -NoProfile -Command 'git status -sb; git ls-remote origin refs/heads/master'
```

如果本地仍领先远端，直接重试：

```powershell
rtk git push origin master
```

## 日志与运行时约定

- 桌面端用户数据和日志目录在 `%APPDATA%\magiorix-desktop`。
- 主进程日志已改为北京时间。
- 未使用的 Scheduler 云端同步已关闭，日志中应看到 `采集调度器云端同步已关闭`。
- 如果已安装软件仍然出现旧日志行为，通常是安装目录里的旧 `app.asar` 没更新，应重新安装最新安装包。

## 当前服务端接口约定

`red-magic-api/server.js` 目前负责：

- `/api/desktop-download/latest`
  - 返回桌面端最新安装包版本、文件名、下载地址。
- `/api/frontend-assets/latest/desktop`
  - 返回桌面端前端资源包版本、下载地址、校验信息。
- `/api/desktop-versions/check`
  - 返回桌面端更新检测结果。

下载页故意不显示安装包大小，因为安装包正式放在 OSS，不一定存在于服务器本地文件系统。

## 安全与维护注意事项

- 不要提交生产数据库。
- 不要提交 cookie、token、API key、真实账号密码等敏感信息。
- 不要重新引入包含 `zs` 的旧目录名、旧包名或旧 UI 文案。
- 不要删除用户创建的 worktree，除非用户明确要求。
- 执行删除、移动、清理操作前，必须确认绝对路径位于预期项目目录或明确的归档目录内。
