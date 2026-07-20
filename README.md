# magiorix

`magiorix` 是一个桌面端数据采集与账号服务项目。当前主要包含：

- Windows 桌面端：基于 Electron 运行时，面向小红书蒲公英、抖音星图等数据采集场景。
- 前端资源包：桌面端加载的静态资源，按版本放在 `assets/<version>/`。
- 后端服务：`red-magic-api`，提供登录、用户信息、树苗积分、管理后台、桌面端下载和资源包更新接口。
- Windows 安装包构建：通过 NSIS 把 Electron 运行时、`app.asar` 和前端资源打成安装包。

## 项目结构

```text
.
├── app-source/                         # Electron 应用源目录，主进程入口是 dist-electron/index.js
├── assets/<version>/                   # 桌面端前端资源
├── runtime/magiorix-desktop/           # Windows Electron 运行时和 resources/app.asar
├── red-magic-api/                      # Node.js + Express + SQLite 后端服务和下载页
├── scripts/                            # 前端补丁、运行时补丁、Windows 打包脚本
├── docs/                               # 发布、部署、测试、排障文档
├── desktop-versions/windows/<version>/ # 本地打包输出目录，不进 git
├── CHANGELOG.md                        # 版本记录、安装包路径、SHA256
└── AGENTS.md                           # 长期维护规则和红线
```

## 运行与依赖

### 后端服务

后端目录是 `red-magic-api`，技术栈是 Node.js + Express + SQLite。

```powershell
cd red-magic-api
npm install
npm start
```

默认端口是 `3050`。生产环境部署和接口说明见 [red-magic-api/README.md](red-magic-api/README.md) 与 [docs/deploy.md](docs/deploy.md)。

### 桌面端

当前仓库维护的是已构建后的 Electron 运行时和主进程包，重点文件是：

- `app-source/dist-electron/index.js`
- `runtime/magiorix-desktop/resources/app.asar`
- `assets/<version>/`

桌面端用户数据和日志默认位于：

```text
%APPDATA%\magiorix-desktop
```

日志和排障入口见 [docs/troubleshooting.md](docs/troubleshooting.md)。

## Windows 打包

发版或重新生成安装包前，先阅读 [docs/release_process.md](docs/release_process.md)。

在项目根目录执行：

```powershell
rtk pwsh -NoProfile -Command '& "D:\download\pic-vec\pgydata\scripts\build-magiorix-windows-installer.ps1"'
```

脚本只负责生成候选产物：

- 应用前端资源补丁。
- 生成 `assets/<version>/integrity-manifest.json`。
- 生成 `desktop-versions/windows/<version>/magiorix-desktop-<version>-assets.zip`。
- 应用 Electron runtime 补丁。
- 重新打包 `runtime/magiorix-desktop/resources/app.asar`。
- 生成 Windows 安装包、`.sha256.txt` 和 `release-info.json`。

打包后最低检查：

```powershell
rtk node --check red-magic-api/server.js
rtk node --check scripts/apply-magiorix-frontend-patches.js
rtk node --check scripts/apply-magiorix-runtime-patches.js
rtk pwsh -NoProfile -Command 'Get-Item -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe"; Get-FileHash -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe" -Algorithm SHA256'
```

## 发布与服务器同步

Windows 安装包发布到 OSS：

```text
https://redmagic.oss-cn-beijing.aliyuncs.com/exe/magiorix-desktop-<version>-windows.exe
```

已正式发布的版本禁止覆盖同名安装包或资源包。发布前确需重建候选产物时使用 `-OverwriteCandidate`；版本一旦出现在正式版本 manifest 中，后续修复必须升级 patch 版本。

发布分两步执行：

```powershell
# 1. 校验本地产物，准备 assets.zip 和不可变版本 manifest
rtk pwsh -NoProfile -File scripts/publish-magiorix-windows-release.ps1 -Stage Prepare

# 2. 上传安装包、同步资源和版本 manifest 后，验证远端内容并生成 latest.json
rtk pwsh -NoProfile -File scripts/publish-magiorix-windows-release.ps1 -Stage Promote
```

`latest.json` 必须最后同步到服务器。部署完成后运行：

```powershell
rtk pwsh -NoProfile -File scripts/verify-magiorix-windows-release.ps1 -ManifestPath red-magic-api/public/releases/windows/latest.json
```

如果升级版本号，需要同步检查并更新：

- `app-source/package.json`
- `app-source/package-lock.json`
- `scripts/build-magiorix-windows-installer.ps1`
- `scripts/apply-magiorix-frontend-patches.js`
- `red-magic-api/server.js`
- `red-magic-api/public/index.html`
- `assets/<version>/`
- `red-magic-api/public/assets/desktop/<version>/assets.zip`
- `CHANGELOG.md`

服务器核心同步文件：

- `/home/red/work/moneyboost/red-magic-api/server.js`
- `/home/red/work/moneyboost/red-magic-api/public/index.html`
- `/home/red/work/moneyboost/red-magic-api/public/assets/desktop/<version>/assets.zip`

同步后重启服务：

```bash
pm2 restart red-magic-api
```

然后检查：

- `/api/desktop-download/latest`
- `/api/frontend-assets/latest/desktop`
- 下载页展示和下载链接

## 安全与维护红线

- 不提交生产数据库、`.env`、cookie、token、API key、真实账号密码或服务器日志。
- 不覆盖服务器上的 `red-magic-api/data/`、`.env`、日志目录和备份文件。
- `desktop-versions/`、`red-magic-api/data/`、`red-magic-api/logs/`、`node_modules/` 不进 git。
- 不重新引入旧品牌或旧项目命名：`zs`、`@zsdesktop`、`PYGdata`、旧 Emagic/PYG 命名等。
- 涉及发布、部署、数据库、密钥、登录鉴权时，先确认影响面再操作。

## 变更验证

项目已接入风险路由验证系统，默认不启用 Hook 和 CI。本项目当前发布链路不要求浏览器测试。

```powershell
rtk pwsh -NoProfile -File scripts/verify-change.ps1 -PlanOnly
rtk pwsh -NoProfile -File scripts/verify-change.ps1
rtk pwsh -NoProfile -File scripts/verify-change.ps1 -CheckReceipt
```

## 常用文档

- [CHANGELOG.md](CHANGELOG.md)：版本历史、发布记录、安装包路径、SHA256。
- [docs/release_process.md](docs/release_process.md)：版本升级、Windows 打包、上传和发布验证。
- [docs/deploy.md](docs/deploy.md)：服务器目录、同步边界、接口检查、重启要求。
- [docs/test_checklist.md](docs/test_checklist.md)：发布前测试与验收清单。
- [docs/troubleshooting.md](docs/troubleshooting.md)：桌面端和后端日志排查。
