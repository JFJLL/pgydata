# CHANGELOG

本文件保存版本历史、发布记录、安装包路径与校验信息，不放长期维护规则。

## 1.1.2

- 调度优化：企业任务在挑选可用账号时，除登录状态、冷却和班次休息外，也会同时判断日额度与当前班次额度，减少无效切号和启动后立刻暂停。
- 调度优化：企业采集节奏合并策略补齐 `scrapesPerDay`，任务启动前看到的剩余额度与实际运行口径保持一致。
- 新增：普通采集启动前由主进程执行授权可用性检查，授权不可用时直接给出“授权不可用 / 授权检测失败”分类。
- 新增：采集助手面板，支持蒲公英、星图、抖音授权状态检测、采集日志查看、失败项归类和失败项一键重跑。
- 优化：采集助手不再显示在登录页；右下角原任务小球与采集助手合并为一个入口，展开后按“采集助手 / 当前任务 / 历史记录”三 tab 展示。
- 优化：采集助手固定面板高度，切换 tab 不再改变面板高度；采集节奏下拉框展开时不再被自动刷新打断。
- 优化：彻底禁用旧圆形任务小球入口，登录后不再闪现。
- 优化：桌面更新提醒不再强制，Windows 更新弹窗可关闭；macOS 暂不参与 Windows 更新通道。
- 优化：蒲公英采集页面改为单输入框模式，xlsx 导入或拖拽后会把第一列内容填入输入框，开始采集统一按输入框内容执行。
- 新增：普通采集支持稳定 / 均衡 / 快速三档节奏，按批次自动休息，减少大批量任务连续请求压力。
- 新增：普通采集失败结果增加分类字段，覆盖链接无效、目标不存在、授权失效、验证码/安全验证、平台风控、超时和未知错误。
- 发布脚本：同步生成 `1.1.2` 前端资源目录、完整性清单、`assets.zip` 和 Windows 安装包。
- Windows 安装包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.2\magiorix-desktop-1.1.2-windows.exe`
  - SHA256：`8E203CBC880C61BDF7BEEED612C50F8E63BB02CAAADB4D2C12BAC7C9F220824E`
- 前端资源包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.2\magiorix-desktop-1.1.2-assets.zip`
  - SHA256：`9B99E6EF6A42876C0B5BC8688119BB198846B8C8F3B30EA684667A310EFDC2A0`

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
