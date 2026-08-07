// 蒲公英“找博主”展示指标列注册表（Phase 5 工作包）。
//
// 职责：
// - 复刻官网「自定义列」弹窗的完整指标集（42 项官网列），顺序 = 官网弹窗顺序
//   （artifacts/verification/pgy-official-layout-audit/display-metrics-dom.json 的 n 顺序），
//   另加 8 项博主信息独立列（Phase 4 导出口径），共 50 项。
// - 每项登记 14 个元数据字段：
//   id / label / group / responsePath / type / formatter / unit / nullable /
//   defaultDisplay / defaultExport / fixed / mutuallyExclusiveGroup / evidence / note。
// - evidence 语义：
//   * real-v2-field   —— 2026-08-06 真实 /v2 响应字段（pgy-kol-phase5-real-v2-fields.json）；
//   * candidate       —— 真实响应存在该字段，但语义为按字段名/DOM 标签推断（note 必须说明依据）；
//   * unavailable     —— 官网当前未返回对应字段（note="官网当前未返回"），可展示不可导出；
//   * dom-evidence    —— 官网 DOM 证据（固定/复合列），无独立数据字段。
// - 导出约束：fixed 列、responsePath 为 null / "computed:..." 的列、unavailable 列不可导出，
//   getPgyKolExportHeaders 一律拒绝；candidate 列可展示可导出。

// 默认展示 8 项（与官网当前账号默认一致，顺序即官网默认顺序）。
const DEFAULT_DISPLAY_IDS = Object.freeze([
  "kolInfo",
  "recentNotes",
  "actions",
  "price",
  "fansNum",
  "readMidNor30",
  "interMidNor30",
  "fansActiveIn28dLv",
]);

// 默认导出 10 项（保持 Phase 4 口径）。
const DEFAULT_EXPORT_IDS = Object.freeze([
  "userId",
  "nickname",
  "fansNum",
  "location",
  "gender",
  "readMidNor30",
  "interMidNor30",
  "picturePrice",
  "videoPrice",
  "fansActiveIn28dLv",
]);

