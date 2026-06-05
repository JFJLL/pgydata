# CHANGELOG

本文件保存版本历史、发布记录、安装包路径与校验信息，不放长期维护规则。

## 1.1.1

- 新增功能：抖音“星图主页采集”支持手动输入星图/抖音主页链接。
- 修复：授权状态监听返回并使用取消监听函数，避免长时间使用时累计 `scraper:auth:status-changed` 监听器。
- 修复：采集任务日志增加平台、任务类型、进度和结果统计，抖音星图采集会写入主进程日志。
- 修复：蒲公英采集字段模板按博主采集、笔记采集拆分，避免跨任务模板字段被自动过滤。
- 修复：小红书笔记采集手动输入支持直接填写 24 位笔记 ID。
- 修复：设置页新增手动“检查更新”，已是最新时提示 toast，发现新版本时弹出更新弹窗。
- 官网/帮助页：使用说明新增“小红书 / 抖音星图 / Mac 说明”子 tab，并加入抖音星图流程截图。
- Windows 安装包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.1\magiorix-desktop-1.1.1-windows.exe`
  - SHA256：`26EFD88A23B39571166F7C7F982D012CCF9B8C6B41C4C5AF733AA9133D612A23`
- 前端资源包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.1\magiorix-desktop-1.1.1-assets.zip`
  - SHA256：`B47FC30051C203A4F4E74436DEB37093B9D4E330381E1B3F4A15961E48584043`

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
