# 01 — 导出精细的省份/城市地域图

**What it delivers:** 用户选择粉丝省份图或城市图后，可得到带中国地图、色阶、摘要、切换状态和排名的完整 `784×464` PNG。

**Blocked by:** None — ready now

**Acceptance criteria:**

- [ ] 省份和城市任务都传入两组地域数据及当前激活模式，不再只传一组通用柱状数据。
- [ ] Python 主渲染与 SVG/运行时回退均支持 `region-distribution`，使用真实省级 GeoJSON、五档颜色、七项排名和数据驱动摘要。
- [ ] 省份/城市输出尺寸均为 `784×464`、内容不同；城市“其他”规则和百分比条仍保留。
- [ ] 地域专项测试与运行时补丁幂等测试通过；当前非地域图测试无新增失败。

**Execution context:**

- 完整阅读 `spec.md` 的 Decisions/Test Seam 和 `handoff.md`。
- 参考来源：`tools/pgy_chart_renderer.py` 的地域函数与 dispatch、`scripts/apply-magiorix-runtime-patches.js` 的地域任务/回退、`tests/integration/pgy-daily-note-chart.test.js` 的地域用例、`tools/china-provinces.geojson`。
- 目标所有权：当前项目对应四处作图代码/测试以及新增 GeoJSON；仅摘取地域相关段落。
- 禁止覆盖整个渲染器或运行时补丁脚本；禁止修改版本和发布文件。
- 所有 shell 命令通过 `rtk`；开始和结束都记录 `rtk git status --short`。

**Evidence to return:** 修改文件列表、两个 PNG 的尺寸与哈希、专项测试实际输出、未解决差异和回滚方法（恢复本 Ticket 的最小 diff）。
