# 03 — 导出真实且精细的近 30 日粉丝趋势

**What it delivers:** 用户导出的粉丝趋势图使用最近 30 个真实日值，波形、坐标和静态布局贴近蒲公英参考图。

**Blocked by:** 02 — 导出年龄、性别和组合分布图

**Acceptance criteria:**

- [ ] 输入列表按日期规范化、去重、升序并保留最近 30 日；逆序、重复和超长输入产生稳定结果。
- [ ] 曲线平滑但穿过全部有效日值，不抽样，不显示圆形 marker；数据不足时按现有失败/降级约定处理。
- [ ] 纵轴自动选择合适的 1/2/3/5/10 倍步长并输出两位 `w` 刻度；横轴固定五个 `MM/DD` 标签。
- [ ] 画布、标题、“粉丝总量/粉丝增量”和“近30日”布局与参考约定一致；静态导出不包含 hover tooltip/竖线。
- [ ] Python 主渲染、独立趋势 SVG 回退和 runtime patch 行为一致；趋势的逆序/重复/30日回归测试通过。

**Execution context:**

- 参考来源：`tools/pgy_chart_renderer.py` 趋势逻辑、`tools/pgy_trend_svg.js`、runtime patch 和趋势集成用例；真实响应视觉证据在 `design-qa-artifacts/fans-trend-real-response/`。
- 将 `pgy_trend_svg.js` 作为新增独立源文件接入当前构建/patch 流程，但不得移除当前 SVG 能力。
- 不改变采集接口，只处理收到的列表；不把参考响应硬编码到产品代码。

**Evidence to return:** 正常、逆序、重复、超过30条四类输入的测试输出；最终 PNG 尺寸/哈希；主渲染与回退一致性证据；回滚方法。
