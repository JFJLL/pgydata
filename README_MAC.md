# magiorix macOS 构建与打包指南 (v1.4.4)

本项目已配置完整的 Electron + electron-builder macOS 构建环境，支持在 macOS 上直接打包生成 DMG 与 ZIP 安装包。

---

## 1. 前置环境要求

- **macOS** 12.0+ (支持 Intel x64 与 Apple Silicon M1/M2/M3/M4 arm64)
- **Node.js** >= 18 (推荐 Node.js 20 LTS 或 22)
- **npm** >= 9
- *(可选)* **Python 3** + **Pillow**：用于蒲公英图表本地离线渲染（若未安装则自动回退到内置 JS SVG 渲染引擎）
  ```bash
  pip3 install pillow
  ```

---

## 2. 快速打包 DMG

### 步骤 1：进入源码目录
```bash
cd app-source
```

### 步骤 2：安装依赖
```bash
npm install
```

### 步骤 3：一键构建 DMG
```bash
# 自动检测当前 Mac 芯片架构构建 DMG (Apple Silicon 生成 arm64，Intel 生成 x64)
npm run build:mac

# 或按需构建指定架构：
npm run build:mac:arm64     # 针对 Apple Silicon (M1/M2/M3/M4)
npm run build:mac:x64       # 针对 Intel 处理器
npm run build:mac:universal # 生成 Universal 双架构通用包
```

### 步骤 4：获取构建产物
构建完成后，DMG 和 ZIP 安装包位于：
```text
app-source/dist-mac/
├── magiorix-1.4.4-arm64.dmg
├── magiorix-1.4.4-arm64-mac.zip
└── ...
```

---

## 3. 本地开发与调试运行

如果需要直接以 Electron 窗口启动应用进行本地调试：
```bash
cd app-source
npm start
```

---

## 4. 架构与资源说明

- **主进程入口**：`app-source/dist-electron/index.js`
- **业务逻辑**：`app-source/electron-main/` 与 `app-source/pgy-kol/`
- **前端资源**：客户端首次启动时会自动从正式线上服务器（`https://magiorix.red-magic.cn/api/frontend-assets`）下载并校验 1.4.4 资源包；仓库内 `assets/1.4.4/` 亦提供了本地静态资源。
- **图表渲染引擎**：`tools/pgy_chart_renderer.py`，主进程优先调用系统 `python3`，异常时平滑回退至内置 JS 渲染。
