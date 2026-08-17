# CHANGELOG

本文件保存版本历史、发布记录、安装包路径与校验信息，不放长期维护规则。

## 1.3.5 (Candidate)

- 新增：充值页支持选择支付方式（支付宝 / 微信支付），选定套餐后可在两种方式间切换；微信支付使用 V3 NATIVE 扫码模式，客户端直接渲染 `weixin://` 二维码，支付成功后自动确认到账。
- 新增：服务端接入微信支付（`lib/wxpay-gateway.js`），下单、回调验签解密、主动查询与对账均按渠道隔离；`POST /api/shumiao/recharge` 新增 `channel` 参数（`alipay` 默认 / `wxpay`），`POST /api/shumiao/wxpay/notify` 接收微信回调并原子入账，支付宝与微信的交易号互不复用。
- 重构：支付改为软件内弹窗（不再调系统浏览器）——支付宝改用预下单（`alipay.trade.precreate`）返回二维码、微信沿用 `weixin://` 二维码，下单成功后弹出自定义支付弹窗（订单号 / 金额 / 二维码 / 已完成支付按钮，3 秒轮询订单状态），样式与软件整体一致；`POST /api/shumiao/recharge` 新增 `qrCode` 返回字段。
- 调整：用户端消耗记录改为与管理后台一致——同一提交任务（`task_id`）聚合为一条流水（明细数合计、显示任务结束余额），无任务标识的历史记录仍按条展示。
- 配置：新增 `WXPAY_ENABLED`、`WXPAY_APP_ID`、`WXPAY_MCH_ID`、`WXPAY_SERIAL_NO`、`WXPAY_PRIVATE_KEY_PATH`、`WXPAY_API_V3_KEY`、`WXPAY_PUBLIC_KEY_PATH`、`WXPAY_PUBLIC_KEY_ID`、`WXPAY_NOTIFY_URL` 环境变量，说明见 `red-magic-api/README.md`；`.env.example` 已同步。
- 测试：新增消耗记录按任务聚合、支付宝预下单返回二维码断言；测试环境隔离本地 `.env` 的真实支付配置。
- 修复：安装包在复制文件前除等待 `magiorix.exe` 退出外，还会等待并兜底强制结束残留的辅助进程（`pgy-chart-renderer.exe`、`elevate.exe`），避免其句柄锁住安装目录文件导致“复制主程序失败”/“无法打开要写入的文件”。
- 本地资源包：`red-magic-api/public/assets/desktop/1.3.5/assets.zip`（SHA256：`585dba39e62cd7ee2a353bccd41cf7677678f4dc422e0945cbd0df9d6f434d8e`）。
- 本地安装包：`desktop-versions/windows/1.3.5/magiorix-desktop-1.3.5-windows.exe`（SHA256：`87D1B549CC20D88893E34D9562799F1D3844B5A36ABD583A30179650D0317316`）。
- 发布状态：当前仅为本地 Candidate；尚未修改 `latest.json`、未部署。

## 1.3.4 (Candidate)

- 修复：登录初始化不再因用户对象变化触发递归刷新，消除个人资料请求风暴（不再出现单次运行上万条失败请求）。
- 修复：个人资料请求超时/断网时只保留日志与登录态，不再清空 token 踢回登录页；仅确认的 401（服务端响应或主进程通知）才退出登录。
- 修复：服务端通过 `x-new-token` 续期时，新 token 同步写入 Zustand 内存并通知 Electron 主进程调度器，避免旧 token 持续 401。
- 修复：前端补丁的版本替换改为只匹配带引号的版本字符串，避免把 bundle 内 SVG 图标路径坐标一并改写。
- 本地安装包：`desktop-versions/windows/1.3.4/magiorix-desktop-1.3.4-windows.exe`（SHA256：`9644EAD686C6B0884BF0A32471123374FAF28DAE52941ACB0369D27D505EFA09`）。
- 本地资源包：`desktop-versions/windows/1.3.4/magiorix-desktop-1.3.4-assets.zip`（SHA256：`AB64326735431A0564F03708B48BA0EECCD2D565EFAE7340C2ABDDA1CAA2B434`）。
- 发布状态：已生成本地不可变版本 manifest（`public/releases/windows/1.3.4.json`）；尚未修改 `latest.json`、未部署。

