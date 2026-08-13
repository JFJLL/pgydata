# Research Handoff

## Baseline

- 目标项目：`D:\download\pic-vec\pgydata`
- 参考包：`D:\download\magiorix-source-1.1.13-team-20260812-final`
- 研究日期：2026-08-13
- 目标项目：`master`，相对 `origin/master` ahead 2；`app-source/package.json` 为 `1.2.0`。
- 参考包：完整的 `1.1.13` 源码交付目录，无 `.git`，不能做可靠的 Git 三方合并。
- 安全边界：不读取/复制 cookie、token、`.env`、生产数据或日志；不更改发布 manifest。

## Verified Facts

| 结论 | 证据/来源 | 对实现的影响 | 何时必须复核 |
|---|---|---|---|
| 参考包的用户目标明确是五类图表精修 | `PROJECT.md`、`TEAM_HANDOFF.md`、`design-qa.md` | 只迁移作图能力，不携带版本和发布状态 | 参考包路径变化时 |
| 当前项目缺少地域图、年龄专用图、组合图和概览原始图标的关键标识 | 对两目录的 `rg` 与 SHA-256 文件比较 | 这些不是已完整合入的重复代码 | 开始编辑前对当前 HEAD/工作区再查一次 |
| 参考主渲染器 1143 行，当前为 695 行；不能整文件覆盖 | 文件行数与哈希比较 | 按图表类型提取函数、常量和 dispatch 分支 | 当前文件被其他会话修改后 |
| 参考包新增 `china-provinces.geojson`、14 个 `overview-icons` 资源和 `pgy_trend_svg.js` | 文件清单比较 | 这些资源可按原文件复制，但目标引用路径需按当前项目适配 | 目标项目已有同名资源时校验哈希和调用方 |
| 运行时补丁脚本双方都约 3000 行且内容不同 | 哈希和行数比较 | 只能编辑当前脚本中的对应生成模板/接线段，禁止替换整脚本 | 每次开始 Ticket 前 |
| 前端补丁脚本双方不同，参考逻辑针对 `1.1.13` bundle | 文件比较与参考脚本中的 `fansGenderAgeChart` 补丁 | 必须定位当前 `1.2.0` 活跃资源和现有补丁锚点，不复制旧 bundle | 活跃 assets 版本或 bundle 名变化时 |
| 参考包记录图表集成测试 14/14、历史/运行契约 22/22、静态检查通过 | `TEAM_HANDOFF.md` | 可复用测试场景和断言，但这些是来源方声明，目标项目必须独立重跑 | 迁移完成后必须复核 |
| 参考视觉证据覆盖地域、性别年龄、组合、趋势和概览 | `design-qa-artifacts/`；已只读检查主要对比图 | 可用作视觉验收基准；趋势静态图有意不含 hover | 代码输出与证据差异时 |
| 当前工作区已有用户改动 | `git status --short --branch` | 所有编辑前后都要保存状态/差异清单，不能回退无关改动 | 每个 Ticket 开始与结束 |
| 当前工作区中验证脚本和策略显示为删除 | `git status` 中 `D scripts/verify-change.ps1`、`D verification-policy.json` | 视为用户拥有的现状，不擅自恢复；若最终仍不可运行，不能声称 verification receipt 完成 | 最终集成验证前 |

## Decisions Already Made

- 当前项目 `1.2.0` 是唯一基线；参考包不是待合并分支。
- 资源文件可以逐个引入；代码文件必须手工摘取作图相关段落。
- 当前未提交改动全部视为用户所有，禁止 reset、checkout、clean 或覆盖。
- 不执行构建安装包、发布、部署、提交和推送。

## Known Dead Ends

- 整体复制参考目录：会把当前 `1.2.0` 和用户改动回退到 `1.1.13`。
- 整份覆盖 `pgy_chart_renderer.py` 或两个 patch 脚本：会丢失当前项目在同文件中的新能力。
- 复制 `assets/1.1.13` 作为当前前端：会把旧 bundle 带回当前版本。
- 直接相信参考包的“测试通过”：它只证明来源目录曾验证，不证明迁入当前工作区后仍正确。
- 为了跑验证而擅自恢复当前已删除的 verification 文件：这会覆盖用户现状；必须保留或报告阻塞。

## Targeted Revalidation

1. 每个 Ticket 开始前，用 `rtk git status --short` 和 `rtk git diff -- <owned-files>` 确认用户改动边界，预算 1 分钟。
2. 用 `rtk rg` 在当前文件确认目标标识是否已被其他会话加入，预算 1 分钟；已有则比较行为，不重复插入。
3. 最终确认当前活跃 `assetsVersion` 和 bundle，再决定组合字段前端补丁锚点，禁止假设为 `1.1.13`。
4. 若验证入口仍被删除，运行所有仍可用的专项测试并明确报告 verification contract 阻塞；不要伪造 receipt。

## Update Rule

发现当前工作区已变化时，在本文件末尾追加日期、命令、冲突文件及影响；不要覆盖上述旧结论。
