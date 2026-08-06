// 蒲公英“找博主”列注册表（Phase 4 工作包 B）。
//
// 职责：
// - 覆盖全部 KNOWN_KOL_FIELDS（34 项）白名单字段，每项登记
//   { id, label, group, type, confirmed, defaultDisplay, defaultExport, nullable, evidence, note }。
// - confirmed=true 的 14 项拥有真实证据（export-schema / ui-card / known-list），
//   其中 10 项默认展示+默认导出（userId、nickname、fansNum、location、gender、
//   readMidNor30、interMidNor30、picturePrice、videoPrice、fansActiveIn28dLv）；
//   redId / currentLevel / fansCount / avatar 已确认但默认不展示不导出。
// - 其余 20 项 confirmed=false：含义未证实，保持隔离，仅保留注册表供审计。
// - 导出表头只接受 confirmed 列，顺序即用户选择顺序；未知或未确认 id 一律抛错。

import { KNOWN_KOL_FIELDS } from "./pgy-kol-search-client.mjs";

const UNCONFIRMED_NOTE = "含义未证实，保持隔离";

// confirmed 列的权威定义（id 与 KNOWN_KOL_FIELDS 白名单一一对应）。
const CONFIRMED_COLUMNS = Object.freeze({
  userId: { label: "博主UID", group: "博主信息", type: "string", evidence: "export-schema", defaultDisplay: true, defaultExport: true },
  nickname: { label: "昵称", group: "博主信息", type: "string", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  redId: { label: "小红书号", group: "博主信息", type: "string", evidence: "export-schema", defaultDisplay: false, defaultExport: false },
  currentLevel: { label: "健康等级", group: "博主信息", type: "string", evidence: "export-schema", defaultDisplay: false, defaultExport: false },
  fansNum: { label: "粉丝数", group: "博主信息", type: "number", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  fansCount: { label: "粉丝数（官方导出口径）", group: "博主信息", type: "number", evidence: "export-schema", defaultDisplay: false, defaultExport: false },
  location: { label: "地域", group: "博主信息", type: "string", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  gender: { label: "性别", group: "博主信息", type: "string", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  readMidNor30: { label: "近30天阅读中位数", group: "表现数据", type: "number", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  interMidNor30: { label: "近30天互动中位数", group: "表现数据", type: "number", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  picturePrice: { label: "图文报价", group: "报价", type: "string", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  videoPrice: { label: "视频报价", group: "报价", type: "string", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  fansActiveIn28dLv: { label: "活跃粉丝等级", group: "粉丝画像", type: "string", evidence: "ui-card", defaultDisplay: true, defaultExport: true },
  avatar: { label: "头像", group: "博主信息", type: "url", evidence: "known-list", defaultDisplay: false, defaultExport: false },
});

function buildColumn(id) {
  const confirmed = CONFIRMED_COLUMNS[id];
  if (confirmed) {
    return Object.freeze({
      id,
      label: confirmed.label,
      group: confirmed.group,
      type: confirmed.type,
      confirmed: true,
      defaultDisplay: confirmed.defaultDisplay,
      defaultExport: confirmed.defaultExport,
      nullable: true,
      evidence: confirmed.evidence,
      note: "",
    });
  }
  return Object.freeze({
    id,
    label: id,
    group: "未证实字段",
    type: "string",
    confirmed: false,
    defaultDisplay: false,
    defaultExport: false,
    nullable: true,
    evidence: "",
    note: UNCONFIRMED_NOTE,
  });
}

// 覆盖全部 KNOWN_KOL_FIELDS，顺序与白名单一致；整体与单项均冻结。
export const PGY_KOL_COLUMN_REGISTRY = Object.freeze(KNOWN_KOL_FIELDS.map(buildColumn));

const REGISTRY_BY_ID = new Map(PGY_KOL_COLUMN_REGISTRY.map((column) => [column.id, column]));

/**
 * 按 id 查列；不存在返回 undefined。
 */
export function getPgyKolColumn(id) {
  return REGISTRY_BY_ID.get(id);
}

/**
 * 已确认（可展示/可导出）列清单。
 */
export function listPgyKolConfirmedColumns() {
  return PGY_KOL_COLUMN_REGISTRY.filter((column) => column.confirmed);
}

/**
 * 默认展示列（同时是默认导出列）。
 */
export function getPgyKolDefaultColumns() {
  return PGY_KOL_COLUMN_REGISTRY.filter((column) => column.defaultDisplay);
}

/**
 * 按用户选择顺序构建两行表头 [{group,label,key}]。
 * 未知 id 或未确认 id → 抛错（消息含“未知列/未知字段”）。
 */
export function getPgyKolExportHeaders(columnIds) {
  const ids = Array.isArray(columnIds) ? columnIds : [];
  const headers = [];
  for (const id of ids) {
    const column = REGISTRY_BY_ID.get(id);
    if (!column || !column.confirmed) {
      throw new Error(`未知列/未知字段: ${String(id)}`);
    }
    headers.push({ group: column.group, label: column.label, key: column.id });
  }
  return headers;
}