## 1.3.3 (Candidate)

- 修复：支付宝支付改为单任务栏入口的模态子窗口，支付成功后自动关闭并回到主窗口；窗口仅允许支付服务与支付宝域名跳转。
- 修复：兼容旧版充值字段并修正充值/消耗记录的空值与语法错误，避免 `toLocaleString`、`toFixed` 和 `missing )` 崩溃。
- 调整：登录后默认最大化，侧栏在普通桌面宽度显示；近期笔记波动中位数恢复为独立列，位于合作 90 天之后。
- 调整：管理后台密码不再要求至少 16 位；已配置且不是公开占位值即可登录，未配置时不影响普通客户端服务。
- 修复：前端资源只允许向更高版本更新，服务器仍发布旧资源时不再覆盖新安装包的支付与找博主功能。
- 本地安装包：`desktop-versions/windows/1.3.3/magiorix-desktop-1.3.3-windows.exe`（SHA256：`3DAF2BD634032C66B13D27FDAFE552F40620BAB5853557DECE6BC31764CDA960`）。
- 发布状态：当前仅为本地 Candidate；尚未修改 `latest.json`、未部署。

## 1.3.2 (Candidate)

- 修复：找博主改为正式默认菜单；全新安装、卸载重装或清理本机数据后仍会显示在左侧栏，不再依赖本机开发开关。
- 发布状态：当前仅为本地 Candidate；未修改 `latest.json`、未部署、未发送真实短信或真实支付请求。

## 1.3.1 (Candidate)

- 修复：Windows 安装包会跟随 worktree 中的依赖目录链接，确保桌面主进程所需的 `unzipper` 及其依赖写入 `app.asar`，不再因缺少该包启动失败。
- 校验：构建和发布 smoke 均会检查 `app.asar` 内存在 `unzipper` 的运行文件。
- 发布状态：当前仅为本地 Candidate；未修改 `latest.json`、未部署、未发送真实短信或真实支付请求。

## 1.3.0 (Candidate)

- 新增：蒲公英「找博主」工作台，支持官网对齐的多维筛选、地区/笔记类目级联、展示列与采集字段选择、单次完整采集、断点续跑、批量导出及近期笔记互动波动图。
- 体验：采集发现与博主详情并行处理，任务中断后可恢复；结果完整前禁止导出不完整 Excel。
- 账户：确认支持短信关闭时使用手机号和密码注册，注册成功仍赠送 100 积分；短信仅用于找回密码。
- 图表：合并粉丝地域、年龄和性别年龄分布等主线图表优化。
- 发布状态：当前仅为本地 Candidate；未修改 latest.json、未部署、未发送真实短信或真实支付请求。

## 1.2.0 (Candidate)

- 新增：短信注册、密码重置与手机号密码登录，验证码按手机号/IP 限流，验证码只保存 HMAC 摘要并支持失败锁定、过期和一次性消费。
- 新增：SQLite 事务迁移，保留历史用户、账户、消耗流水和订单，并固定四档积分套餐：10/100/500/1000 元。
- 新增：支付宝电脑网站支付、异步通知、主动查询和定时对账；订单金额、商户、应用和平台交易号全部校验，到账与余额更新共用幂等事务结算。
- 前端：充值页只保留积分、支付宝和“立即充值”流程；左侧积分中心仅保留积分充值、充值记录、消耗记录，移除充值页中的微信、佣金、邀请返利和活动入口。
- 安全：支付页增加 no-store、no-referrer 和基础 CSP；桌面端支付外链只允许 HTTPS 配置域名，拒绝 `file:`、IP、HTTP、自定义协议和渲染进程 `window.open` 绕过；主窗口导航仅允许当前 `index.html` 或开发服务器自身 origin。
- 本地产物：`desktop-versions/windows/1.2.0/magiorix-desktop-1.2.0-windows.exe` 与 `magiorix-desktop-1.2.0-assets.zip`；具体大小和 SHA256 以同目录 `release-info.json` 与 `.sha256.txt` 为准。
- Candidate 校验：每次本地重建都会重新计算安装包和资源包大小/SHA256，最终值以同目录 `release-info.json` 与 `.sha256.txt` 为准；本轮不 Promote。
- 发布状态：当前仅为本地 Candidate，真实支付宝/短信开关默认关闭，未修改 `latest.json`、未部署、未发送真实短信或真实支付请求。