// 官网 42 项列（顺序 = display-metrics-dom.json 的 n 顺序）+ 8 项博主信息独立列。
// responsePath 省略时与 id 相同；显式 null 表示官网当前未返回/无独立数据字段。
const COLUMN_DEFS = [
  // ---- 固定列（fixed=true，不可删除、不可导出）----
  { id: "kolInfo", label: "博主信息", group: "固定列", responsePath: null, type: "string", formatter: "plain", unit: "", fixed: true, mutuallyExclusiveGroup: null, evidence: "dom-evidence", note: "官网固定列（博主信息复合列：头像/昵称/小红书号/地域等），无独立响应字段" },
  { id: "recentNotes", label: "近期笔记", group: "固定列", responsePath: null, type: "string", formatter: "plain", unit: "", fixed: true, mutuallyExclusiveGroup: null, evidence: "dom-evidence", note: "官网固定列（近期笔记缩略图），无独立响应字段" },
  { id: "actions", label: "操作", group: "固定列", responsePath: null, type: "string", formatter: "plain", unit: "", fixed: true, mutuallyExclusiveGroup: null, evidence: "dom-evidence", note: "官网固定列（操作按钮），无独立响应字段" },
  // ---- 博主报价（mutuallyExclusiveGroup="quote"，三选一）----
  { id: "price", label: "全部报价", group: "博主报价", responsePath: "computed:picturePrice+videoPrice", type: "string", formatter: "price-range", unit: "元", fixed: false, mutuallyExclusiveGroup: "quote", evidence: "dom-evidence", note: "官网报价三选一复合列（computed:picturePrice+videoPrice），仅展示不可导出" },
  { id: "picturePrice", label: "图文报价", group: "博主报价", responsePath: "picturePrice", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: "quote", evidence: "real-v2-field", note: "" },
  { id: "videoPrice", label: "视频报价", group: "博主报价", responsePath: "videoPrice", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: "quote", evidence: "real-v2-field", note: "" },
  // ---- 账号数据 ----
  { id: "fansNum", label: "粉丝数", group: "账号数据", responsePath: "fansNum", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "fansRiseNum", label: "粉丝量变化幅度", group: "账号数据", responsePath: "fansRiseNum", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "candidate", note: "真实 v2 字段 fansRiseNum 存在；按字段名推断为粉丝量变化幅度（未与官网样本值逐一核验口径）" },
  { id: "fansActiveIn28dLv", label: "活跃粉丝占比", group: "账号数据", responsePath: "fansActiveIn28dLv", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "真实值为数值百分比（如 40.6），非等级字符串" },
  { id: "interactionRate30", label: "互动粉丝占比", group: "账号数据", responsePath: "interactionRate30", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "candidate", note: "字段在白名单内，但本次真实捕获（2026-08-06）未证实其出现在响应中；按字段名与官网 DOM 标签“互动粉丝占比”推断语义，待定点核验" },
  // ---- 直播数据 ----
  { id: "kliveCnt30d", label: "近30天直播场次", group: "直播数据", responsePath: "kliveCnt30d", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "avgLiveViewerNum", label: "场均观播人数", group: "直播数据", responsePath: "avgLiveViewerNum", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "avgAgmv90d", label: "场均销售额", group: "直播数据", responsePath: "avgAgmv90d", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: null, evidence: "candidate", note: "真实 v2 字段 avgAgmv90d 存在；按名称（90 天场均 GMV）推断为场均销售额" },
  // ---- 日常笔记数据-全部 ----
  { id: "accumCommonImpMedinNum30d", label: "曝光中位数（日常）", group: "日常笔记数据", responsePath: "accumCommonImpMedinNum30d", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "readMidNor30", label: "阅读中位数（日常）", group: "日常笔记数据", responsePath: "readMidNor30", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "interMidNor30", label: "互动中位数（日常）", group: "日常笔记数据", responsePath: "interMidNor30", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "thousandLikePercent30", label: "千赞笔记比例", group: "日常笔记数据", responsePath: "thousandLikePercent30", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "hundredLikePercent30", label: "百赞笔记比例", group: "日常笔记数据", responsePath: "hundredLikePercent30", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  // ---- 日常-图文 ----
  { id: "accumPicCommonImpMedinNum30d", label: "图文曝光中位数（日常）", group: "日常笔记数据-图文", responsePath: "accumPicCommonImpMedinNum30d", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "pictureClickMidNum", label: "图文阅读中位数（日常）", group: "日常笔记数据-图文", responsePath: "pictureClickMidNum", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "candidate", note: "真实 v2 字段 pictureClickMidNum 存在；按字段名推断为图文阅读中位数（日常）" },
  { id: "pictureInterMidNum", label: "图文互动中位数（日常）", group: "日常笔记数据-图文", responsePath: "pictureInterMidNum", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "pictureThousandLikePercent30", label: "图文千赞笔记比例", group: "日常笔记数据-图文", responsePath: "pictureThousandLikePercent30", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "pictureHundredLikePercent30", label: "图文百赞笔记比例", group: "日常笔记数据-图文", responsePath: "pictureHundredLikePercent30", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  // ---- 日常-视频 ----
  { id: "accumVideoCommonImpMedinNum30d", label: "视频曝光中位数（日常）", group: "日常笔记数据-视频", responsePath: "accumVideoCommonImpMedinNum30d", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "videoClickMidNum", label: "视频阅读中位数（日常）", group: "日常笔记数据-视频", responsePath: "videoClickMidNum", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "candidate", note: "真实 v2 字段 videoClickMidNum 存在；按字段名推断为视频阅读中位数（日常）" },
  { id: "videoInterMidNum", label: "视频互动中位数（日常）", group: "日常笔记数据-视频", responsePath: "videoInterMidNum", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "videoThousandLikePercent30", label: "视频千赞笔记比例", group: "日常笔记数据-视频", responsePath: "videoThousandLikePercent30", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "videoHundredLikePercent30", label: "视频百赞笔记比例", group: "日常笔记数据-视频", responsePath: "videoHundredLikePercent30", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "videoFinishRate", label: "视频完播率", group: "日常笔记数据-视频", responsePath: "videoFinishRate", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  // ---- 合作笔记数据-全部 ----
  { id: "accumCoopImpMedinNum30d", label: "曝光中位数（合作）", group: "合作笔记数据", responsePath: "accumCoopImpMedinNum30d", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "readMidCoop30", label: "阅读中位数（合作）", group: "合作笔记数据", responsePath: "readMidCoop30", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "interMidCoop30", label: "互动中位数（合作）", group: "合作笔记数据", responsePath: "interMidCoop30", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "overflowNum", label: "外溢进店中位数", group: "合作笔记数据", responsePath: "overflowNum", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "candidate", note: "真实 v2 字段 overflowNum 存在；按字段名推断为外溢进店中位数（合作）" },
  { id: "overflowCost", label: "外溢进店单价", group: "合作笔记数据", responsePath: null, type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: null, evidence: "unavailable", note: "官网当前未返回" },
  // ---- 合作-图文 ----
  { id: "estimatePictureCpm", label: "图文预估CPM价格", group: "合作笔记数据-图文", responsePath: "estimatePictureCpm", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "pictureReadCost", label: "图文预估阅读单价", group: "合作笔记数据-图文", responsePath: "pictureReadCost", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "pictureCpcPerPrice", label: "图文预估互动单价", group: "合作笔记数据-图文", responsePath: "pictureCpcPerPrice", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: null, evidence: "candidate", note: "真实 v2 字段 pictureCpcPerPrice 存在；按名称（CPC 单价）推断为图文预估互动单价" },
  // ---- 合作-视频 ----
  { id: "estimateVideoCpm", label: "视频预估CPM价格", group: "合作笔记数据-视频", responsePath: "estimateVideoCpm", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "videoReadCost", label: "视频预估阅读单价", group: "合作笔记数据-视频", responsePath: "videoReadCost", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  { id: "videoCpcPerPrice", label: "视频预估互动单价", group: "合作笔记数据-视频", responsePath: "videoCpcPerPrice", type: "money", formatter: "money", unit: "元", fixed: false, mutuallyExclusiveGroup: null, evidence: "candidate", note: "真实 v2 字段 videoCpcPerPrice 存在；按名称（CPC 单价）推断为视频预估互动单价" },
  // ---- 其他指标 ----
  { id: "coopCredit", label: "合作信用度", group: "其他指标", responsePath: null, type: "string", formatter: "plain", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "unavailable", note: "官网当前未返回" },
  { id: "inviteReply48hNumRatio", label: "邀约48h回复率", group: "其他指标", responsePath: "inviteReply48hNumRatio", type: "percent", formatter: "percent", unit: "%", fixed: false, mutuallyExclusiveGroup: null, evidence: "real-v2-field", note: "" },
  // ---- 博主信息独立列（Phase 4 导出口径；默认不展示，避免与 kolInfo 复合列重复）----
  { id: "userId", label: "博主UID", group: "博主信息", responsePath: "userId", type: "string", formatter: "plain", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "export-schema", note: "" },
  { id: "nickname", label: "昵称", group: "博主信息", responsePath: "nickname", type: "string", formatter: "plain", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "ui-card", note: "" },
  { id: "redId", label: "小红书号", group: "博主信息", responsePath: "redId", type: "string", formatter: "plain", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "export-schema", note: "" },
  { id: "location", label: "地域", group: "博主信息", responsePath: "location", type: "string", formatter: "plain", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "ui-card", note: "" },
  { id: "gender", label: "性别", group: "博主信息", responsePath: "gender", type: "string", formatter: "plain", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "ui-card", note: "" },
  { id: "avatar", label: "头像", group: "博主信息", responsePath: "avatar", type: "url", formatter: "url", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "known-list", note: "" },
  { id: "currentLevel", label: "健康等级", group: "博主信息", responsePath: "currentLevel", type: "string", formatter: "plain", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "export-schema", note: "" },
  { id: "fansCount", label: "粉丝数（官方导出口径）", group: "博主信息", responsePath: "fansCount", type: "number", formatter: "number", unit: "", fixed: false, mutuallyExclusiveGroup: null, evidence: "export-schema", note: "" },
];

const REQUIRED_FIELDS = Object.freeze([
  "id",
  "label",
  "group",
  "responsePath",
  "type",
  "formatter",
  "unit",
  "nullable",
  "defaultDisplay",
  "defaultExport",
  "fixed",
  "mutuallyExclusiveGroup",
  "evidence",
  "note",
]);

function buildColumn(def) {
  return Object.freeze({
    id: def.id,
    label: def.label,
    group: def.group,
    responsePath: def.responsePath,
    type: def.type,
    formatter: def.formatter,
    unit: def.unit,
    nullable: def.nullable !== false,
    defaultDisplay: DEFAULT_DISPLAY_IDS.includes(def.id),
    defaultExport: DEFAULT_EXPORT_IDS.includes(def.id),
    fixed: def.fixed === true,
    mutuallyExclusiveGroup: def.mutuallyExclusiveGroup ?? null,
    evidence: def.evidence,
    note: def.note,
  });
}

// 50 项 = 42 项官网列 + 8 项博主信息独立列；整体与单项均冻结。
export const PGY_KOL_COLUMN_REGISTRY = Object.freeze(COLUMN_DEFS.map(buildColumn));

const REGISTRY_BY_ID = new Map(PGY_KOL_COLUMN_REGISTRY.map((column) => [column.id, column]));

/**
 * 按 id 查列；不存在返回 undefined。
 */
export function getPgyKolColumn(id) {
  return REGISTRY_BY_ID.get(id);
}

/**
 * 可展示列：有真实数据源（responsePath 非 null 且非 computed，evidence 非 unavailable）。
 * 即用户可以添加并看到真实数据的列；fixed/computed/unavailable 列不在其中。
 */
export function listPgyKolDisplayableColumns() {
  return PGY_KOL_COLUMN_REGISTRY.filter(
    (column) =>
      column.responsePath !== null &&
      typeof column.responsePath === "string" &&
      !column.responsePath.startsWith("computed:") &&
      column.evidence !== "unavailable",
  );
}

/**
 * 兼容别名（Phase 4 的 confirmed 概念）：与可展示列等价。
 * 保持导出，供 IPC 批量任务列校验与既有消费方使用。
 */
export function listPgyKolConfirmedColumns() {
  return listPgyKolDisplayableColumns();
}

/**
 * 默认展示列（8 项，与官网当前账号默认一致；顺序即官网默认顺序）。
 */
export function getPgyKolDefaultDisplayColumns() {
  return DEFAULT_DISPLAY_IDS.map((id) => REGISTRY_BY_ID.get(id));
}

/**
 * 默认展示列别名（保留 Phase 4 名称）。
 */
export function getPgyKolDefaultColumns() {
  return getPgyKolDefaultDisplayColumns();
}

/**
 * 默认导出列（10 项，保持 Phase 4 口径；顺序即默认导出顺序）。
 */
export function getPgyKolDefaultExportColumns() {
  return DEFAULT_EXPORT_IDS.map((id) => REGISTRY_BY_ID.get(id));
}

function isExportable(column) {
  if (column.fixed) return false;
  if (column.responsePath === null || typeof column.responsePath !== "string") return false;
  if (column.responsePath.startsWith("computed:")) return false;
  if (column.evidence === "unavailable") return false;
  return true;
}

/**
 * 按用户选择顺序构建两行表头 [{group,label,key}]，key=column.id。
 * 未知 id、fixed 列、responsePath 为 null / computed 的列、unavailable 列一律抛错
 * （消息含“未知列/未知字段/不可导出”）。
 */
export function getPgyKolExportHeaders(columnIds) {
  const ids = Array.isArray(columnIds) ? columnIds : [];
  const headers = [];
  for (const id of ids) {
    const column = REGISTRY_BY_ID.get(id);
    if (!column) {
      throw new Error(`未知列/未知字段: ${String(id)}`);
    }
    if (!isExportable(column)) {
      if (column.fixed) {
        throw new Error(`不可导出列: ${String(id)}（固定列，不可导出）`);
      }
      if (column.responsePath === null || typeof column.responsePath !== "string") {
        throw new Error(`不可导出列: ${String(id)}（官网当前未返回，不可导出）`);
      }
      if (column.responsePath.startsWith("computed:")) {
        throw new Error(`不可导出列: ${String(id)}（复合计算列，仅展示不可导出）`);
      }
      throw new Error(`不可导出列: ${String(id)}（官网当前未返回，不可导出）`);
    }
    headers.push({ group: column.group, label: column.label, key: column.id });
  }
  return headers;
}

function formatPercent(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    // 与前端表格共用同一规则（fresh reviewer M5）：|v|<=1 视为比率（如 0.62 → "62.0%"），
    // 否则视为已是百分数（如 40.6 → "40.6%"）。
    return `${(Math.abs(value) <= 1 ? value * 100 : value).toFixed(1)}%`;
  }
  const text = String(value).trim();
  if (text === "") return null;
  if (text.endsWith("%")) return text;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return `${(Math.abs(numeric) <= 1 ? numeric * 100 : numeric).toFixed(1)}%`;
  }
  return `${text}%`;
}

function formatMoney(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return `${value}元`;
  }
  const text = String(value).trim();
  if (text === "") return null;
  if (/[元￥¥]$/.test(text)) return text;
  return `${text}元`;
}

/**
 * 表格与导出共用的值格式化口径（单一事实来源）：
 * - number / plain / tags / url / price-range：原样（number 保持数值，Excel 数值单元格）；
 * - percent：保留一位小数的百分比字符串（如 40.6 → "40.6%"）；
 * - money：`${值}元`（如 800 → "800元"；已带货币符号的字符串原样保留）。
 * 空值（null/undefined/空字符串）统一返回 null。
 */
export function formatPgyKolColumnValue(column, value) {
  if (value === null || value === undefined || value === "") return null;
  const formatter = column && column.formatter;
  if (formatter === "percent") return formatPercent(value);
  if (formatter === "money") return formatMoney(value);
  return value;
}
