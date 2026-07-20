# CHANGELOG

本文件保存版本历史、发布记录、安装包路径与校验信息，不放长期维护规则。

## 1.1.5 (Unreleased)

- 新增：蒲公英博主采集可选“日常笔记表现图”，按“日常笔记 / 图文+视频 / 近30日 / 仅自然流量”口径汇总发布笔记、内容类目及占比、曝光中位数和阅读中位数。
- 导出：新图片列排在五张粉丝图表之后；缺失项统一显示 `-`，且该字段默认不勾选。

## 1.1.4 (Unreleased)

- 发布流程：构建版本统一读取 `app-source/package.json`，候选产物不再自动改写本机 AppData 或服务端资源目录。
- 发布流程：新增不可变版本 manifest、远端安装包/资源包 SHA256 验证和 `latest.json` 最后晋升脚本。
- 桌面更新：增加单实例、桌面安装包优先级、资源 `.part` 下载和校验后原子切换。
- Windows 安装器：写文件前等待旧版 `magiorix.exe` 退出，并细化资源目录清理错误。
- 测试：接入风险路由验证系统；Hook、CI 和浏览器测试保持关闭。

## 1.1.3

- 修复：普通采集在创建采集窗口前由主进程按有效链接数量校验树苗余额；余额不足时任务不会启动，并提示当前余额、本次需要数量和差额。
- 修复：采集面板开始前强制请求服务端校验树苗余额，不再信任本地缓存；余额不足时停留在输入页提示，不会先进入“采集中”再退出。
- 修复：积分扣减改为成功结果下发前按条实时扣减；暂停下载已采集结果时，这些成功结果已经扣费。
- 修复：取消任务不再按本次提交链接总量扣费，最终只保留已成功采集条数的实时扣费。
- 修复：移除前端任务完成后的旧版成功条数扣费逻辑，避免重复扣费；任务完成后仅刷新余额。
- 修复：采集助手历史任务保存成功结果，并在历史记录中提供“下载文档”入口；旧版本仅保存摘要的历史记录会提示需重新采集。
- 优化：树苗余额检查接口返回 `required` 和 `shortage`，便于前端展示明确的不足原因。
- 发布脚本：同步生成 `1.1.3` 前端资源目录、完整性清单、`assets.zip` 和 Windows 安装包。
- Windows 安装包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.3\magiorix-desktop-1.1.3-windows.exe`
  - SHA256：`C874C2166E7C0EBBC2AD427028FB3060441D9A20D33239077B30F3887C5E16BA`
- 前端资源包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.3\magiorix-desktop-1.1.3-assets.zip`
  - SHA256：`4E25B29C9459CDA8E4B26F590212108DC87F231674B603D223B42F86550A2EDC`

## 1.1.2

- 新增：普通采集启动前由主进程执行授权可用性检查，授权不可用时直接给出“授权不可用 / 授权检测失败”分类。
- 新增：采集助手面板，支持蒲公英、星图授权状态检测、采集日志查看、失败项归类和失败项一键重跑。
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
  - SHA256：`16F94FF1ABB6BC8DF80A83340F56FE593B8DFB06BB9B7202EB922509268C8331`
- 前端资源包：
  - 路径：`D:\download\pic-vec\pgydata\desktop-versions\windows\1.1.2\magiorix-desktop-1.1.2-assets.zip`
  - SHA256：`1CB4F29BFC797E00A244841FE2606B2880E262BC017B52A21DE0CE1ACFE1E8FD`

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
