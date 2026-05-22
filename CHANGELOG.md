# CHANGELOG

本文件保存版本历史、发布记录、安装包路径与校验信息，不放长期维护规则。

## 1.1.1

- 新增功能：抖音“星图主页采集”支持手动输入星图/抖音主页链接。
- 修复：授权状态监听返回并使用取消监听函数，避免长时间使用时累计 `scraper:auth:status-changed` 监听器。
- 修复：采集任务日志增加平台、任务类型、进度和结果统计，抖音星图采集会写入主进程日志。
- 官网/帮助页：使用说明新增“小红书 / 抖音星图 / Mac 说明”子 tab，并加入抖音星图流程截图。
- Windows 安装包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.1\magiorix-desktop-1.1.1-windows.exe`
  - SHA256：`28BC6C9B109D57CD8CAFDFC4FDD7707EF5E262CA7B51D6B95CC607B632240F91`
- 前端资源包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.1\magiorix-desktop-1.1.1-assets.zip`
  - SHA256：`05780ED3D406A9DA9F322765A09226DFD1FADD3E6D6BE8265DC2D87A8331747A`

## 1.1.0

- 已合并的功能分支 / worktree：`codex/starmap-menu`
- 新增功能：左侧菜单新增“抖音”，并提供“星图主页采集”入口。
- 相关提交：
  - `607cffe feat: show douyin starmap menu`
  - `722c880 style: enlarge primary sidebar icons`
  - `7712e4f chore: release magiorix 1.1.0`
- Windows 安装包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.0\magiorix-desktop-1.1.0-windows.exe`
  - SHA256：`DCCDEDE631AFA75A45FC7A001BBEA6D46FCB456DAD5FEB3C4E9F11861E7A282D`
- 前端资源包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.0\magiorix-desktop-1.1.0-assets.zip`
  - SHA256：`5BEB66392ABDDB1D879E7A520F39A90CE96DADD8EE484B131163171E2A61E08D`