## 1.1.13 (Candidate)

- 优化：博主数据概览图对齐蒲公英网页更多细节——昵称完整显示并支持 emoji（Twemoji 图片内嵌，弱网降级字体）、头像内嵌为 base64 离线渲染、性别小人图标、健康等级盾牌直接内嵌蒲公英官方图标（健康=绿盾对勾、非健康=橙盾叹号，与网页像素级一致，按 currentLevel 判定 2 为健康）、个人简介行、内容标签扩展到 6 个并按文字宽度自适应。
- 取数：内容类目合并 contentTags 与 featureTags，personalTags 作为简介展示；数据更新时间取接口真实 dateKey（不再使用本机当天日期）。
- 渲染：Python 渲染器与 JS 兜底同步全部上述特性，双端一致。
- 构建：桌面端、前端资源与后端包版本统一升级为 `1.1.13`；不改动支付、短信、登录、积分与采集逻辑。1.1.9/1.1.10 为支付短信分支保留版本号，本分支不使用。

## 1.1.12 (Candidate)

- 修复：博主数据概览图此前多处字段显示为 `-`（数据更新时间、博主优势、发布笔记数、内容类目、合作行业、三个中位数“优于 xx% 同行”、近 7 天活跃天数、活跃/好联系标签、粉丝量变化幅度“优于 xx% 同行”），根因是取数字段名与真实接口不符且未抓取网页数据源。
- 采集：新增抓取网页“数据概览”卡片同源接口 `GET /api/pgy/kol/data/data_summary?userId=x&business=0`（命名 overviewSummary），仅用于概览图，接口无数据时容错跳过，不影响其他字段与采集主流程。
- 取数：`pgyBuildBloggerOverviewData` 改按真实字段映射（kolAdvantage/noteNumber/noteType/tradeNames/mAccumImpNum 等及对应 Compare、activeDayInLast7/isActive/responseRate/easyConnect、fans30GrowthRate/BeyondRate），并对齐网页展示。
- 渲染：概览图机构为空时兜底“无机构”，昵称旁改为性别图标与健康等级图标（健康=绿盾对勾 #02B940、异常=橙盾叹号 #FF7D03，按 currentLevel 判定：0 为异常，其余为健康），新增常驻地行，内容标签合并类目与特色标签并扩展到 5 个自适应宽度，活跃/好联系标签按布尔值绘制；Python 渲染器与 JS 兜底同步。
- 构建：桌面端、前端资源与后端包版本统一升级为 `1.1.12`；不改动支付、短信、登录、积分与采集逻辑。1.1.9/1.1.10 为支付短信分支保留版本号，本分支不使用。

## 1.1.11 (Candidate)

- 修复：采集助手“历史记录 → 导出已成功内容”此前丢失 `mode/headers` 参数，导出为原始英文字段单行表头；现命中规范 Schema（pgy/blogger、pgy/notebook、starmap、douyin）时按中文两行分组表头导出，与任务面板正常导出一致。
- 修复：历史导出恢复图表图片嵌入（粉丝五图、日常笔记表现图、博主数据概览图），单元格不再显示本地图片路径；图片文件已被清理时对应单元格导出为空。
- 导出：历史导出表头优先按任务保存的 `fields` 过滤，再按成功行实际字段过滤；无 `fields` 的旧任务按实际字段导出；未命中规范 Schema 的 legacy 迁移任务保持单行兼容导出。
- 测试：新增 `tests/unit/collection-history-export.test.mjs` 真实 xlsx 回归（中文表头、字段顺序、字段过滤、图片嵌入解包校验、缺图置空、legacy 回退），并纳入验证策略 unit 车道。
- 构建：桌面端、前端资源与后端包版本统一升级为 `1.1.11`；不改动支付、短信、登录、积分与采集逻辑。1.1.9/1.1.10 为支付短信分支保留版本号，本分支不使用。

