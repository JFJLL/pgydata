# 启动 Goal

在 `D:\download\pic-vec\pgydata` 中，将 `D:\download\magiorix-source-1.1.13-team-20260812-final` 的作图精修能力手工迁移到当前项目，但绝对不要进行版本合并或整体覆盖。

开始前完整阅读：

1. `outputs/magiorix-chart-refinement-migration/spec.md`
2. `outputs/magiorix-chart-refinement-migration/handoff.md`
3. 当前 frontier：`outputs/magiorix-chart-refinement-migration/tickets/01-region-distribution.md`

执行规则：

- 经理包只读；当前 `1.2.0` 工作区是唯一基线。
- 严格按 Ticket 01 → 02 → 03 → 04 → 05 顺序执行。每张 Ticket 完成专项验证并返回证据后，才读取下一张。
- 每次编辑前检查当前 `git status` 和 owned files 的 diff；所有现有改动视为用户所有。不得 reset、checkout、clean、整文件覆盖或恢复用户已删除文件。
- 所有 shell 命令通过 `rtk`。修改使用最小补丁；资源只按明确清单逐个引入。
- 不改版本号，不复制 `assets/1.1.13` 整包，不修改发布 manifest，不打安装包，不部署，不提交或推送。
- 若用户改动与迁移命中同一区域且无法无损保留，立即停止该区域并报告文件、冲突内容和推荐解决方式，不猜测覆盖。
- 最终必须完成 Ticket 05 的项目验证和 fresh-context 只读审查；验证基础设施仍被用户删除时，明确标记阻塞，不伪造完成。

成功标准：当前项目的普通导出、历史导出和 Excel 嵌图能够生成精修后的地域、年龄/性别/组合、近30日趋势和博主概览图片，当前非作图行为不回退，并有实际测试、视觉和独立审查证据。
