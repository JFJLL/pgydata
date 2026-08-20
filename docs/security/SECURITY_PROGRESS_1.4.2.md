# 1.4.2 安全加固进度追踪

## 基础信息

- **BASE_SHA**: `2d681956aae143bf495ad44e5a1d98ffcb8a1ba4`
- **Worktree 路径**: `D:/download/pic-vec/pgydata-security-1.4.2`
- **分支**: `codex/security-hardening-1.4.2`
- **目标版本**: `1.4.2`
- **仓库可见性**: `PUBLIC` (`gh repo view JFJLL/pgydata --json visibility` 返回 `{"visibility":"PUBLIC"}`)
- **推送策略**: 仅本地 commit，禁止 push 到公开仓库；等待仓库改为 Private。

## 基线审计结论

1. **Electron 精确版本**: `33.0.2`
2. **Chromium / Node 版本**: Chromium `130.0.6723.59`, Node `20.18.0`, V8 `13.0.245.16-electron.0`
3. **Electron Runtime 引入路径**: 通过 Git LFS 托管于 `runtime/magiorix-desktop` 目录（包含 `magiorix.exe`、`resources/app.asar`、`pgy-chart-renderer.exe`、pak 及 DLL 文件）。
4. **app.asar 生成/安装/更新/加载路径**:
   - 生成：由 `app-source` 打包至 `runtime/magiorix-desktop/resources/app.asar`。
   - 安装：NSIS 解压并复制到 `$LOCALAPPDATA\Programs\magiorix\resources\app.asar`。
   - 加载：`magiorix.exe` 默认通过内置 Chromium/Node ASAR 支持加载 `resources/app.asar`。
   - 更新：客户端下载新版本安装包后由 NSIS 静默升级覆盖。
5. **scripts/pack-asar.js 实际用途**:
   - 原为手写 Pickle 序列化打包器，仅将文件流拼接并生成简单 header，缺少块级 SHA256 哈希及 ASAR Integrity 根哈希，无法支持 Electron 官方嵌入式 ASAR 完整性校验。
   - 改造：使用官方锁定版本 `@electron/asar@3.3.0` 替代，遍历并生成包含 per-file SHA256 integrity block hashes 的合规 ASAR 包。
6. **assets/<version> 生成与更新流程**:
   - 前端静态构建资源输出到 `assets/<version>`，包含 `index.html`、`version.json`、`integrity-manifest.json`、`assets/*.js` 等。
   - 打包时归档为 `assets.zip`。
   - 客户端通过热更新下载 `assets.zip`，解压至 `%APPDATA%\magiorix-desktop\assets\<version>`，并原子切换版本指针 `version.json`。
7. **integrity-manifest.json 生成与验证链**:
   - 原仅包含文件 SHA256 哈希列表，无非对称数字签名，防篡改强度不足。
   - 改造：引入 Ed25519 非对称签名，结合确定性 RFC 8785 Canonical JSON 生成与客户端强校验。
8. **BrowserWindow 创建位置与 webPreferences 审计**:
   - `splashWindow`: 已由 `nodeIntegration: true, contextIsolation: false` 加固为 `nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false`，配备独立极简 `splash-preload.mjs`。
   - `mainWindow`: 已加固为 `preload: preload.mjs, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false`。
   - `paymentWindow`: 已加固为 `nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true`，严密限制 `setWindowOpenHandler: deny` 与 URL 拦截。
   - `WindowManager.createWindow` (授权/采集窗口): 已补齐 `nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, setWindowOpenHandler: deny`。
9. **Preload 与 window.bridge 暴露面**:
   - `preload.mjs` 拆分为独立能力通道，严格禁止暴露原生 `ipcRenderer`、任意 channel、任意文件读写、任意 shell 执行。
   - 主进程 IPC Handler 全量部署统一的 sender 及 frame 合法性校验门禁 (`pgyValidateIpcSender`)。
10. **ipcMain 注册通道**:
    - 包含 `system:*`、`assets:*`、`scraper:*`、`scraping-scheduler:*`、`pgy-kol:*`、`update-*` 等通道全部加装 sender / senderFrame / isMainFrame / URL 白名单校验守卫。
11. **导航与外链**:
    - 主窗口仅允许预期的本地 `index.html` 或受控 Dev Server。
    - 支付窗口受限于白名单来源及 `alipay.com`。
    - 外部链接受限于安全的官方域名白名单。
12. **生产构建调试面**:
    - 生产环境已排查无 `.map` 文件及 `sourceMappingURL`。
    - 生产包已拦截 DevTools 快捷键 (F12, Ctrl+Shift+I) 及菜单入口。
    - 通过 Electron Fuses 物理熔断 `RunAsNode`、`EnableNodeOptionsEnvironmentVariable`、`EnableNodeCliInspectArguments`。
13. **Authenticode 签名状态**:
    - 构建流水线支持 `MAGIORIX_CODESIGN_PFX_PATH` / `MAGIORIX_CODESIGN_SUBJECT`。
    - 本地无证书时构建明确标记为 `unsigned-local` 候选包，并拦截进入正式发布流程。
14. **Electron Fuses 实测状态**:
    - 成功写入并锁定：
      `RunAsNode: false` (wire=48)
      `EnableNodeOptionsEnvironmentVariable: false` (wire=48)
      `EnableNodeCliInspectArguments: false` (wire=48)
      `EnableEmbeddedAsarIntegrityValidation: true` (wire=49)
      `OnlyLoadAppFromAsar: true` (wire=49)
    - 实测 `ELECTRON_RUN_AS_NODE=1` 启动立即被阻断（退出码 1，无任何 JS 输出）。
