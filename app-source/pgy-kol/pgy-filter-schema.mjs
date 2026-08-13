/**
 * 蒲公英“找博主”动态筛选配置规范化模块（第一阶段）。
 *
 * 职责：
 * - 字段注册表（FIELD_REGISTRY）：哪些筛选字段存在、如何序列化、是否可作为互斥切分维度。
 * - 动态配置结构校验 + 规范化（同 label 不同 value/path 的节点全部保留）。
 * - last-known-good（LKG）快照存储：线上配置不可用或结构异常时回退。
 * - 按注册表 serializer 把前端筛选值转换为搜索 payload 值。
 *
 * 纯 ESM，只依赖 node 内置模块，禁止 import electron。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PgySessionRequest } from "./pgy-session-request.mjs";

/**
 * 蒲公英 API 源。
 *
 * 优先从统一请求层模块（pgy-session-request.mjs）读取 PGY_ORIGIN；
 * 该模块由主代理/其它子代理负责，尚未就绪时这里定义同名常量作为默认值
 * （与搜索页同源 pgy.xiaohongshu.com 一致）。一旦统一请求层落地并导出
 * PGY_ORIGIN，本模块会自动切换为其值，无需改业务代码。
 * 注：行业推荐博主树（industryTags）是 get_select_kol_tags_config_v2 的真实 section，
 * 形状为 taxonomy（taxonomy1Tag + taxonomy2Tags 字符串数组）；edith 的
 * get_industry_tag 仅用于笔记类目（specialIndustryData）。
 */
let PGY_ORIGIN = "https://pgy.xiaohongshu.com";
try {
  const sessionRequestModule = await import("./pgy-session-request.mjs");
  if (
    sessionRequestModule &&
    typeof sessionRequestModule.PGY_ORIGIN === "string" &&
    sessionRequestModule.PGY_ORIGIN.length > 0
  ) {
    PGY_ORIGIN = sessionRequestModule.PGY_ORIGIN;
  }
} catch {
  // 统一请求层尚未就绪（或在纯 node 测试环境无法加载 electron 依赖）：
  // 保持默认源，不影响本模块的纯函数能力。
}

export const SCHEMA_VERSION = "pgy-filter-schema/3.0.0";

export const PROVIDER_ENDPOINTS = Object.freeze({
  kolTagsV2: "/api/solar/kol/get_select_kol_tags_config_v2",
  areas: "/api/solar/area/get_areas?type=2",
  contentTagTree: "/api/solar/cooperator/content/tag_tree",
  specialIndustryData: "https://edith.xiaohongshu.com/api/pgy/kol/get_industry_tag",
  consumeBehavior: "/api/pgy/kol/consume_behavior",
  brandSearch: "/api/solar/brand/search_brand",
  activities: "/api/solar/cooperator/get_all_activities",
});

/**
 * get_select_kol_tags_config_v2 内的节（section）到 payloadField 的映射。
 * 键是接口返回的节名，值是 FIELD_REGISTRY 中的 payloadField。
 */
export const KOL_TAGS_V2_SECTIONS = Object.freeze({
  automotiveIndustryTag: "industrySpecificCrowdsMotorDom",
  audience20: "top20CrowdsLabel",
  contentTheme: "contentThemeLabel",
  industryTags: "firstIndustry",
});

function freezeRegistryEntry(entry) {
  if (entry.optionProvider !== undefined) {
    entry.optionProvider = Object.freeze({ ...entry.optionProvider });
  }
  if (entry.options !== undefined) {
    entry.options = Object.freeze(entry.options.map((option) => Object.freeze({ ...option })));
  }
  if (entry.uiKeys === undefined) {
    entry.uiKeys = Object.freeze([entry.payloadField]);
  } else {
    entry.uiKeys = Object.freeze(entry.uiKeys.slice());
  }
  // Phase 5.1：payloadProven 表示「字段名 + 取值语义已经官网真实流量实证」，
  // 只在注册表维护；前端通过 IPC schema-fields 读取，禁止手写副本。
  // 未实证字段不允许进入真实搜索/采集 payload（preview 例外，见 payload builder）。
  if (entry.payloadProven === undefined) {
    entry.payloadProven = true;
  }
  if (entry.evidence === undefined) {
    entry.evidence = "phase2-base-payload";
  }
  return Object.freeze(entry);
}

// ===== 官网选项定义（Phase 5.1 实证，来自官网 bundle 模块 78538）=====
// 值均为「范围数组」；-1 表示无上限，null 表示不限（按官网选项原样保留）。
const RANGE_OPTION_50W = Object.freeze([
  { label: "5万以上", value: [50000, -1] },
  { label: "1万～5万", value: [10000, 50000] },
  { label: "0.5万～1万", value: [5000, 10000] },
  { label: "0.1万～0.5万", value: [1000, 5000] },
]);
const RANGE_OPTION_2000 = Object.freeze([
  { label: "2000以上", value: [2000, -1] },
  { label: "1000～2000", value: [1000, 2000] },
  { label: "500～1000", value: [500, 1000] },
  { label: "200～500", value: [200, 500] },
  { label: "100～200", value: [100, 200] },
]);
const RANGE_OPTION_10000 = Object.freeze([
  { label: "10000以上", value: [10000, -1] },
  { label: "5000～10000", value: [5000, 10000] },
  { label: "2000～5000", value: [2000, 5000] },
  { label: "1000～2000", value: [1000, 2000] },
  { label: "500～1000", value: [500, 1000] },
]);
const RANGE_OPTION_CPUV = Object.freeze([
  { label: "0.5以下", value: [0, 0.5] },
  { label: "0.5～1.0", value: [0.5, 1] },
  { label: "1.0～1.5", value: [1, 1.5] },
  { label: "1.5～2.5", value: [1.5, 2.5] },
  { label: "2.5～4.0", value: [2.5, 4] },
]);
const RANGE_OPTION_PIC_READ = Object.freeze([
  { label: "0.5以下", value: [0, 0.5] },
  { label: "0.5～1.0", value: [0.5, 1] },
  { label: "1.0～1.5", value: [1, 1.5] },
  { label: "1.5～2.0", value: [1.5, 2] },
  { label: "2.0以上", value: [2, -1] },
]);
const RANGE_OPTION_VIDEO_READ = Object.freeze([
  { label: "1.5以下", value: [0, 1.5] },
  { label: "1.5～2.0", value: [1.5, 2] },
  { label: "2.0～2.5", value: [2, 2.5] },
  { label: "2.5～3.0", value: [2.5, 3] },
  { label: "3.0以上", value: [3, -1] },
]);
const RANGE_OPTION_PIC_ENGAGE = Object.freeze([
  { label: "0.5以下", value: [0, 0.5] },
  { label: "0.5～1.0", value: [0.5, 1] },
  { label: "1.0～2.0", value: [1, 2] },
  { label: "2.0～3.0", value: [2, 3] },
  { label: "3.0以上", value: [3, -1] },
]);
const RANGE_OPTION_VIDEO_ENGAGE = Object.freeze([
  { label: "1.0以下", value: [0, 1] },
  { label: "1.0～2.0", value: [1, 2] },
  { label: "2.0～3.0", value: [2, 3] },
  { label: "3.0～4.0", value: [3, 4] },
  { label: "4.0以上", value: [4, -1] },
]);
const RANGE_OPTION_CPM_PIC = Object.freeze([
  { label: "10以下", value: [0, 10] },
  { label: "10～20", value: [10, 20] },
  { label: "20～30", value: [20, 30] },
  { label: "30～50", value: [30, 50] },
  { label: "50以上", value: [50, -1] },
]);
const RANGE_OPTION_CPM_VIDEO = Object.freeze([
  { label: "10以下", value: [0, 10] },
  { label: "10～30", value: [10, 30] },
  { label: "30～50", value: [30, 50] },
  { label: "50～70", value: [50, 70] },
  { label: "70以上", value: [70, -1] },
]);
const RANGE_OPTION_INVITE_REPLY = Object.freeze([
  { label: "95%以上", value: [95, -1] },
  { label: "90%～95%", value: [90, 95] },
  { label: "80%～90%", value: [80, 90] },
  { label: "70%～80%", value: [70, 80] },
  { label: "80%以下", value: [0, 80] },
]);
const RANGE_OPTION_PERCENT_40 = Object.freeze([
  { label: "40%以上", value: [40, null] },
  { label: "30%～40%", value: [30, 40] },
  { label: "20%～30%", value: [20, 30] },
  { label: "10%～20%", value: [10, 20] },
  { label: "10%以下", value: [null, 10] },
]);
const OPTION_LIVE_COUNT = Object.freeze([
  { label: "0次", value: [0, 0] },
  { label: "1～5次", value: [1, 5] },
  { label: "6～10次", value: [6, 10] },
  { label: "10次以上", value: [10, -1] },
]);
const OPTION_LIVE_VIEWER = Object.freeze([
  { label: "0~5k", value: [0, 5000] },
  { label: "5k~1w", value: [5000, 10000] },
  { label: "1w~10w", value: [10000, 100000] },
  { label: "10w~50w", value: [100000, 500000] },
  { label: "50w以上", value: [500000, -1] },
]);
const OPTION_LIVE_GMV = Object.freeze([
  { label: "5千以下", value: [0, 5000] },
  { label: "5千～1万", value: [5000, 10000] },
  { label: "1万～10万", value: [10000, 100000] },
  { label: "10万～50万", value: [100000, 500000] },
  { label: "50万～100万", value: [500000, 1000000] },
  { label: "100万～200万", value: [1000000, 2000000] },
  { label: "200万～500万", value: [2000000, 5000000] },
  { label: "500万以上", value: [5000000, -1] },
]);