## 1.1.8 (Candidate)

- 新增：蒲公英博主采集增加“日常笔记表现图（图文）”和“日常笔记表现图（视频）”，原图明确命名为“日常笔记表现图（图文+视频）”。
- 导出：三类日常笔记表现图按“图文+视频 → 图文 → 视频”顺序排列，之后继续输出博主数据概览图等原有字段。
- 优化：蒲公英博主字段选择仅保留昵称为必选项，主页链接、蒲公英链接、小红书号及其他字段均可按需取消。
- 构建：桌面端、前端资源与后端包版本统一升级为 `1.1.8`。

## 1.1.7 (Candidate)

- 新增：蒲公英博主采集可选“博主数据概览图”，通过结构化接口数据绘制博主资料、合作报价、笔记数据、服务表现和成长表现，不依赖浏览器截图。
- 口径：保留曝光、阅读、互动中位数及同行百分位，近 7 天活跃天数、邀约 48 小时回复率、粉丝量变化幅度，以及蒲公英网页对应的数字、百分比、`w` 和人民币格式。
- 导出：新图片列紧跟“日常笔记表现图”，默认不勾选；缺失值显示 `-`，模块不隐藏。
- 布局：图片使用 `2048×1066` 固定画布，在合作报价和成长表现卡片结束后收尾，不包含页面底部额外的“笔记数据”区块。
- 构建：桌面端、前端资源与后端包版本统一升级为 `1.1.7`。

## 1.1.6 (Candidate)

- 新增：采集任务写入主进程本地任务库，结果以 JSONL 追加保存，应用异常退出后可恢复为中断任务。
- 新增：中断与授权失效任务支持导出已成功内容，并在重新授权后继续未完成的原始条目。
- 修复：采集成功结果先持久化再按 `taskId + itemIndex` 幂等扣费，崩溃恢复不会重复收费或丢失已采集内容。
- 优化：授权失效后立即停止任务；采集日志按任务、错误类型和连续索引范围聚合；历史明细保留 90 天。
- 优化：管理后台消耗流水默认按任务汇总，旧版逐条流水可通过筛选查看，不再渲染数千条重复详情。
- 新增：管理后台可为正常用户重置密码，保存后撤销该用户全部登录 token，并记录不含密码的管理员审计日志。
- 兼容：首次启动会将 `magiorix.opsAssistant.v2` 现有历史一次性导入主进程任务库，原 localStorage 不删除。
- 构建：桌面端、前端资源与后端版本统一升级为 `1.1.6`。

## 1.1.5 (Unreleased)

- 优化：日常笔记表现图改为蒲公英网页同构布局，通过结构化数据绘制页面标题、筛选器、摘要条和核心指标卡片，不依赖浏览器截图。
- 修复：Windows 打包时从最新 Python 源码重建并验证蒲公英绘图程序，勾选“日常笔记表现图”后可正常生成并嵌入 Excel。
- 新增：蒲公英博主采集可选“日常笔记表现图”，按“日常笔记 / 图文+视频 / 近30日 / 仅自然流量”口径汇总发布笔记、内容类目及占比、曝光中位数和阅读中位数。
- 导出：新图片列排在五张粉丝图表之后；缺失项统一显示 `-`，且该字段默认不勾选。
- 修复：Windows 安装器在提升前端暂存资源前先退出暂存目录，避免目录被安装进程自身占用导致 1.1.5 安装中断。

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