15. **余额绕过关键字审计**:
    - 经全量搜索，确认无 `本地模式无需余额`、`本地模式无需充值`、`skipBalance`、`bypassBalance`、`freeMode`、`localFree` 等恶意绕过标识。
    - 正常保留 `/api/shumiao/consume` 积分扣除逻辑。

## 实施阶段与进度

- [x] **阶段一：基线审计与 Worktree 环境初始化**
- [x] **阶段二：版本升级至 1.4.2**
  - `app-source/package.json` (version 1.4.2, assetsVersion 1.4.2, license UNLICENSED)
  - `red-magic-api/package.json` (version 1.4.2)
  - `assets/1.4.2/` (新建并更新 version.json, integrity-manifest.json, about bundle)
  - `CHANGELOG.md` (追加 1.4.2 Candidate 条目)
- [x] **阶段三：清除死代码与免余额残留**
  - 全量扫描确认无任何免积分绕过路径
- [x] **阶段四：Electron 窗口安全配置加固（Sandbox, CSP, DevTools, 导航与权限拦截）**
  - 启动页禁用 NodeIntegration，独立 `splash-preload.mjs`
  - 所有窗口开启 `sandbox: true, contextIsolation: true, webSecurity: true`
  - 生产环境拦截 F12 / Ctrl+Shift+I
  - 限制 Session 默认权限请求
  - 注入 strict Content-Security-Policy
- [x] **阶段五：Preload 拆分与统一 IPC Sender 校验门禁**
  - 创建 `app-source/electron-main/ipc-guard.mjs`
  - 全量 IPC Handler 部署 `pgyValidateIpcSender` (校验 senderFrame.parent === null, senderFrame.url, sender webContents)
- [x] **阶段六：官方 ASAR 打包与 Electron Fuses 写入与自检**
  - 升级 `scripts/pack-asar.js` 使用 `@electron/asar` 生成含 block-level SHA256 integrity 的包
  - 创建 `scripts/apply-electron-fuses.js` 写入 5 项关键 Fuses
  - 单元测试实测 Fuses 阻断 `ELECTRON_RUN_AS_NODE`
- [x] **阶段七：Ed25519 资源与更新 Manifest 数字签名链**
  - 创建 `scripts/manifest-crypto.js` 与 `red-magic-api/lib/manifest-crypto.js`
  - 实现确定性 Canonical JSON (RFC 8785) 序列化与 Ed25519 签名/验签
  - 客户端 `pgyVerifyAssets` 优先校验数字签名，签名失败或缺失即刻拒绝加载
- [x] **阶段八：Windows Authenticode 代码签名构建链适配**
  - 调整构建流水线：编译 -> 写 Fuses -> 写版本元数据 -> Ed25519 签名清单 -> 签名内部二进制 -> 校验内部签名 -> NSIS 打包 -> 签名安装包 -> 校验安装包 -> 生成 release-info
  - 支持无证书构建 `unsigned-local` 候选包
- [x] **阶段九：生产构建信息收缩与商业许可证声明**
  - 确认无 `.map` 与 `sourceMappingURL` 残留
  - 许可证更新为 `UNLICENSED` 并完善版权说明
- [x] **阶段十：全量测试套件验证与加固实测**
  - `tests/static-checks.mjs`: 17 个文件全量通过
  - `tests/check-powershell-syntax.ps1`: 7 个文件语法全量通过
  - `tests/unit/`: 149 项基础与安全测试全量通过
  - `tests/unit/pgy-kol-*.test.mjs`: 326 项批量与找博主测试全量通过
  - `red-magic-api/test/*.test.js`: 54 项后端支付与安全测试全量通过
  - NSIS 安装包构建测试：成功生成 `magiorix-desktop-1.4.2-windows.exe` (107,122,996 字节)

## 产物校验指纹

- **安装包**: `desktop-versions/windows/1.4.2/magiorix-desktop-1.4.2-windows.exe`
  - **大小**: `107122996` 字节
  - **SHA256**: `4C7A9D2B6DAD0AB7BFCBAD1EADDF5E6EBBA0A247A8CEC94C621570559471329B`
- **前端资源包**: `desktop-versions/windows/1.4.2/magiorix-desktop-1.4.2-assets.zip`
  - **大小**: `2591414` 字节
  - **SHA256**: `2AF1D6F41DF3881BFD83D7281F199AA924F0A16FEC5524E9CF6FDB49F2155FC3`
- **运行时 ASAR**: `runtime/magiorix-desktop/resources/app.asar`
  - **SHA256**: `FF7C4B737973483703D81055FC0FF1C85786F20AA6A5AAB4E4B52C47F6EB6411`

## 签名与凭证状态

- **Ed25519 发布公钥**: `MCowBQYDK2VwAyEAMaMnU+xxOv30CKGTxMe6SPK9ay4eN6DgTh0l/xmLwko=` (Key ID: `magiorix-release-2026-v1`)
- **Authenticode 状态**: `unsigned-local` (本地构建模式，未配置私有 PFX 证书)

## 是否允许推送

- **推送状态**: **未推送**
- **原因**: GitHub 仓库当前为 **PUBLIC**，按安全红线要求，安全加固分支 `codex/security-hardening-1.4.2` 仅在本地提交，等待仓库改为 Private 后再行推送。