// ===== 官网枚举编码（2026-08-12 实证，来自官网 bundle 模块 78538）=====
// 粉丝年龄/性别/签约/婚恋/消费/母婴阶段：官网 payload 发送数字编码而非中文标签。
// 前端 UI 保留中文标签展示，序列化时经 label-to-code 转换；未知标签显式报错，
// 避免把非法值直发官网（10090102 参数格式校验错误）。
const OFFICIAL_LABEL_CODES = Object.freeze({
  fansAge: Object.freeze({
    "18岁以下": 1,
    "18-24": 2,
    "25-34": 3,
    "35-44": 4,
    "45岁以上": 5,
  }),
  fansGender: Object.freeze({
    男: 1,
    女: 2,
  }),
  signed: Object.freeze({
    个人博主: 0,
    机构博主: 1,
  }),
  fansMaritalStatus: Object.freeze({
    未婚: 0,
    已婚: 1,
  }),
  fansConsumptionLevel: Object.freeze({
    低: 0,
    中: 1,
    高: 2,
  }),
  fansChildAgeInfo: Object.freeze({
    备孕: 0,
    "0-6月": 2,
    "7-12月": 3,
    "1-3岁": 4,
    "4-6岁": 5,
    "7-12岁": 6,
    孕早期: 7,
    孕晚期: 8,
  }),
});

/**
 * 筛选字段注册表（Phase 5.1：单一权威来源）。
 *
 * payloadProven=true 表示「字段名 + 取值语义已经官网真实流量实证」
 * （2026-08-07 定点实证，见 artifacts/verification/pgy-kol-phase5.1/）。
 * payloadProven 只在本注册表维护；前端通过 IPC schema-fields 读取，禁止手写副本。
 *
 * uiKeys：前端筛选状态键（可能多个 UI 键映射到同一 payload 字段）。
 * options：官网选项定义（范围/枚举），供前端渲染与契约测试使用。
 * serializer：payload 值序列化规则（见 serialize()）。
 */
