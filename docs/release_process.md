# Windows 打包与发布流程

本文件保存 Windows 版本升级、打包、产物生成、上传与发布后验证步骤。发版前必须完整阅读。

## 版本升级时必须同步检查的文件

升级版本时不要只改一个地方。至少同步检查以下位置：

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
  - latest version 相关接口字段
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
- 同步资源包到 `red-magic-api/public/assets/desktop/<version>/assets.zip`。
- 应用 Electron runtime 补丁。
- 重新打包 `runtime/magiorix-desktop/resources/app.asar`。
- 生成 `desktop-versions/windows/<version>/magiorix-desktop-<version>-windows.exe`。
- 生成 `.sha256.txt` 和 `release-info.json`。

## 打包后最低验证

```powershell
rtk node --check red-magic-api/server.js
rtk node --check scripts/apply-magiorix-frontend-patches.js
rtk node --check scripts/apply-magiorix-runtime-patches.js
rtk pwsh -NoProfile -Command 'Get-Item -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe"; Get-FileHash -LiteralPath "desktop-versions\windows\<version>\magiorix-desktop-<version>-windows.exe" -Algorithm SHA256'
```

## 发布包上传与同步

Windows 安装包上传到 OSS：

```text
https://redmagic.oss-cn-beijing.aliyuncs.com/exe/magiorix-desktop-<version>-windows.exe
```

服务器需要同步的核心文件：

- `/home/red/work/moneyboost/red-magic-api/server.js`
- `/home/red/work/moneyboost/red-magic-api/public/index.html`
- `/home/red/work/moneyboost/red-magic-api/public/assets/desktop/<version>/assets.zip`

如果静态图片有变化，也同步：

- `/home/red/work/moneyboost/red-magic-api/public/assets/magiorix-logo.png`
- `/home/red/work/moneyboost/red-magic-api/public/assets/software-screenshot.png`
- `/home/red/work/moneyboost/red-magic-api/public/emagic-logo.png`

## 发布后检查

- 重启后端服务，例如：`pm2 restart red-magic-api`
- 检查 `/api/desktop-download/latest` 是否返回新版本和新安装包地址。
- 检查 `/api/frontend-assets/latest/desktop` 是否返回新版本资源包。
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
