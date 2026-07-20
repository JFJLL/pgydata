# 部署说明

本文件保存服务器目录结构、部署同步边界、接口约定与重启检查要求。

## 生产服务器目录

生产服务器项目目录：

```text
/home/red/work/moneyboost/red-magic-api
```

服务器预期结构：

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
│   ├── releases/
│   │   └── windows/
│   │       ├── <version>.json
│   │       └── latest.json
│   └── index.html
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

## 禁止覆盖或删除

- `data/red-magic-api.sqlite`
- 服务器上的 `.env`
- 服务器日志
- 任何只存在于生产服务器上的备份文件

## 部署时需要同步的文件

- `/home/red/work/moneyboost/red-magic-api/server.js`
- `/home/red/work/moneyboost/red-magic-api/public/index.html`
- `/home/red/work/moneyboost/red-magic-api/public/assets/desktop/<version>/assets.zip`
- `/home/red/work/moneyboost/red-magic-api/public/releases/windows/<version>.json`
- `/home/red/work/moneyboost/red-magic-api/public/releases/windows/latest.json`（必须最后同步）

如果静态图片有变化，也同步：

- `/home/red/work/moneyboost/red-magic-api/public/assets/magiorix-logo.png`
- `/home/red/work/moneyboost/red-magic-api/public/assets/software-screenshot.png`
- `/home/red/work/moneyboost/red-magic-api/public/emagic-logo.png`

Windows 安装包上传到 OSS：

```text
https://redmagic.oss-cn-beijing.aliyuncs.com/exe/magiorix-desktop-<version>-windows.exe
```

## 部署后动作

- 重启服务：`pm2 restart red-magic-api`
- `latest.json` 必须在安装包、资源包和版本 manifest 全部在线且 SHA 校验通过后再同步。
- 确认接口返回的版本、地址、校验信息都已更新。
- 打开下载页确认展示正常。

## 当前服务端接口约定

`red-magic-api/server.js` 负责以下接口：

- `/api/desktop-download/latest`
  - 返回桌面端最新安装包版本、文件名、下载地址。
- `/api/frontend-assets/latest/desktop`
  - 返回桌面端前端资源包版本、下载地址、校验信息。
- `/api/desktop-versions/check`
  - 返回桌面端更新检测结果。

三个接口统一读取 `public/releases/windows/latest.json`。文件不存在时保留 1.1.3 旧常量兼容；新版本正式发布必须提供 manifest。

下载页故意不显示安装包大小，因为安装包正式放在 OSS，不一定存在于服务器本地文件系统。

## 日志与运行时约定

- 桌面端用户数据和日志目录在 `%APPDATA%\magiorix-desktop`。
- 主进程日志已改为北京时间。
- 未使用的 Scheduler 云端同步已关闭，日志中应看到 `采集调度器云端同步已关闭`。
- 如果已安装软件仍然出现旧日志行为，通常是安装目录里的旧 `app.asar` 没更新，应重新安装最新安装包。