export const FIELD_REGISTRY = Object.freeze([
  freezeRegistryEntry({ payloadField: "marketTarget", uiKeys: ["marketTarget"], label: "投放目标", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: null }),
  // 人群目标：品牌依赖；当前账号无合作品牌（seller/list=0），取值语义未实证。
  freezeRegistryEntry({ payloadField: "audienceGroup", uiKeys: ["audienceGroup"], label: "人群分组", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "option-value", defaultValue: [], payloadProven: false, evidence: "pending-live-verification", reason: "brand-gated: 未选择合作品牌时官网禁用；账号无可用品牌，无法实证人群包取值" }),
  freezeRegistryEntry({ payloadField: "personalTags", uiKeys: ["personalTags"], label: "个人标签", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "gender", uiKeys: ["gender"], label: "性别", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: null }),
  freezeRegistryEntry({ payloadField: "location", uiKeys: ["location"], label: "博主地域", controlType: "tree-single", multiSelect: "single", exclusive: "candidate", serializer: "path-trim", defaultValue: null, optionProvider: { provider: "areas" } }),
  freezeRegistryEntry({ payloadField: "signed", uiKeys: ["signed"], label: "签约状态", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "label-to-code", defaultValue: -1 }),
  freezeRegistryEntry({ payloadField: "featureTags", uiKeys: ["featureTags"], label: "特色标签", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "fansNumberLower", uiKeys: ["fansNumberLower"], label: "粉丝数下限", controlType: "range-int", multiSelect: "single", exclusive: true, serializer: "range-bound", defaultValue: null }),
  freezeRegistryEntry({ payloadField: "fansNumberUpper", uiKeys: ["fansNumberUpper"], label: "粉丝数上限", controlType: "range-int", multiSelect: "single", exclusive: true, serializer: "range-bound", defaultValue: null }),
  freezeRegistryEntry({ payloadField: "fansAge", uiKeys: ["fansAge"], label: "粉丝年龄", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "label-to-code", defaultValue: 0 }),
  freezeRegistryEntry({ payloadField: "fansGender", uiKeys: ["fansGender"], label: "粉丝性别", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "label-to-code", defaultValue: 0 }),
  freezeRegistryEntry({ payloadField: "fansLocation", uiKeys: ["fansLocation"], label: "粉丝地域", controlType: "tree-single", multiSelect: "single", exclusive: "candidate", serializer: "path-trim", defaultValue: null, optionProvider: { provider: "areas" } }),
  freezeRegistryEntry({ payloadField: "fansMaritalStatus", uiKeys: ["fansMaritalStatus"], label: "粉丝婚姻状况", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "label-to-code", defaultValue: -1 }),
  freezeRegistryEntry({ payloadField: "fansConsumptionLevel", uiKeys: ["fansConsumptionLevel"], label: "粉丝消费水平", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "label-to-code", defaultValue: -1 }),
  freezeRegistryEntry({ payloadField: "fansChildAgeInfo", uiKeys: ["fansChildAgeInfo"], label: "粉丝孩子年龄", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "label-to-code", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "fansDevicePrice", uiKeys: ["fansDevicePrice"], label: "粉丝设备价格", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "fansDeviceBrand", uiKeys: ["fansDeviceBrand"], label: "粉丝设备品牌", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "accumCommonImpMedinNum30d", uiKeys: ["accumCommonImpMedinNum30d"], label: "近30天平均播放中位数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "range-option", defaultValue: [], options: RANGE_OPTION_50W }),
  freezeRegistryEntry({ payloadField: "readMidNor30", uiKeys: ["readMidNor30"], label: "近30天阅读中位数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "range-option", defaultValue: [], options: RANGE_OPTION_50W }),
  freezeRegistryEntry({ payloadField: "interMidNor30", uiKeys: ["interMidNor30"], label: "近30天互动中位数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "range-option", defaultValue: [], options: RANGE_OPTION_2000 }),
  freezeRegistryEntry({ payloadField: "thousandLikePercent30", uiKeys: ["thousandLikePercent30"], label: "近30天千赞率", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "percent-range-option", defaultValue: [], options: RANGE_OPTION_PERCENT_40 }),
  freezeRegistryEntry({ payloadField: "noteType", uiKeys: ["noteType"], label: "笔记类型", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: 0 }),
  freezeRegistryEntry({ payloadField: "notePriceLower", uiKeys: ["notePriceLower"], label: "图文报价下限", controlType: "range", multiSelect: "single", exclusive: false, serializer: "range-bound", defaultValue: -1, reason: "lossy" }),
  freezeRegistryEntry({ payloadField: "notePriceUpper", uiKeys: ["notePriceUpper"], label: "图文报价上限", controlType: "range", multiSelect: "single", exclusive: false, serializer: "range-bound", defaultValue: -1, reason: "lossy" }),
  freezeRegistryEntry({ payloadField: "videoPriceLower", uiKeys: ["videoPriceLower"], label: "视频报价下限", controlType: "range", multiSelect: "single", exclusive: false, serializer: "range-bound", defaultValue: -1, reason: "lossy" }),
  freezeRegistryEntry({ payloadField: "videoPriceUpper", uiKeys: ["videoPriceUpper"], label: "视频报价上限", controlType: "range", multiSelect: "single", exclusive: false, serializer: "range-bound", defaultValue: -1, reason: "lossy" }),
  freezeRegistryEntry({ payloadField: "progressOrderCnt", uiKeys: ["progressOrderCnt"], label: "历史合作数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "tradeReportBrandIdSet", uiKeys: ["tradeReportBrandIdSet"], label: "合作品牌", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "activityCodes", uiKeys: ["activityCodes"], label: "合作活动", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [], evidence: "phase5.1-live" }),
  freezeRegistryEntry({ payloadField: "flagList", uiKeys: [], label: "标签筛选（结构化）", controlType: "flag-list", multiSelect: "multi", exclusive: false, serializer: "flag-list", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "filterList", uiKeys: [], label: "更多筛选（结构化）", controlType: "filter-list", multiSelect: "multi", exclusive: false, serializer: "filter-list", defaultValue: [] }),
  freezeRegistryEntry({ payloadField: "contentSceneLabel", uiKeys: ["noteCategory"], label: "笔记类目", controlType: "tree-multi", multiSelect: "multi", exclusive: false, serializer: "space-path", defaultValue: [], payloadProven: true, evidence: "phase5.1-live", optionProvider: { provider: "specialIndustryData" } }),
  freezeRegistryEntry({ payloadField: "industrySpecificCrowdsMotorDom", uiKeys: ["automotive"], label: "行业特色画像", controlType: "tree-multi", multiSelect: "multi", exclusive: false, serializer: "flatten-leaf-values", defaultValue: [], optionProvider: { provider: "kolTagsV2", section: "automotiveIndustryTag" } }),
  freezeRegistryEntry({ payloadField: "top20CrowdsLabel", uiKeys: ["audience20"], label: "二十大人群", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "top20-transform", defaultValue: [], optionProvider: { provider: "kolTagsV2", section: "audience20" } }),
  freezeRegistryEntry({ payloadField: "contentThemeLabel", uiKeys: ["contentTheme"], label: "内容题材", controlType: "tree-multi", multiSelect: "multi", exclusive: false, serializer: "path-space", defaultValue: [], optionProvider: { provider: "kolTagsV2", section: "contentTheme" } }),
  freezeRegistryEntry({ payloadField: "kolInfoConsumBehaviorLabel", uiKeys: ["consumeBehavior"], label: "预估消费行为", controlType: "tree-multi", multiSelect: "multi", exclusive: false, serializer: "path-or-label", defaultValue: [], optionProvider: { provider: "consumeBehavior" } }),
  // ===== Phase 5.1：官网真实流量实证字段（2026-08-07）=====
  freezeRegistryEntry({ payloadField: "contentTag", uiKeys: ["contentTag"], label: "博主类目", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "passthrough", defaultValue: [], payloadProven: true, evidence: "phase5.1-live", note: "取值值域为前端静态类目列表；28 个类目值（去「全部」）已于 2026-08-07 逐值真实搜索实证（live-probes/contentTag-full-domain.json，每个 total>0）；「全部」仅 UI 展开用，不进入 payload", optionProvider: { provider: "contentTagTree" } }),
  freezeRegistryEntry({ payloadField: "inviteReply48hNumRatio", uiKeys: ["coopCredit"], label: "合作信用度（邀约48h回复率）", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "percent-range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_INVITE_REPLY, note: "官网 UI 事件链缺陷（onUpdate 处理器未调用 e$）导致芯片可见但不触发搜索；字段语义经官方客户端构造 payload 实证" }),
  freezeRegistryEntry({ payloadField: "accumCoopImpMedinNum30d", uiKeys: ["coopImpMedin"], label: "传播规模-曝光中位数（合作）", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_50W }),
  freezeRegistryEntry({ payloadField: "readMidCoop30", uiKeys: ["coopReadMid"], label: "传播规模-阅读中位数（合作）", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_50W }),
  freezeRegistryEntry({ payloadField: "interMidCoop30", uiKeys: ["coopInterMid"], label: "传播规模-互动中位数（合作）", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_2000 }),
  freezeRegistryEntry({ payloadField: "mCpuv30d", uiKeys: ["coopOverflowMid"], label: "传播规模-外溢进店中位数", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_10000 }),
  freezeRegistryEntry({ payloadField: "estimatePicReadPrice", uiKeys: ["estimatePicReadCost"], label: "预估阅读单价-图文", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_PIC_READ }),
  freezeRegistryEntry({ payloadField: "estimateVideoReadPrice", uiKeys: ["estimateVideoReadCost"], label: "预估阅读单价-视频", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_VIDEO_READ }),
  freezeRegistryEntry({ payloadField: "estimatePictureEngageCost", uiKeys: ["estimatePicEngageCost"], label: "预估互动单价-图文", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_PIC_ENGAGE }),
  freezeRegistryEntry({ payloadField: "estimateVideoEngageCost", uiKeys: ["estimateVideoEngageCost"], label: "预估互动单价-视频", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_VIDEO_ENGAGE }),
  freezeRegistryEntry({ payloadField: "estimatePictureCpm", uiKeys: ["estimatePictureCpm"], label: "预估CPM-图文", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_CPM_PIC }),
  freezeRegistryEntry({ payloadField: "estimateVideoCpm", uiKeys: ["estimateVideoCpm"], label: "预估CPM-视频", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_CPM_VIDEO }),
  freezeRegistryEntry({ payloadField: "estimateCpuv30d", uiKeys: ["overflowCost"], label: "外溢进店单价", controlType: "range-option", multiSelect: "single", exclusive: false, serializer: "range-option", defaultValue: null, payloadProven: true, evidence: "phase5.1-live", options: RANGE_OPTION_CPUV }),
  freezeRegistryEntry({ payloadField: "filterList.kliveCnt30d", uiKeys: ["liveCount30d"], label: "近30天直播场次", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "filter-list-entry", defaultValue: [], payloadProven: true, evidence: "phase5.1-live", options: OPTION_LIVE_COUNT, filterListField: "kliveCnt30d" }),
  freezeRegistryEntry({ payloadField: "filterList.avgLiveViewerNum", uiKeys: ["avgLiveViewer"], label: "场均观播人数", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "filter-list-entry", defaultValue: [], payloadProven: true, evidence: "phase5.1-live", options: OPTION_LIVE_VIEWER, filterListField: "avgLiveViewerNum" }),
  freezeRegistryEntry({ payloadField: "filterList.avgAgmv90d", uiKeys: ["avgLiveGmv"], label: "场均销售额", controlType: "option-multi", multiSelect: "multi", exclusive: false, serializer: "filter-list-entry", defaultValue: [], payloadProven: true, evidence: "phase5.1-live", options: OPTION_LIVE_GMV, filterListField: "avgAgmv90d" }),
  freezeRegistryEntry({ payloadField: "inStar", uiKeys: ["inStar"], label: "明星", controlType: "bool", multiSelect: "single", exclusive: "unproven", serializer: "bool-to-int", defaultValue: 0, payloadProven: true, evidence: "phase5.1-live" }),
  freezeRegistryEntry({ payloadField: "newHighQuality", uiKeys: ["newHighQuality"], label: "新锐博主", controlType: "bool", multiSelect: "single", exclusive: "unproven", serializer: "bool-to-int", defaultValue: 0, payloadProven: true, evidence: "phase5.1-live" }),
  freezeRegistryEntry({ payloadField: "filterIntention", uiKeys: ["filterIntention"], label: "意向行业匹配", controlType: "bool", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: false, payloadProven: true, evidence: "phase5.1-live" }),
  freezeRegistryEntry({ payloadField: "flagList.isHighQuality", uiKeys: ["isHighQualityFlag"], label: "优质博主", controlType: "bool", multiSelect: "single", exclusive: false, serializer: "flag-entry", defaultValue: false, payloadProven: true, evidence: "phase5.1-live", flagType: "IS_HIGH_QUALITY" }),
  freezeRegistryEntry({ payloadField: "flagList.hasBuyerCoopAuth", uiKeys: ["hasBuyerCoopAuthFlag"], label: "笔记+直播均可合作", controlType: "bool", multiSelect: "single", exclusive: false, serializer: "flag-entry", defaultValue: false, payloadProven: true, evidence: "phase5.1-live", flagType: "HAS_BRAND_COOP_BUYER_AUTH" }),
  freezeRegistryEntry({ payloadField: "firstIndustry", uiKeys: ["firstIndustry"], label: "行业推荐博主-一级行业", controlType: "tree-single", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: "", payloadProven: true, evidence: "phase5.1-live", optionProvider: { provider: "kolTagsV2", section: "industryTags" } }),
  freezeRegistryEntry({ payloadField: "secondIndustry", uiKeys: ["secondIndustry"], label: "行业推荐博主-二级行业", controlType: "tree-single", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: "", payloadProven: true, evidence: "phase5.1-live" }),
  // 常规剔除（字段名已在官网 BASE_PAYLOAD 实证）。
  freezeRegistryEntry({ payloadField: "excludeLowActive", uiKeys: ["excludeLowActive"], label: "剔除低活博主", controlType: "bool", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: false, payloadProven: true, evidence: "phase5.1-live" }),
  freezeRegistryEntry({ payloadField: "fansNumUp", uiKeys: ["fansNumUp"], label: "剔除掉粉博主", controlType: "bool", multiSelect: "single", exclusive: "unproven", serializer: "bool-to-int", defaultValue: 0, payloadProven: true, evidence: "phase5.1-live" }),
  freezeRegistryEntry({ payloadField: "excludedTradeReportBrand", uiKeys: ["excludedTradeReportBrand"], label: "剔除已合作博主", controlType: "bool", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: false, payloadProven: true, evidence: "phase2-base-payload", note: "品牌依赖 UI 门控；账号无品牌未实测交互路径" }),
  freezeRegistryEntry({ payloadField: "excludedTradeInviteReportBrand", uiKeys: ["excludedTradeInviteReportBrand"], label: "剔除已邀约博主", controlType: "bool", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: false, payloadProven: true, evidence: "phase2-base-payload", note: "品牌依赖 UI 门控；账号无品牌未实测交互路径" }),
  freezeRegistryEntry({ payloadField: "tradeType", uiKeys: ["tradeType"], label: "合作类型（近期合作行业）", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: "不限", payloadProven: true, evidence: "phase2-base-payload" }),
  freezeRegistryEntry({ payloadField: "excludedTradeReportBrandId", uiKeys: ["excludedTradeReportBrandId"], label: "合作品牌剔除ID", controlType: "enum", multiSelect: "single", exclusive: "unproven", serializer: "passthrough", defaultValue: false, payloadProven: true, evidence: "phase2-base-payload" }),
]);

const SCHEMA_ERROR_KINDS = new Set([
  "unknown-structure",
  "provider",
  "missing-lkg",
  "serializer",
  "unknown-field",
  "not-implemented",
  "invalid-input",
]);

export class PgySchemaError extends Error {
  /**
   * @param {string} message
   * @param {{ kind?: string, cause?: unknown }} [options]
   */
  constructor(message, { kind, cause } = {}) {
    // 兜底脱敏：不依赖请求层是否已脱敏。
    super(PgySessionRequest.redactText(String(message)), cause !== undefined ? { cause } : undefined);
    this.name = "PgySchemaError";
    this.kind = SCHEMA_ERROR_KINDS.has(kind) ? kind : undefined;
  }
}

/**
 * 创建 last-known-good 快照存储。
 *
 * 文件命名 lkg-${providerKey}.json；save 采用 tmp + rename 原子写；
 * load 在文件缺失、JSON 损坏或结构不符时返回 null。
 * 本存储只读写 LKG 快照文件，绝不接触任何凭据/请求头。
 *
 * @param {{ baseDir: string }} options
 */
export function createJsonLkgStore({ baseDir, maxEntries = 64, ttlMs = 7 * 24 * 60 * 60 * 1000 }) {
  if (!baseDir || typeof baseDir !== "string") {
    throw new TypeError("[pgy-filter-schema] createJsonLkgStore 需要 baseDir");
  }
  const filePathFor = (providerKey) => path.join(baseDir, `lkg-${providerKey}.json`);
  const manifestPath = path.join(baseDir, "lkg-cache.json");
  let manifestCache = null;
  let manifestWritePromise = null;

  async function loadManifest() {
    if (manifestCache) {
      return manifestCache;
    }
    try {
      const text = await fs.readFile(manifestPath, "utf8");
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.entries === "object") {
        manifestCache = parsed.entries;
      } else {
        manifestCache = {};
      }
    } catch {
      manifestCache = {};
    }
    return manifestCache;
  }

  async function persistManifest() {
    if (manifestWritePromise) {
      return manifestWritePromise;
    }
    manifestWritePromise = (async () => {
      try {
        await fs.mkdir(baseDir, { recursive: true });
        const tmpPath = `${manifestPath}.tmp-${randomUUID()}`;
        await fs.writeFile(tmpPath, JSON.stringify({ entries: manifestCache ?? {} }, null, 2), "utf8");
        await fs.rename(tmpPath, manifestPath);
      } catch {
        // manifest 保存失败只影响 LRU 记账，不影响 LKG 快照本身。
      } finally {
        manifestWritePromise = null;
      }
    })();
    return manifestWritePromise;
  }

  // 有界 LRU + TTL：品牌搜索按关键词哈希逐条累积，必须限制条目数与存活期。
  async function touch(providerKey) {
    const entries = await loadManifest();
    const now = Date.now();
    const staleKeys = [];
    for (const [key, record] of Object.entries(entries)) {
      if (record && typeof record.lastAccess === "number" && now - record.lastAccess > ttlMs) {
        staleKeys.push(key);
      }
    }
    for (const key of staleKeys) {
      delete entries[key];
      try {
        await fs.rm(filePathFor(key), { force: true });
      } catch {
        // 清理失败不影响主流程
      }
    }
    entries[providerKey] = { lastAccess: now };
    const keys = Object.keys(entries);
    if (keys.length > maxEntries) {
      const sorted = keys.sort((a, b) => (entries[a].lastAccess ?? 0) - (entries[b].lastAccess ?? 0));
      const overflow = sorted.slice(0, keys.length - maxEntries);
      for (const key of overflow) {
        delete entries[key];
        try {
          await fs.rm(filePathFor(key), { force: true });
        } catch {
          // 清理失败不影响主流程
        }
      }
    }
    await persistManifest();
  }

  return {
    async load(providerKey) {
      try {
        // TTL 门禁：过期条目直接视为缺失（陈旧快照不得被回退使用）。
        const entries = await loadManifest();
        const record = entries[providerKey];
        if (record && typeof record.lastAccess === "number" && Date.now() - record.lastAccess > ttlMs) {
          delete entries[providerKey];
          await fs.rm(filePathFor(providerKey), { force: true });
          await persistManifest();
          return null;
        }
        const text = await fs.readFile(filePathFor(providerKey), "utf8");
        const snapshot = JSON.parse(text);
        if (
          snapshot === null ||
          typeof snapshot !== "object" ||
          Array.isArray(snapshot) ||
          snapshot.version !== SCHEMA_VERSION ||
          snapshot.provider !== providerKey ||
          !Array.isArray(snapshot.nodes)
        ) {
          return null;
        }
        // 仅对真实存在的快照记账：缺失/失效快照不得重新进入 LRU manifest
        // （否则 load 一个已被淘汰的键会把幽灵条目写回账本，干扰后续淘汰）。
        await touch(providerKey);
        return snapshot;
      } catch {
        return null;
      }
    },

    async save(providerKey, snapshot) {
      await fs.mkdir(baseDir, { recursive: true });
      const filePath = filePathFor(providerKey);
      const tmpPath = `${filePath}.tmp-${randomUUID()}`;
      await fs.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf8");
      await fs.rename(tmpPath, filePath);
      await touch(providerKey);
    },

    async remove(providerKey) {
      await fs.rm(filePathFor(providerKey), { force: true });
      const entries = await loadManifest();
      delete entries[providerKey];
      await persistManifest();
    },
  };
}

export class PgyFilterSchema {
  /**
   * @param {{ request: { requestJson: (opts: object) => Promise<unknown> }, lkgStore?: object | null }} options
   */
  constructor({ request, lkgStore }) {
    if (!request || typeof request.requestJson !== "function") {
      throw new TypeError("[pgy-filter-schema] request 必须提供 requestJson 方法");
    }
    this.request = request;
    this.lkgStore = lkgStore ?? null;
  }

  /** @returns {object | undefined} 注册表项 */
  getField(payloadField) {
    return FIELD_REGISTRY.find((entry) => entry.payloadField === payloadField);
  }

  /**
   * 按「payload 字段名或前端状态键（uiKey）」解析注册表项。
   * 单一权威来源：前端状态键 → payload 字段的映射只在此维护。
   *
   * @param {string} stateKey
   * @returns {object | undefined}
   */
  getFieldByStateKey(stateKey) {
    return FIELD_REGISTRY.find(
      (entry) => entry.payloadField === stateKey || entry.uiKeys.includes(stateKey),
    );
  }

  /**
   * 返回给渲染进程的安全字段投影（单一权威来源，禁止前端手写 unproven 副本）。
   * 只暴露 UI 需要的信息；不含任何原始配置/请求信息。
   *
   * @returns {object[]} [{ payloadField, uiKeys, label, controlType, multiSelect,
   *   payloadProven, reason?, options?, optionProvider? }]
   */
  getSchemaFields() {
    return FIELD_REGISTRY.map((entry) => {
      const out = {
        payloadField: entry.payloadField,
        uiKeys: entry.uiKeys,
        label: entry.label,
        controlType: entry.controlType,
        multiSelect: entry.multiSelect,
        payloadProven: entry.payloadProven,
      };
      if (entry.payloadProven === false && entry.reason !== undefined) {
        out.reason = entry.reason;
      }
      if (entry.options !== undefined) {
        out.options = entry.options;
      }
      if (entry.optionProvider !== undefined) {
        out.optionProvider = entry.optionProvider;
      }
      if (entry.filterListField !== undefined) {
        out.filterListField = entry.filterListField;
      }
      if (entry.flagType !== undefined) {
        out.flagType = entry.flagType;
      }
      return out;
    });
  }

  /**
   * 把原始配置树规范化为统一节点结构。
   *
   * 每个节点：{ provider, payloadField, value, label, fullPath, children, disabled, rawVersion, uniqueKey }
   * - value 取 valueKey ?? labelKey ?? "name" 的字符串；
   * - label 取 labelKey ?? valueKey；
   * - fullPath = parentPath ? `${parentPath} > ${label}` : label；
   * - disabled 默认 false；
   * - uniqueKey = `${payloadField}:${value}:${fullPath}`，禁止只用 label 去重；
   * - 同 label 不同 value/path 的节点全部保留。
   *
   * @param {{ rawNodes: unknown[], payloadField: string, provider: string, valueKey?: string, labelKey?: string, childrenKey?: string, parentPath?: string }} options
   */
  normalizeOptionTree({
    rawNodes,
    payloadField,
    provider,
    valueKey = "value",
    labelKey = "label",
    childrenKey = "children",
    parentPath = "",
  }) {
    if (!Array.isArray(rawNodes)) {
      return [];
    }
    return rawNodes.map((raw, index) => {
      const rawValue = raw?.[valueKey] ?? raw?.[labelKey] ?? raw?.name;
      const rawLabel = raw?.[labelKey] ?? raw?.[valueKey];
      const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
      const label = rawLabel === undefined || rawLabel === null ? "" : String(rawLabel);
      const fullPath = parentPath ? `${parentPath} > ${label}` : label;
      const children = Array.isArray(raw?.[childrenKey])
        ? this.normalizeOptionTree({
            rawNodes: raw[childrenKey],
            payloadField,
            provider,
            valueKey,
            labelKey,
            childrenKey,
            parentPath: fullPath,
          })
        : [];
      return {
        provider,
        payloadField,
        value,
        label,
        fullPath,
        path: raw?.path === undefined || raw?.path === null ? fullPath : String(raw.path),
        children,
        disabled: Boolean(raw?.disabled),
        rawVersion: raw,
        // value 为空时用同级序号消歧，保证 uniqueKey 不塌缩（契约公式对非空 value 不变）。
        uniqueKey:
          value === ""
            ? `${payloadField}:<empty>#${index}:${fullPath}`
            : `${payloadField}:${value}:${fullPath}`,
      };
    });
  }

  /**
   * 叶子值数组：递归 children；无 children 即叶子；叶子值 = value ?? label ?? 原节点。
   *
   * @param {object | string | number} node
   * @returns {unknown[]}
   */
  flattenLeafValues(node) {
    const leaves = [];
    const walk = (current) => {
      if (current === null || current === undefined) {
        return;
      }
      if (typeof current !== "object") {
        leaves.push(current);
        return;
      }
      const children = Array.isArray(current.children) ? current.children : [];
      if (children.length === 0) {
        // 契约语义：value || label || 原值（falsy 值回退到下一级）。
        leaves.push(current.value || current.label || current);
        return;
      }
      for (const child of children) {
        walk(child);
      }
    };
    walk(node);
    return leaves;
  }

  /**
   * 校验线上配置结构。
   *
   * 通用要求：raw 是对象、raw.code === 0、raw.data 存在。
   * kolTagsV2：data 是对象且 KOL_TAGS_V2_SECTIONS 每节是数组、元素是对象。
   * consumeBehavior / contentTagTree / industryTags：data 是数组、元素是对象。
   * areas：data 是数组（或树根对象）。
   *
   * @param {unknown} raw
   * @param {string} provider
   * @returns {{ ok: boolean, errors: string[] }}
   */
  validateConfigStructure(raw, provider) {
    const errors = [];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push("raw 不是对象");
      return { ok: false, errors };
    }
    if (raw.code !== 0) {
      errors.push(`raw.code 期望 0，实际 ${JSON.stringify(raw.code)}`);
    }
    const data = raw.data;
    if (data === undefined || data === null) {
      errors.push("raw.data 缺失");
      return { ok: false, errors };
    }

    switch (provider) {
      case "kolTagsV2": {
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push("raw.data 期望对象（kolTagsV2）");
          break;
        }
        for (const section of Object.keys(KOL_TAGS_V2_SECTIONS)) {
          const sectionValue = data[section];
          if (!Array.isArray(sectionValue)) {
            errors.push(`raw.data.${section} 期望数组`);
            continue;
          }
          sectionValue.forEach((element, index) => {
            if (element === null || typeof element !== "object" || Array.isArray(element)) {
              errors.push(`raw.data.${section}[${index}] 期望对象`);
            }
          });
        }
        break;
      }
      case "consumeBehavior": {
        // 线上真实形状（2026-08-05 真实响应实证）：data 是对象，根键 consumeBehaviorTag 为数组。
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push("raw.data 期望对象（consumeBehavior，含 consumeBehaviorTag 数组）");
          break;
        }
        const tag = data.consumeBehaviorTag;
        if (!Array.isArray(tag)) {
          errors.push("raw.data.consumeBehaviorTag 期望数组");
          break;
        }
        tag.forEach((element, index) => {
          if (element === null || typeof element !== "object" || Array.isArray(element)) {
            errors.push(`raw.data.consumeBehaviorTag[${index}] 期望对象`);
          }
        });
        break;
      }
      case "contentTagTree":
      case "industryTags": {
        if (!Array.isArray(data)) {
          errors.push("raw.data 期望数组");
          break;
        }
        data.forEach((element, index) => {
          if (element === null || typeof element !== "object" || Array.isArray(element)) {
            errors.push(`raw.data[${index}] 期望对象`);
          }
        });
        break;
      }
      case "specialIndustryData": {
        // 笔记类目树（官网 get_industry_tag）：data 为对象，根键 industryTag 为数组。
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push("raw.data 期望对象（specialIndustryData，含 industryTag 数组）");
          break;
        }
        if (!Array.isArray(data.industryTag)) {
          errors.push("raw.data.industryTag 期望数组");
          break;
        }
        data.industryTag.forEach((element, index) => {
          if (element === null || typeof element !== "object" || Array.isArray(element)) {
            errors.push(`raw.data.industryTag[${index}] 期望对象`);
          }
        });
        break;
      }
      case "activities":
      case "brandSearch": {
        // 容忍式形状：data 为数组，或 data.list/data.activities/data.brands 为数组。
        if (Array.isArray(data)) {
          data.forEach((element, index) => {
            if (element === null || typeof element !== "object" || Array.isArray(element)) {
              errors.push(`raw.data[${index}] 期望对象`);
              return;
            }
            // fresh reviewer M4：元素必须携带可识别标识键，缺键视为结构异常
            // （走 LKG/报错），禁止用序号伪造 value。
            const hasKey =
              provider === "activities"
                ? ["code", "activityCode", "value", "id", "name"].some((key) => element[key] !== undefined && element[key] !== null && String(element[key]).trim() !== "")
                : ["brandUserId", "brandId", "userId", "id", "name"].some((key) => element[key] !== undefined && element[key] !== null && String(element[key]).trim() !== "");
            if (!hasKey) {
              errors.push(`raw.data[${index}] 缺少可识别标识键`);
            }
          });
          break;
        }
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push("raw.data 期望数组或对象");
          break;
        }
        const list =
          (Array.isArray(data.list) ? data.list : null) ??
          (Array.isArray(data.activities) ? data.activities : null) ??
          (Array.isArray(data.brands) ? data.brands : null);
        if (!Array.isArray(list)) {
          errors.push("raw.data.list/activities/brands 期望数组");
          break;
        }
        list.forEach((element, index) => {
          if (element === null || typeof element !== "object" || Array.isArray(element)) {
            errors.push(`raw.data 列表[${index}] 期望对象`);
            return;
          }
          const hasKey =
            provider === "activities"
              ? ["code", "activityCode", "value", "id", "name"].some((key) => element[key] !== undefined && element[key] !== null && String(element[key]).trim() !== "")
              : ["brandUserId", "brandId", "userId", "id", "name"].some((key) => element[key] !== undefined && element[key] !== null && String(element[key]).trim() !== "");
          if (!hasKey) {
            errors.push(`raw.data 列表[${index}] 缺少可识别标识键`);
          }
        });
        break;
      }
      case "areas": {
        // 线上真实形状（2026-08-05 真实响应实证）：data 是对象，根键 list 为数组（国家/省/市/区树）。
        if (typeof data !== "object" || Array.isArray(data)) {
          errors.push("raw.data 期望对象（areas，含 list 数组）");
          break;
        }
        const list = data.list;
        if (!Array.isArray(list)) {
          errors.push("raw.data.list 期望数组");
          break;
        }
        list.forEach((element, index) => {
          if (element === null || typeof element !== "object" || Array.isArray(element)) {
            errors.push(`raw.data.list[${index}] 期望对象`);
          }
        });
        break;
      }
      default:
        errors.push(`未知 provider: ${String(provider)}`);
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * 线上 get_areas / consume_behavior 不返回空格连接 path，而官网 Payload 契约为空格连接
   * （如 "中国 广东 广州"、"内容行为预估 汽车 预估车主作者 Porsche 保时捷911"）。
   * 仅当节点 path 等于 fullPath（即线上无独立 path，path 由规范化派生）时按 fullPath
   * 空格化；显式 path（如测试 fixture 提供）保留原样。
   *
   * @param {object[]} nodes
   * @returns {object[]}
   */
  deriveSpacePaths(nodes) {
    const walk = (list) => {
      for (const node of list) {
        if (node !== null && typeof node === "object") {
          if (node.path === node.fullPath) {
            node.path = String(node.fullPath).replace(/\s*>\s*/g, " ").trim();
          }
          if (Array.isArray(node.children)) {
            walk(node.children);
          }
        }
      }
      return list;
    };
    return walk(nodes);
  }

  /**
   * 按注册表 serializer 转换筛选值。
   *
   * @param {{ payloadField: string, value: unknown }} input
   * @returns {unknown}
   */
  serialize({ payloadField, value }) {
    const field = this.getField(payloadField);
    if (!field) {
      throw new PgySchemaError(`[pgy-filter-schema] 未注册字段: ${payloadField}`, { kind: "unknown-field" });
    }
    switch (field.serializer) {
      case "passthrough":
        return value;
      case "option-value": {
        // 选项对象数组 → 选项 value 字符串数组（如 audienceGroup 人群包取值）。
        const toValue = (item) =>
          item !== null && typeof item === "object" ? String(item.value ?? item.label ?? item) : String(item);
        return Array.isArray(value) ? value.map(toValue) : toValue(value);
      }
      case "bool-to-int": {
        // 官网布尔开关序列化为 0/1（inStar/newHighQuality/fansNumUp 实测）。
        return value === true ? 1 : value === false ? 0 : Number(value) === 1 ? 1 : 0;
      }
      case "range-option": {
        // 范围字段：选项值或自定义范围 `[lo, hi]`；-1=无上限，null=不限。
        const normalize = (range) => {
          if (!Array.isArray(range) || range.length !== 2) {
            throw new PgySchemaError(
              `[pgy-filter-schema] ${payloadField} 需要 [lo, hi] 范围数组`,
              { kind: "serializer" },
            );
          }
          return range.map((edge) => (edge === null || Number.isFinite(edge) ? edge : Number(edge)));
        };
        if (Array.isArray(value) && value.length === 2 && value.every((v) => Array.isArray(v))) {
          return value.map(normalize);
        }
        return normalize(value);
      }
      case "percent-range-option": {
        // 百分比范围：官网实测发送除以 100 的比率（95%以上 → [0.95,-0.01]；
        // 40%以上 → [0.4,null]）。-1/100=-0.01 自动成立；null 保持。
        const normalize = (range) => {
          if (!Array.isArray(range) || range.length !== 2) {
            throw new PgySchemaError(
              `[pgy-filter-schema] ${payloadField} 需要 [lo, hi] 百分比范围数组`,
              { kind: "serializer" },
            );
          }
          return range.map((edge) => {
            if (edge === null) return null;
            const numeric = Number(edge);
            if (!Number.isFinite(numeric)) {
              throw new PgySchemaError(
                `[pgy-filter-schema] ${payloadField} 百分比边界必须是数字或 null`,
                { kind: "serializer" },
              );
            }
            return numeric / 100;
          });
        };
        if (Array.isArray(value) && value.length === 2 && value.every((v) => Array.isArray(v))) {
          return value.map(normalize);
        }
        return normalize(value);
      }
      case "filter-list-entry": {
        // 直播数据：官网发送 filterList: [{field, value: 扁平范围数组}]。
        // 多个选项合并为一个扁平数组（官网 e.kliveCnt30d.map(JSON.parse).flat()）。
        if (!field.filterListField) {
          throw new PgySchemaError(`[pgy-filter-schema] ${payloadField} 缺少 filterListField`, {
            kind: "serializer",
          });
        }
        const ranges = Array.isArray(value) ? value : [value];
        const flat = ranges.flatMap((range) => {
          if (!Array.isArray(range) || range.length !== 2) {
            throw new PgySchemaError(
              `[pgy-filter-schema] ${payloadField} 需要 [lo, hi] 范围数组`,
              { kind: "serializer" },
            );
          }
          return range;
        });
        return { field: field.filterListField, value: flat };
      }
      case "flag-entry": {
        // 精选博主布尔 → flagList 条目（优质博主/笔记+直播）。
        if (!field.flagType) {
          throw new PgySchemaError(`[pgy-filter-schema] ${payloadField} 缺少 flagType`, {
            kind: "serializer",
          });
        }
        return { flagType: field.flagType, flagValue: value === true ? "1" : "0" };
      }
      case "space-path": {
        // 笔记类目：官网发送空格连接的全路径标签（"汽车 用车场景 远行近游"）。
        const toPath = (node) => {
          if (typeof node === "string") {
            return node.trim();
          }
          const raw = node?.path || node?.fullPath || node?.label || String(node);
          return String(raw).replace(/\s*>\s*/g, " ").trim();
        };
        return Array.isArray(value) ? value.map(toPath) : toPath(value);
      }
      case "flatten-leaf-values": {
        const nodes = Array.isArray(value) ? value : [value];
        return nodes.flatMap((node) => this.flattenLeafValues(node));
      }
      case "path-or-label": {
        const transform = (node) => node?.path || node?.label || node;
        return Array.isArray(value) ? value.map(transform) : transform(value);
      }
      case "label-to-code": {
        // 官网枚举（粉丝年龄/性别/签约/婚恋/消费/母婴阶段）：payload 发送数字
        // 编码而非中文标签（官网 bundle 模块 78538 实证）。未知标签显式报错，
        // 避免把非法值直发官网（10090102 参数格式校验错误）。
        const map = OFFICIAL_LABEL_CODES[field.payloadField];
        if (!map) {
          throw new PgySchemaError(
            `[pgy-filter-schema] ${field.payloadField} 缺少 label-to-code 编码表`,
            { kind: "serializer" },
          );
        }
        const toCode = (node) => {
          const key =
            typeof node === "string"
              ? node.trim()
              : String(node?.label ?? node?.name ?? node ?? "").trim();
          if (!Object.prototype.hasOwnProperty.call(map, key)) {
            throw new PgySchemaError(
              `[pgy-filter-schema] ${field.payloadField} 未知选项标签: ${key}`,
              { kind: "serializer" },
            );
          }
          return map[key];
        };
        return Array.isArray(value) ? value.map(toCode) : toCode(value);
      }
      case "range-bound": {
        // 上下限自由输入（粉丝量/图文报价/视频报价）：官网对“无上限”发送
        // null（如 100万以上 → fansNumberUpper: null），下限为 0 时发送 0；
        // 页面用 "UNBOUNDED" 哨兵表达无上限，这里转换为 null。
        if (typeof value === "string" && value.trim() === "UNBOUNDED") {
          return null;
        }
        const numeric = typeof value === "string" ? Number(value) : value;
        if (!Number.isFinite(numeric)) {
          throw new PgySchemaError(
            `[pgy-filter-schema] ${payloadField} 需要有限数值（收到 ${String(value)}）`,
            { kind: "serializer" },
          );
        }
        return numeric;
      }
      case "path-trim": {
        const trim = (node) =>
          typeof node === "string"
            ? node.trim()
            : String(node?.path ?? node?.fullPath ?? node?.label ?? "").trim();
        return Array.isArray(value) ? value.map(trim) : trim(value);
      }
      case "path-space": {
        // 官网契约（2026-08-05 真实会话实证）：内容题材发送空格连接的全路径字符串，
        // 如 ["汽车特色 沉浸式开车"]；" > " 分隔的 fullPath 统一转换为空格连接。
        const toSpacePath = (node) => {
          if (typeof node === "string") {
            return node.trim();
          }
          const raw = node?.path || node?.fullPath || node?.label || String(node);
          return String(raw).replace(/\s*>\s*/g, " ").trim();
        };
        return Array.isArray(value) ? value.map(toSpacePath) : toSpacePath(value);
      }
      case "top20-transform": {
        if (!Array.isArray(value)) {
          throw new PgySchemaError("[pgy-filter-schema] top20-transform 需要字符串数组", { kind: "serializer" });
        }
        // 官网契约（2026-08-05 真实会话实证）：选中项按空格分词，>=2 段时
        // 生成 `${首段} ${首段}-${其余段}`，例如 "自在户外 挑战极限者" →
        // "自在户外 自在户外-挑战极限者"。
        const officialTransform = (text) => {
          const parts = text.split(/\s+/);
          return parts.length >= 2
            ? `${parts[0]} ${parts[0]}-${parts.slice(1).join(" ")}`
            : text;
        };
        return value.map((item) => {
          if (item !== null && typeof item === "object") {
            // 父节点（含 children）只负责展开，不得作为最终 Payload 值：
            // 显式拒绝，避免把父级标签误发到官网。
            if (Array.isArray(item.children) && item.children.length > 0) {
              throw new PgySchemaError(
                "[pgy-filter-schema] top20 父节点不能直接作为 Payload 值，请选择叶子",
                { kind: "serializer" },
              );
            }
            // 两层树叶子：空格连接全路径后套官网变换。真实 audience20 叶子为纯名
            // （G5 实证："自在户外 > 挑战极限者" → "自在户外 挑战极限者" → 官网变换 →
            // "自在户外 自在户外-挑战极限者"）。注意：若叶子 label 已带父前缀
            // （"自在户外-挑战极限者"），变换会对两段文本再次拼前缀产生双重前缀，
            // 因此不得以带父前缀的 label 构造节点。
            const pathText = String(item.path ?? item.fullPath ?? item.label ?? item)
              .replace(/\s*>\s*/g, " ")
              .trim();
            return officialTransform(pathText);
          }
          return officialTransform(String(item));
        });
      }
      default:
        throw new PgySchemaError(
          `[pgy-filter-schema] 未知 serializer: ${field.serializer}（字段 ${payloadField}）`,
          { kind: "serializer" },
        );
    }
  }

  /**
   * 拉取并规范化动态配置，带 last-known-good 回退。
   *
   * 支持 provider：kolTagsV2（需 section）、consumeBehavior、areas；
   * 其它 provider 第一阶段明确失败（not-implemented），不做猜测。
   *
   * @param {{ provider: string, section?: string, session?: unknown, timeoutMs?: number }} options
   * @returns {Promise<{ source: "live" | "lkg", version: string, nodes: object[], warning?: string }>}
   */
  async loadOptions({ provider, section, keyword, session, timeoutMs } = {}) {
    switch (provider) {
      case "kolTagsV2": {
        const payloadField = KOL_TAGS_V2_SECTIONS[section];
        if (!payloadField) {
          throw new PgySchemaError(
            `[pgy-filter-schema] 未知 kolTagsV2 section: ${section}`,
            { kind: "unknown-structure" },
          );
        }
        return this._loadWithFallback({
          provider,
          // 三个 section 必须各自独立快照：并行加载时最后一次 save 不得覆盖其它
          // section，回退时也不得拿到错误 section 的配置树。
          lkgKey: `kolTagsV2.${section}`,
          url: `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.kolTagsV2}`,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "kolTagsV2"),
          normalize: (raw) => {
            if (section === "industryTags") {
              // 官网真实形状（2026-08-07 探针 + bundle 实证）：一级=taxonomy1Tag，
              // 二级=taxonomy2Tags 字符串数组；官网 UI 即按此构造 {label,value,children}。
              const list = Array.isArray(raw.data?.industryTags) ? raw.data.industryTags : [];
              const shaped = list
                .filter((n) => n !== null && typeof n === "object" && !Array.isArray(n))
                .map((n) => ({
                  value: n.taxonomy1Tag,
                  label: n.taxonomy1Tag,
                  children: (Array.isArray(n.taxonomy2Tags) ? n.taxonomy2Tags : [])
                    .filter((s) => typeof s === "string" && s.trim() !== "")
                    .map((s) => ({ value: s, label: s })),
                }));
              return this.normalizeOptionTree({
                rawNodes: shaped,
                payloadField,
                provider: "kolTagsV2",
              });
            }
            return this.normalizeOptionTree({
              rawNodes: raw.data[section],
              payloadField,
              provider: "kolTagsV2",
            });
          },
        });
      }
      case "consumeBehavior":
        return this._loadWithFallback({
          provider,
          lkgKey: "consumeBehavior",
          url: `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.consumeBehavior}`,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "consumeBehavior"),
          normalize: (raw) =>
            this.deriveSpacePaths(
              this.normalizeOptionTree({
                rawNodes: raw.data.consumeBehaviorTag,
                payloadField: "kolInfoConsumBehaviorLabel",
                provider: "consumeBehavior",
              }),
            ),
        });
      case "areas":
        return this._loadWithFallback({
          provider,
          lkgKey: "areas",
          url: `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.areas}`,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "areas"),
          normalize: (raw) => {
            return this.deriveSpacePaths(
              this.normalizeOptionTree({
                rawNodes: raw.data.list,
                payloadField: "location",
                provider: "areas",
                valueKey: "name",
                labelKey: "name",
              }),
            );
          },
        });
      case "activities":
        // 热门活动（官网 /api/solar/cooperator/get_all_activities）。
        // Phase 5.1 实证（2026-08-07）：真实响应元素为 { code, activityName,
        // activityLabel, ... }，payload activityCodes 发送 code ID（如
        // "6a3a40d5e4b078c8dc06b8e3"）。value 优先 code，label 优先 activityName；
        // 其它键仅作历史形状容忍回退。
        return this._loadWithFallback({
          provider,
          lkgKey: "activities",
          url: `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.activities}`,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "activities"),
          normalize: (raw) => {
            const list = Array.isArray(raw.data)
              ? raw.data
              : Array.isArray(raw.data?.list)
                ? raw.data.list
                : Array.isArray(raw.data?.activities)
                  ? raw.data.activities
                  : [];
            return list.map((item) => {
              // fresh reviewer M4：元素缺少全部候选键时视为结构异常（fail-closed），
              // 禁止用序号伪造 value 发送到官网。
              const value =
                item?.code ??
                item?.activityCode ??
                item?.value ??
                item?.id ??
                item?.name;
              if (value === undefined || value === null || String(value).trim() === "") {
                throw new PgySchemaError(
                  "[pgy-filter-schema] activities 元素缺少活动标识，拒绝伪造值",
                  { kind: "unknown-structure" },
                );
              }
              const label =
                item?.activityName ??
                item?.name ??
                item?.title ??
                item?.label ??
                String(value);
              return {
                provider: "activities",
                payloadField: "activityCodes",
                value: String(value),
                label: String(label),
                fullPath: String(label),
                path: String(label),
                children: [],
                disabled: Boolean(item?.disabled),
                rawVersion: item,
                uniqueKey: `activityCodes:${String(value)}:${String(label)}`,
              };
            });
          },
        });
      case "brandSearch": {
        const searchKeyword = typeof keyword === "string" && keyword.trim().length > 0 ? keyword.trim() : null;
        if (!searchKeyword) {
          throw new PgySchemaError(
            "[pgy-filter-schema] brandSearch 必须提供 keyword",
            { kind: "invalid-input" },
          );
        }
        const url = `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.brandSearch}?keyword=${encodeURIComponent(searchKeyword)}`;
        // fresh reviewer H1/L1：LKG 快照键使用 keyword 的不可逆哈希，
        // 关键词绝不进入文件名，也不出现在回退 warning 中。
        const keywordHash = createHash("sha256").update(searchKeyword).digest("hex").slice(0, 16);
        return this._loadWithFallback({
          provider,
          lkgKey: `brandSearch.${keywordHash}`,
          url,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "brandSearch"),
          normalize: (raw) => {
            const list = Array.isArray(raw.data)
              ? raw.data
              : Array.isArray(raw.data?.list)
                ? raw.data.list
                : Array.isArray(raw.data?.brands)
                  ? raw.data.brands
                  : [];
            return list.map((item) => {
              const value =
                item?.brandUserId ??
                item?.brandId ??
                item?.userId ??
                item?.id;
              if (value === undefined || value === null || String(value).trim() === "") {
                throw new PgySchemaError(
                  "[pgy-filter-schema] brandSearch 元素缺少品牌标识，拒绝伪造值",
                  { kind: "unknown-structure" },
                );
              }
              const label =
                item?.brandName ??
                item?.name ??
                item?.title ??
                String(value);
              return {
                provider: "brandSearch",
                payloadField: "tradeReportBrandIdSet",
                value: String(value),
                label: String(label),
                fullPath: String(label),
                path: String(label),
                children: [],
                disabled: Boolean(item?.disabled),
                rawVersion: item,
                uniqueKey: `tradeReportBrandIdSet:${String(value)}:${String(label)}`,
              };
            });
          },
        });
      }
      case "contentTagTree":
        // 博主类目标签树（官网 /api/solar/cooperator/content/tag_tree）。
        // Phase 5.1 已实证：payload contentTag 发送一级类目中文标签；
        // 2026-08-10 LKG rawVersion 实证：原始形状为 taxonomy1Tag +
        // taxonomy2Tags 字符串数组（与 kolTagsV2.industryTags 一致），
        // 必须先把 taxonomy2Tags 映射成 children，否则二级类目会全部丢失。
        return this._loadWithFallback({
          provider,
          lkgKey: "contentTagTree",
          url: `${PGY_ORIGIN}${PROVIDER_ENDPOINTS.contentTagTree}`,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "contentTagTree"),
          normalize: (raw) => {
            const list = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.data?.list) ? raw.data.list : [];
            const shaped = list
              .filter((n) => n !== null && typeof n === "object" && !Array.isArray(n))
              .map((n) => ({
                value: n.taxonomy1Tag,
                label: n.taxonomy1Tag,
                children: (Array.isArray(n.taxonomy2Tags) ? n.taxonomy2Tags : [])
                  .filter((s) => typeof s === "string" && s.trim() !== "")
                  .map((s) => ({ value: s, label: s })),
              }));
            return this.normalizeOptionTree({
              rawNodes: shaped,
              payloadField: "contentTag",
              provider: "contentTagTree",
            });
          },
        });
      case "specialIndustryData":
        // 笔记类目树（官网 /api/pgy/kol/get_industry_tag，edith 域）。
        // Phase 5.1 实证：payload contentSceneLabel 发送空格连接的全路径标签。
        return this._loadWithFallback({
          provider,
          lkgKey: "specialIndustryData",
          url: PROVIDER_ENDPOINTS.specialIndustryData,
          session,
          timeoutMs,
          validate: (raw) => this.validateConfigStructure(raw, "specialIndustryData"),
          normalize: (raw) => {
            const list = Array.isArray(raw.data?.industryTag)
              ? raw.data.industryTag
              : Array.isArray(raw.data)
                ? raw.data
                : [];
            return this.normalizeOptionTree({
              rawNodes: list,
              payloadField: "contentSceneLabel",
              provider: "specialIndustryData",
              labelKey: "label",
              childrenKey: "children",
            });
          },
        });
      default:
        throw new PgySchemaError(
          `[pgy-filter-schema] provider 未实现: ${provider}`,
          { kind: "not-implemented" },
        );
    }
  }

  async _loadWithFallback({ provider, lkgKey, url, session, timeoutMs, validate, normalize }) {
    let raw;
    try {
      raw = await this._requestJson({ url, session, timeoutMs });
    } catch (err) {
      if (err && (err.kind === "auth-expired" || err.kind === "risk-control")) {
        // 登录失效/风控是会话问题而非配置变化，不得用 last-known-good 掩盖。
        throw new PgySchemaError(
          `[pgy-filter-schema] ${provider} 鉴权/风控错误，不回退 last-known-good：${err?.message ?? err}`,
          { kind: "provider", cause: err },
        );
      }
      const snapshot = await this._loadLkg(lkgKey);
      if (snapshot) {
        return this._lkgResult(snapshot, lkgKey);
      }
      throw new PgySchemaError(
        `[pgy-filter-schema] ${provider} 线上请求失败: ${err?.message ?? err}`,
        { kind: "provider", cause: err },
      );
    }

    const check = validate(raw);
    if (!check.ok) {
      const snapshot = await this._loadLkg(lkgKey);
      if (snapshot) {
        return this._lkgResult(snapshot, lkgKey);
      }
      throw new PgySchemaError(
        `[pgy-filter-schema] ${provider} 配置结构异常: ${check.errors.join("；")}`,
        { kind: "unknown-structure" },
      );
    }

    const nodes = normalize(raw);
    if (this.lkgStore) {
      try {
        await this.lkgStore.save(lkgKey, {
          version: SCHEMA_VERSION,
          provider: lkgKey,
          savedAt: new Date().toISOString(),
          nodes,
        });
      } catch (saveError) {
        // LKG 快照保存失败只降级为“本次不保存”，不阻断线上结果。
        return {
          source: "live",
          version: SCHEMA_VERSION,
          nodes,
          warning: `[pgy-filter-schema] ${provider} LKG 快照保存失败，继续使用线上结果（${PgySessionRequest.redactText(String(saveError?.message ?? saveError))}）`,
        };
      }
    }
    return { source: "live", version: SCHEMA_VERSION, nodes };
  }

  async _requestJson({ url, session, timeoutMs }) {
    // 与现有统一请求层约定保持一致：requestJson({ url, method, session, timeoutMs })，
    // 未传的字段不写入 options。
    const options = { url, method: "GET" };
    if (session !== undefined) {
      options.session = session;
    }
    if (timeoutMs !== undefined) {
      options.timeoutMs = timeoutMs;
    }
    return this.request.requestJson(options);
  }

  async _loadLkg(providerKey) {
    if (!this.lkgStore) {
      return null;
    }
    try {
      return await this.lkgStore.load(providerKey);
    } catch {
      return null;
    }
  }

  _lkgResult(snapshot, providerKey) {
    return {
      source: "lkg",
      version: snapshot.version ?? SCHEMA_VERSION,
      nodes: Array.isArray(snapshot.nodes) ? snapshot.nodes : [],
      warning: `[pgy-filter-schema] ${providerKey} 线上配置不可用，已回退 last-known-good 快照（savedAt=${snapshot.savedAt ?? "unknown"}）`,
    };
  }
}
