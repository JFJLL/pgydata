# 05 — 集成并验证全部作图精修

**What it delivers:** 当前 `1.2.0` 项目在不合并版本的前提下完整拥有四类作图精修，且具备可复查的测试证据。

**Blocked by:** 04 — 导出使用原始图标和正确风险状态的博主概览

**Acceptance criteria:**

- [ ] 检查冻结 diff，只包含作图源码、必要资源、接线、测试和任务文档；没有版本、发布、部署或无关业务修改。
- [ ] 所有图表专项、历史/XLSX、静态、unit、integration、build/smoke 测试按项目当前可用入口通过。
- [ ] 运行时补丁连续执行两次仍幂等；源渲染器与部署/回退产物的关键输出一致。
- [ ] 依据参考包 `design-qa-artifacts` 检查地域、人口组合、趋势和概览的用户可见结果，无 P0/P1/P2 差异。
- [ ] 按当前 `verification-policy.json` 执行 verification contract，并取得与当前 diff 匹配的 pass receipt；若验证文件仍处于用户删除状态，停止宣称完成并明确报告唯一阻塞，不恢复或伪造文件。
- [ ] 使用 fresh context 只读审查冻结 diff 与本 Spec/Tickets；发现问题后由实现会话修复，再换新的 fresh reviewer 复审。

**Execution context:**

- 先完整阅读前四张 Ticket 返回的证据和剩余风险。
- 发版不在范围内，因此不要读取/执行发布流程、不要构建 NSIS、不要生成/修改 manifest。
- 执行项目现有测试命令前先 `-PlanOnly`（若入口可用），避免意外触发发布或外部状态变化。
- fresh reviewer 禁止修改文件，只返回可复现问题、优先级和证据。

**Evidence to return:** 冻结 diff 文件表、每条验证命令及退出码、视觉验收结论、receipt 检查结果、fresh review 结论、仍需用户处理的唯一事项、整体回滚方式。
