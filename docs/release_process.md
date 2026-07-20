# Windows 打包与发布流程

本文件保存 Windows 版本升级、打包、产物生成、上传与发布后验证步骤。发版前必须完整阅读。

## 版本输入与发布事实

构建版本以 `app-source/package.json` 的 `version` 和 `assetsVersion` 为输入。构建后的文件名、大小、URL 和 SHA256 只以 `release-info.json` 为准；服务端通过已晋升的 `public/releases/windows/latest.json` 提供更新数据。

升级版本时至少同步检查：

- `app-source/package.json`
  - `version`
  - `assetsVersion`
- `app-source/package-lock.json`
  - 根包版本字段
- 构建脚本和前端补丁会自动读取 `package.json`，不再维护第二份版本号。
- `red-magic-api/server.js` 的旧常量只用于没有 manifest 的兼容期；正式发布后接口读取 `latest.json`。
- `red-magic-api/public/index.html`
  - 下载按钮默认地址
  - 接口失败时显示的兜底版本号
- `assets/<old-version>`
  - 重命名或复制为 `assets/<new-version>`
- `red-magic-api/public/assets/desktop/<old-version>`
  - 重命名或复制为 `red-magic-api/public/assets/desktop/<new-version>`

## 本地打包命令

在项目根目录执行：

```powershell
rtk pwsh -NoProfile -Command '& "D:\download\pic-vec\pgydata\scripts\build-magiorix-windows-installer.ps1"'
```

## 打包脚本会自动完成的内容

- 应用前端资源补丁。
- 生成 `assets/<version>/integrity-manifest.json`。
- 生成 `desktop-versions/windows/<version>/magiorix-desktop-<version>-assets.zip`。
- 应用 Electron runtime 补丁。
- 重新打包 `runtime/magiorix-desktop/resources/app.asar`。
- 生成 `desktop-versions/windows/<version>/magiorix-desktop-<version>-windows.exe`。
- 生成 `.sha256.txt` 和 `release-info.json`。
- 不改写当前用户 `%APPDATA%`，不提前改变服务端 public 目录。

同版本候选产物默认不覆盖。发布前需要重建时显式执行：

```powershell
rtk pwsh -NoProfile -File scripts/build-magiorix-windows-installer.ps1 -OverwriteCandidate
```

## 打包后最低验证

```powershell
rtk node --check red-magic-api/server.js
rtk node --check scripts/apply-magiorix-frontend-patches.js
rtk node --check scripts/apply-magiorix-runtime-patches.js
rtk pwsh -NoProfile -Command 'Get-Item -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe"; Get-FileHash -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe" -Algorithm SHA256'
```

## 准备、上传与晋升

先准备资源和不可变版本 manifest：

```powershell
rtk pwsh -NoProfile -File scripts/publish-magiorix-windows-release.ps1 -Stage Prepare
```

随后上传 Windows 安装包，并同步以下候选文件到服务器，但暂不替换 `latest.json`：

Windows 安装包上传到 OSS：

```text
https://redmagic.oss-cn-beijing.aliyuncs.com/exe/magiorix-desktop-<version>-windows.exe
```

服务器需要同步的核心文件：

- `/home/red/work/moneyboost/red-magic-api/server.js`
- `/home/red/work/moneyboost/red-magic-api/public/index.html`
- `/home/red/work/moneyboost/red-magic-api/public/assets/desktop/<version>/assets.zip`
- `/home/red/work/moneyboost/red-magic-api/public/releases/windows/<version>.json`

如果静态图片有变化，也同步：

- `/home/red/work/moneyboost/red-magic-api/public/assets/magiorix-logo.png`
- `/home/red/work/moneyboost/red-magic-api/public/assets/software-screenshot.png`
- `/home/red/work/moneyboost/red-magic-api/public/emagic-logo.png`

确认安装包、资源包和版本 manifest 已在线后，在本地执行远端内容校验并生成 latest：

```powershell
rtk pwsh -NoProfile -File scripts/publish-magiorix-windows-release.ps1 -Stage Promote
```

最后只同步 `/home/red/work/moneyboost/red-magic-api/public/releases/windows/latest.json`，再重启服务。任一远端 SHA 或大小不一致时 Promote 会终止，旧 latest 保持不变。

## 发布后检查

- 重启后端服务，例如：`pm2 restart red-magic-api`
- 检查 `/api/desktop-download/latest` 是否返回新版本和新安装包地址。
- 检查 `/api/frontend-assets/latest/desktop` 是否返回新版本资源包。
- 运行 `scripts/verify-magiorix-windows-release.ps1`，确认本地产物、版本 manifest、远端文件和 latest 接口一致。
- 打开下载页，确认页面只显示版本号，不显示安装包大小。
- 用 [`docs/test_checklist.md`](D:\download\pic-vec\pgydata\docs\test_checklist.md) 做完整验收。

## 旧产物处理

确认新版本可用后，旧文件先备份再清理：

- `public/assets/desktop/<old-version>/`
- `public/downloads/EmagicDataCrawler-Setup.exe`
- 根目录下旧的 `downloads/EmagicDataCrawler-Setup.exe`

## Git 与发布注意事项

- 功能开发优先使用 feature branch 或 worktree。
- 合并到 `master` 前先检查差异和工作区状态。
- 功能提交后，发布时应追加单独的版本发布提交。
- 本地构建和验证通过后，再推送 `master` 到 GitHub。
- `desktop-versions/`、`red-magic-api/data/`、`red-magic-api/logs/`、`node_modules/` 不提交。

常用检查命令：

```powershell
rtk git status -sb
rtk git log -4 --oneline
rtk git push origin master
```

如果 Git LFS 上传完成但更新远端引用前连接断开，可先检查：

```powershell
rtk pwsh -NoProfile -Command 'git status -sb; git ls-remote origin refs/heads/master'
```

如果本地仍领先远端，直接重试：

```powershell
rtk git push origin master
```
