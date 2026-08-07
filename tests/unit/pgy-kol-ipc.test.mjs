import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createPgyKolService,
  registerPgyKolIpc,
  PGY_KOL_IPC_CHANNELS,
} from "../../app-source/pgy-kol/pgy-kol-service.mjs";
import { SCHEMA_VERSION } from "../../app-source/pgy-kol/pgy-filter-schema.mjs";
import { PgyPayloadError } from "../../app-source/pgy-kol/pgy-payload-builder.mjs";

function createFakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
  };
}

function createHarness({ transportImpl, t }) {
  const ipcMain = createFakeIpcMain();
  const calls = [];
  const fakeSession = { kind: "fake-session" };
  const transport = async (opts) => {
    calls.push(opts);
    return transportImpl(opts);
  };
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "pgy-kol-ipc-"));
  if (t) {
    t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));
  }
  const service = createPgyKolService({
    transport,
    getHeaders: () => ({ "X-Extra": "h1" }),
    sign: (_path, _body) => ({ "X-s": "sig-value", "X-t": 123456 }),
    sessionProvider: () => fakeSession,
    baseDir,
  });
  const disposeIpc = registerPgyKolIpc({ ipcMain, service });
  return { ipcMain, service, calls, fakeSession, transport, disposeIpc };
}

function jsonResponse(body, httpStatusCode = 200) {
  return { statusCode: httpStatusCode, data: JSON.stringify(body) };
}

const cappedSearchResponse = jsonResponse({
  code: 0,
  data: {
    kols: [
      { userId: "kol_0001", nickname: "演示博主", unknownFieldA: 1 },
      { userId: "kol_0002", fansNum: 12345 },
    ],
    total: 5000,
  },
  msg: "",
});

const readFixture = (name) =>
  JSON.parse(fs.readFileSync(new URL(`../fixtures/pgy-kol/${name}`, import.meta.url), "utf8"));

function collectNodes(nodes, out = []) {
  for (const node of nodes) {
    out.push(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      collectNodes(node.children, out);
    }
  }
  return out;
}

function configRoutingTransport(cfg) {
  const consume = readFixture("consumer-behavior-tree.json");
  const areas = readFixture("areas-tree.json");
  return async (opts) => {
    if (opts.url.includes("get_select_kol_tags_config_v2")) return jsonResponse(cfg);
    if (opts.url.includes("consume_behavior")) return jsonResponse(consume);
    if (opts.url.includes("get_areas")) return jsonResponse(areas);
    return cappedSearchResponse;
  };
}

test("status channel reports the base module and schema version", async (t) => {
  const { ipcMain, disposeIpc } = createHarness({ t, transportImpl: async () => jsonResponse({ code: 0, data: { kols: [], total: 0 }, msg: "" }) });
  try {
    const status = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.status)();
    assert.equal(status.ok, true);
    assert.equal(status.data.module, "pgy-kol");
    assert.equal(status.data.phase, 5);
    assert.equal(typeof status.data.schemaVersion, "string");
  } finally {
    disposeIpc();
  }
});

test("search-first-page 走官网点击搜索链路：track 先行 → trackId 进入 v2（同一 payload、同一会话/签名）", async (t) => {
  const { ipcMain, calls, fakeSession, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, { gender: "男", location: [{ path: " 广东 " }] });
    assert.equal(result.ok, true);
    assert.equal(result.data.total, 5000);
    assert.equal(result.data.capSignal.capped, true);
    assert.equal(result.data.capSignal.exactTotalNotProven, true);
    assert.ok(result.data.quarantinedFields.includes("unknownFieldA"), "unknown response fields must be quarantined");

    assert.equal(calls.length, 2, "点击搜索必须 track + v2 两次请求");
    const trackCall = calls[0];
    const v2Call = calls[1];
    assert.ok(trackCall.url.endsWith("/api/solar/cooperator/blogger/track"), "first call must hit blogger/track");
    assert.ok(v2Call.url.endsWith("/api/solar/cooperator/blogger/v2"), "second call must hit blogger/v2");
    for (const call of [trackCall, v2Call]) {
      assert.equal(call.method, "POST");
      assert.equal(call.session, fakeSession, "session must be the shared Electron session");
      assert.equal(call.headers["X-Extra"], "h1");
      assert.equal(call.headers["X-s"], "sig-value");
      assert.equal(call.headers["X-t"], "123456");
      assert.match(call.headers["Content-Type"] ?? "", /application\/json/);
    }
    const trackBody = JSON.parse(trackCall.body);
    const v2Body = JSON.parse(v2Call.body);
    assert.equal(trackBody.gender, "男");
    assert.equal(trackBody.location[0], "广东", "location must be path-trim serialized");
    assert.equal(trackBody.brandUserId, undefined, "no brandUserId without explicit selection");
    assert.ok(trackBody.trackId, "trackId must be present");
    assert.equal(trackBody.pageNum, 1);
    assert.equal(trackBody.pageSize, 20);
    // track 未返回 trackId（测试响应为 v2 形状）时 v2 沿用同一 payload 的 trackId。
    assert.equal(v2Body.trackId, trackBody.trackId);
    assert.deepEqual(v2Body, trackBody);
  } finally {
    disposeIpc();
  }
});

test("search-first-page：track 返回 trackId 时 v2 使用该 trackId（官网契约）", async (t) => {
  const trackResponse = jsonResponse({
    code: 0,
    data: { trackId: "track-real-001" },
    msg: "",
  });
  const { ipcMain, calls, disposeIpc } = createHarness({
    t,
    transportImpl: async (opts) => (opts.url.endsWith("/track") ? trackResponse : cappedSearchResponse),
  });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, {});
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
    const v2Body = JSON.parse(calls[1].body);
    assert.equal(v2Body.trackId, "track-real-001", "v2 必须携带 track 返回的 trackId");
    assert.equal(result.data.trackIdReturned, "track-real-001");
    assert.equal(result.data.trackRawShape, "data-trackId");
  } finally {
    disposeIpc();
  }
});

test("search-first-page：track 返回 data 字符串时直接作为 trackId", async (t) => {
  const trackResponse = jsonResponse({ code: 0, data: "track-string-002", msg: "" });
  const { ipcMain, calls, disposeIpc } = createHarness({
    t,
    transportImpl: async (opts) => (opts.url.endsWith("/track") ? trackResponse : cappedSearchResponse),
  });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, {});
    assert.equal(result.ok, true);
    const v2Body = JSON.parse(calls[1].body);
    assert.equal(v2Body.trackId, "track-string-002");
    assert.equal(result.data.trackRawShape, "data-string");
  } finally {
    disposeIpc();
  }
});

test("search-first-page：track 无 trackId 时回退随机 trackId，不伪造官网返回值", async (t) => {
  const trackResponse = jsonResponse({ code: 0, data: {}, msg: "" });
  const { ipcMain, calls, disposeIpc } = createHarness({
    t,
    transportImpl: async (opts) => (opts.url.endsWith("/track") ? trackResponse : cappedSearchResponse),
  });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, {});
    assert.equal(result.ok, true);
    assert.equal(result.data.trackIdReturned, null);
    const v2Body = JSON.parse(calls[1].body);
    assert.ok(v2Body.trackId && v2Body.trackId.length > 0, "v2 必须仍带非空 trackId（随机回退）");
  } finally {
    disposeIpc();
  }
});

test("search-first-page：关键词链路——searchType/keyword 进入 track 与 v2", async (t) => {
  const trackResponse = jsonResponse({ code: 0, data: { trackId: "track-kw-003" }, msg: "" });
  const { ipcMain, calls, disposeIpc } = createHarness({
    t,
    transportImpl: async (opts) => (opts.url.endsWith("/track") ? trackResponse : cappedSearchResponse),
  });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)(
      {},
      { searchType: 1, keyword: "  口红测评  " },
    );
    assert.equal(result.ok, true);
    for (const call of calls) {
      const body = JSON.parse(call.body);
      assert.equal(body.searchType, 1, "搜笔记 searchType=1");
      assert.equal(body.keyword, "口红测评", "keyword 必须 trim 后进入 payload");
    }
  } finally {
    disposeIpc();
  }
});

test("service.searchFirstPage：pageNum/pageSize 与 builder 同口径——null 用默认，非法值抛 invalid-state", async (t) => {
  const { service, calls, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const nulls = await service.searchFirstPage({ filterState: {}, pageNum: null, pageSize: null });
    assert.equal(nulls.pageNum, 1, "pageNum=null 必须回落默认 1");
    assert.equal(nulls.pageSize, 20, "pageSize=null 必须回落默认 20");
    assert.equal(calls.length, 2, "一次成功搜索 = track + v2");

    await assert.rejects(
      service.searchFirstPage({ filterState: {}, pageSize: 500 }),
      (err) => err instanceof PgyPayloadError && err.kind === "invalid-state",
      "pageSize=500 必须抛 invalid-state",
    );
    await assert.rejects(
      service.searchFirstPage({ filterState: {}, pageNum: 0 }),
      (err) => err instanceof PgyPayloadError && err.kind === "invalid-state",
      "pageNum=0 必须抛 invalid-state",
    );
    await assert.rejects(
      service.searchFirstPage({ filterState: {}, pageNum: 1.5 }),
      (err) => err instanceof PgyPayloadError && err.kind === "invalid-state",
      "pageNum=1.5 必须抛 invalid-state",
    );
    assert.equal(calls.length, 2, "非法分页参数不得发起额外网络请求");
  } finally {
    disposeIpc();
  }
});

test("unknown filter fields fail explicitly instead of being sent", async (t) => {
  const { ipcMain, calls, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, { notAField: "x" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "unknown-field");
    assert.equal(calls.length, 0, "no network call must be made for invalid filter state");
  } finally {
    disposeIpc();
  }
});

test("auth-expired codes surface as explicit IPC errors, never as an empty success list", async (t) => {
  const { ipcMain, disposeIpc } = createHarness({
    t,
    transportImpl: async () => jsonResponse({ code: 902, msg: "登录失效", data: null }),
  });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, {});
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "auth-expired");
    assert.equal(result.error.pgyCode, 902);
  } finally {
    disposeIpc();
  }
});

test("schema-status reports last-known-good availability per provider", async (t) => {
  const { ipcMain, disposeIpc } = createHarness({ t, transportImpl: async () => jsonResponse({ code: 0, data: { kols: [], total: 0 }, msg: "" }) });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.schemaStatus)();
    assert.equal(result.ok, true);
    for (const provider of [
      "kolTagsV2.automotiveIndustryTag",
      "kolTagsV2.audience20",
      "kolTagsV2.contentTheme",
      "areas",
      "consumeBehavior",
      "activities",
      "contentTagTree",
    ]) {
      assert.ok(provider in result.data.lkg, `lkg status must include ${provider}`);
    }
  } finally {
    disposeIpc();
  }
});

test("dispose removes the read-only channels", (t) => {
  const { ipcMain, disposeIpc } = createHarness({ t, transportImpl: async () => jsonResponse({ code: 0, data: { kols: [], total: 0 }, msg: "" }) });
  disposeIpc();
  for (const channel of Object.values(PGY_KOL_IPC_CHANNELS)) {
    assert.equal(ipcMain.handlers.has(channel), false, `${channel} must be removed`);
  }
});

test("status channel wraps handler errors like the other channels", async () => {
  const ipcMain = createFakeIpcMain();
  const disposeIpc = registerPgyKolIpc({
    ipcMain,
    service: {
      status() {
        throw new Error("status boom");
      },
    },
  });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.status)();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "unknown");
  } finally {
    disposeIpc();
  }
});

test("IPC error payloads are redacted even for non-request errors", async () => {
  const ipcMain = createFakeIpcMain();
  const disposeIpc = registerPgyKolIpc({
    ipcMain,
    service: {
      status: () => ({ ok: true }),
      schemaStatus: async () => ({}),
      async searchFirstPage() {
        throw new Error("leak Cookie=super-secret-xyz-001");
      },
    },
  });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, {});
    assert.equal(result.ok, false);
    assert.ok(!result.error.message.includes("super-secret-xyz-001"), "IPC error must not leak secret values");
  } finally {
    disposeIpc();
  }
});

test("non-object filterState is rejected by the IPC boundary", async (t) => {
  const { ipcMain, calls, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, ["not", "an", "object"]);
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0, "非对象筛选状态不得触发网络请求");
  } finally {
    disposeIpc();
  }
});

test("schema-status without an LKG store still reports empty availability", async () => {
  const ipcMain = createFakeIpcMain();
  const service = createPgyKolService({
    transport: async () => jsonResponse({ code: 0, data: { kols: [], total: 0 }, msg: "" }),
    getHeaders: () => ({}),
    sessionProvider: () => ({ kind: "fake-session" }),
  });
  const disposeIpc = registerPgyKolIpc({ ipcMain, service });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.schemaStatus)();
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.lkg, {});
  } finally {
    disposeIpc();
  }
});

test("PGY_KOL_IPC_CHANNELS 契约：5 个只读通道 + Phase 4 批量通道", () => {
  assert.deepEqual(Object.values(PGY_KOL_IPC_CHANNELS), [
    "pgy-kol:status",
    "pgy-kol:schema-status",
    "pgy-kol:search-first-page",
    "pgy-kol:config",
    "pgy-kol:payload-preview",
    "pgy-kol:batch-start",
    "pgy-kol:batch-list",
    "pgy-kol:batch-get",
    "pgy-kol:batch-pause",
    "pgy-kol:batch-resume",
    "pgy-kol:batch-cancel",
    "pgy-kol:batch-export",
    "pgy-kol:columns",
    "pgy-kol:batch-event",
  ]);
});

test("config channel：kolTagsV2 section live 加载，节点剥离 rawVersion 且保留 uniqueKey", async (t) => {
  const cfg = readFixture("kol-tags-v2-config.json");
  const { ipcMain, disposeIpc } = createHarness({ t, transportImpl: configRoutingTransport(cfg) });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.config)(
      {},
      { provider: "kolTagsV2", section: "automotiveIndustryTag" },
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.source, "live");
    assert.equal(typeof result.data.version, "string");
    assert.equal(result.data.warning, undefined);
    assert.ok(Array.isArray(result.data.nodes));
    const all = collectNodes(result.data.nodes);
    assert.ok(all.some((node) => node.value === "19188199"), "示例叶子 19188199 必须存在");
    for (const node of all) {
      assert.ok(!("rawVersion" in node), "rawVersion 不得返回给渲染进程");
      assert.ok("uniqueKey" in node, "uniqueKey 必须保留");
      assert.ok("fullPath" in node && "payloadField" in node && "children" in node);
    }
    assert.equal(all[0].payloadField, "industrySpecificCrowdsMotorDom");
  } finally {
    disposeIpc();
  }
});

test("config channel：consumeBehavior / areas 合法加载，section 省略", async (t) => {
  const cfg = readFixture("kol-tags-v2-config.json");
  const { ipcMain, disposeIpc } = createHarness({ t, transportImpl: configRoutingTransport(cfg) });
  try {
    const consume = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.config)({}, { provider: "consumeBehavior" });
    assert.equal(consume.ok, true);
    assert.equal(consume.data.nodes[0].payloadField, "kolInfoConsumBehaviorLabel");
    assert.ok(!("rawVersion" in consume.data.nodes[0]));

    const areas = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.config)({}, { provider: "areas" });
    assert.equal(areas.ok, true);
    assert.equal(areas.data.nodes[0].value, "中国");
    assert.equal(areas.data.nodes[0].children[0].fullPath, "中国 > 广东");
    assert.ok(!("rawVersion" in areas.data.nodes[0]));
  } finally {
    disposeIpc();
  }
});

test("config channel：白名单外 provider/section 组合被入口拒绝，不发网络请求", async (t) => {
  const cfg = readFixture("kol-tags-v2-config.json");
  const { ipcMain, calls, disposeIpc } = createHarness({ t, transportImpl: configRoutingTransport(cfg) });
  try {
    const cases = [
      [{ provider: "bogus" }, "unknown-provider"],
      [{ provider: "kolTagsV2" }, "unknown-section"],
      [{ provider: "kolTagsV2", section: "nope" }, "unknown-section"],
      [{ provider: "areas", section: "x" }, "unknown-section"],
      [{ provider: "consumeBehavior", section: "x" }, "unknown-section"],
      [null, "invalid-input"],
      [{ provider: 123 }, "invalid-input"],
      [{ provider: "kolTagsV2", section: "y".repeat(65) }, "invalid-input"],
    ];
    for (const [input, code] of cases) {
      const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.config)({}, input);
      assert.equal(result.ok, false, JSON.stringify(input));
      assert.equal(result.error.code, code, JSON.stringify(input));
    }
    assert.equal(calls.length, 0, "非法 config 请求不得触发网络调用");
  } finally {
    disposeIpc();
  }
});

test("config channel：请求失败且有 LKG 快照 → source=lkg + warning，rawVersion 仍剥离", async (t) => {
  const { service, ipcMain, disposeIpc } = createHarness({
    t,
    transportImpl: async () => {
      throw new Error("network down");
    },
  });
  try {
    await service.schema.lkgStore.save("kolTagsV2.automotiveIndustryTag", {
      version: SCHEMA_VERSION,
      provider: "kolTagsV2.automotiveIndustryTag",
      savedAt: "2026-08-04T00:00:00.000Z",
      nodes: [
        {
          provider: "kolTagsV2",
          payloadField: "industrySpecificCrowdsMotorDom",
          value: "1001",
          label: "日化家清",
          fullPath: "日化家清",
          path: "日化家清",
          children: [],
          disabled: false,
          uniqueKey: "industrySpecificCrowdsMotorDom:1001:日化家清",
          rawVersion: { value: 1001, label: "日化家清" },
        },
      ],
    });
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.config)(
      {},
      { provider: "kolTagsV2", section: "automotiveIndustryTag" },
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.source, "lkg");
    assert.ok(typeof result.data.warning === "string" && result.data.warning.length > 0);
    assert.equal(result.data.nodes[0].value, "1001");
    assert.ok(!("rawVersion" in result.data.nodes[0]), "LKG 回退路径也必须剥离 rawVersion");
  } finally {
    disposeIpc();
  }
});

test("config channel：902 登录失效不得伪装成 LKG 成功", async (t) => {
  const { service, ipcMain, disposeIpc } = createHarness({
    t,
    transportImpl: async () => jsonResponse({ code: 902, msg: "登录失效", data: null }),
  });
  try {
    await service.schema.lkgStore.save("kolTagsV2", {
      version: SCHEMA_VERSION,
      provider: "kolTagsV2",
      savedAt: "2026-08-04T00:00:00.000Z",
      nodes: [],
    });
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.config)(
      {},
      { provider: "kolTagsV2", section: "automotiveIndustryTag" },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "provider");
    assert.match(result.error.message, /不回退 last-known-good/);
  } finally {
    disposeIpc();
  }
});

test("config channel：请求失败且无 LKG → 明确错误，不返回空成功", async (t) => {
  const { ipcMain, disposeIpc } = createHarness({
    t,
    transportImpl: async () => {
      throw new Error("network down");
    },
  });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.config)(
      {},
      { provider: "consumeBehavior" },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "provider");
  } finally {
    disposeIpc();
  }
});

test("payload-preview channel：返回纯 JSON payload 与默认分页，绝不发网络请求", async (t) => {
  const { ipcMain, calls, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.payloadPreview)(
      {},
      { gender: "男", location: [{ path: " 广东 " }] },
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.payload.gender, "男");
    assert.deepEqual(result.data.payload.location, ["广东"], "location 必须 path-trim 序列化");
    assert.equal(result.data.pageNum, 1);
    assert.equal(result.data.pageSize, 20);
    assert.ok(typeof result.data.trackId === "string" && result.data.trackId.length > 0);
    assert.ok(!("cookie" in result.data.payload), "payload 不得含凭据键");
    assert.ok(!("authorization" in result.data.payload), "payload 不得含凭据键");
    assert.equal(calls.length, 0, "payload-preview 绝不发网络请求");
  } finally {
    disposeIpc();
  }
});

test("payload-preview channel：未实证字段允许预览（allowUnproven），真实搜索/采集被门控拒绝", async (t) => {
  const { ipcMain, calls, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    // 预览：未实证字段（contentTag）序列化展示，不发网络请求。
    const preview = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.payloadPreview)(
      {},
      { contentTag: ["美妆", "母婴"] },
    );
    assert.equal(preview.ok, true);
    assert.deepEqual(preview.data.payload.contentTag, ["美妆", "母婴"]);
    assert.equal(calls.length, 0, "预览绝不发网络请求");

    // 真实搜索：未实证字段必须拒绝，且不发任何请求（track/v2 都不发）。
    const search = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)(
      {},
      { contentTag: ["美妆"] },
    );
    assert.equal(search.ok, false);
    assert.equal(search.error.code, "unproven-field");
    assert.match(search.error.message, /尚未经官网真实流量实证/);
    assert.equal(calls.length, 0, "未实证字段不得触发 track/v2 请求");

  } finally {
    disposeIpc();
  }
});

test("batch-start：未实证字段被门控拒绝，不发 track/分页请求", async (t) => {
  const { ipcMain, disposeIpc } = createBatchHarness({
    t,
    transportImpl: async () => jsonResponse({ code: 0, data: { kols: [], total: 0 }, msg: "" }),
  });
  try {
    const batch = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: { contentTag: ["美妆"] },
      columns: ["userId"],
    });
    assert.equal(batch.ok, false);
    assert.equal(batch.error.code, "unproven-field");
  } finally {
    disposeIpc();
  }
});

test("batch-start：关键词搜索——track 先行、trackId 持久化、分页请求复用搜索上下文", async (t) => {
  const bodies = [];
  const { ipcMain, service, disposeIpc } = createBatchHarness({
    t,
    transportImpl: async (opts) => {
      const body = JSON.parse(opts.body);
      bodies.push({ url: opts.url, body });
      if (opts.url.endsWith("/track")) {
        return jsonResponse({ code: 0, data: { trackId: "track-batch-001" }, msg: "" });
      }
      const page = body.pageNum;
      const kols = Array.from({ length: 20 }, (_, index) => ({
        userId: `kw-u-${(page - 1) * 20 + index + 1}`,
        nickname: `n${(page - 1) * 20 + index + 1}`,
      }));
      return jsonResponse({ code: 0, data: { kols, total: 25 }, msg: "" });
    },
  });
  try {
    const start = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: { searchType: 0, keyword: "  李佳琦  " },
      columns: ["userId"],
    });
    assert.equal(start.ok, true);
    await waitForTaskStatus(service, start.data.taskId, ["completed"]);

    const task = await service.batchGet({ taskId: start.data.taskId });
    assert.equal(task.filterState.keyword, "李佳琦", "keyword 必须 trim 后持久化");
    assert.equal(task.filterState.searchType, 0, "searchType 必须持久化");
    assert.equal(task.filterState.trackId, "track-batch-001", "trackId 必须随任务持久化");

    const trackCall = bodies.find((call) => call.url.endsWith("/track"));
    assert.ok(trackCall, "批量关键词任务必须先发 track");
    assert.equal(trackCall.body.keyword, "李佳琦");
    assert.equal(trackCall.body.searchType, 0);
    const v2Calls = bodies.filter((call) => call.url.endsWith("/v2"));
    assert.ok(v2Calls.length >= 2, "关键词任务分页请求正常进行");
    for (const call of v2Calls) {
      assert.equal(call.body.trackId, "track-batch-001", "分页请求必须复用搜索 trackId");
      assert.equal(call.body.keyword, "李佳琦", "分页请求必须携带关键词");
    }
  } finally {
    disposeIpc();
  }
});

test("search-first-page：searchType/keyword/trackId 边界校验（非法值不发请求）", async (t) => {
  const { ipcMain, calls, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const cases = [
      [{ searchType: 2 }, "invalid-search-type"],
      [{ searchType: "1" }, "invalid-search-type"],
      [{ keyword: "x".repeat(201) }, "invalid-keyword"],
      [{ keyword: "a\nb" }, "invalid-keyword"],
      [{ keyword: "a\u0000b" }, "invalid-keyword"],
      [{ trackId: "../escape" }, "invalid-track-id"],
      [{ trackId: 42 }, "invalid-track-id"],
    ];
    for (const [input, code] of cases) {
      const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, input);
      assert.equal(result.ok, false, JSON.stringify(input));
      assert.equal(result.error.code, code, JSON.stringify(input));
    }
    assert.equal(calls.length, 0, "非法搜索上下文不得触发网络请求");
  } finally {
    disposeIpc();
  }
});

test("payload-preview channel：入口边界全部拒绝，不发网络请求", async (t) => {
  const { ipcMain, calls, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const tooDeep = { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } };
    const tooLongArray = { tags: Array(201).fill("x") };
    const tooLongString = { a: "x".repeat(513) };
    const tooManyFields = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, 1]));
    const cases = [
      [null, "invalid-input"],
      [undefined, "invalid-input"],
      [[1, 2], "invalid-input"],
      ["nope", "invalid-input"],
      [tooDeep, "too-deep"],
      [tooLongArray, "array-too-long"],
      [tooLongString, "string-too-long"],
      [tooManyFields, "too-many-fields"],
      [{ bogusField: 1 }, "unknown-field"],
    ];
    for (const [input, code] of cases) {
      const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.payloadPreview)({}, input);
      assert.equal(result.ok, false, JSON.stringify(input));
      assert.equal(result.error.code, code, JSON.stringify(input));
    }
    assert.equal(calls.length, 0, "非法 preview 请求不得触发网络调用");
  } finally {
    disposeIpc();
  }
});

test("search-first-page channel：入口边界与 payload-preview 一致，超限拒绝且不发网络请求", async (t) => {
  const { ipcMain, calls, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const tooDeep = { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } };
    const tooLongArray = { tags: Array(201).fill("x") };
    const tooLongString = { a: "x".repeat(513) };
    for (const input of [null, undefined, [1, 2], "nope", tooDeep, tooLongArray, tooLongString]) {
      const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, input);
      assert.equal(result.ok, false, String(JSON.stringify(input) ?? input).slice(0, 60));
      assert.ok(result.error.code, "must carry an error code");
    }
    assert.equal(calls.length, 0, "非法搜索请求不得触发网络调用");
  } finally {
    disposeIpc();
  }
});

test("IPC 入口校验异常也统一返回 ok:false（Proxy getter 抛错不绕过错误封装）", async (t) => {
  const { ipcMain, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const evil = new Proxy(
      { a: 1 },
      {
        get() {
          throw new Error("getter boom");
        },
      },
    );
    for (const channel of [PGY_KOL_IPC_CHANNELS.searchFirstPage, PGY_KOL_IPC_CHANNELS.payloadPreview]) {
      const result = await ipcMain.handlers.get(channel)({}, evil);
      assert.equal(result.ok, false, channel);
      assert.ok(result.error && result.error.code, channel);
    }
  } finally {
    disposeIpc();
  }
});

// ---------- Phase 4 批量采集 IPC ----------

function createBatchHarness({ transportImpl, t, broadcast }) {
  const ipcMain = createFakeIpcMain();
  const taskBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "pgy-kol-batch-ipc-"));
  if (t) {
    t.after(() => fs.rmSync(taskBaseDir, { recursive: true, force: true }));
  }
  const service = createPgyKolService({
    transport: transportImpl,
    getHeaders: () => ({}),
    sign: () => ({ "X-s": "sig", "X-t": 1 }),
    sessionProvider: () => ({ kind: "fake-session" }),
    baseDir: taskBaseDir,
    taskBaseDir,
  });
  const receivedEvents = [];
  const disposeIpc = registerPgyKolIpc({
    ipcMain,
    service,
    broadcast: broadcast ?? ((channel, payload) => receivedEvents.push({ channel, payload })),
  });
  return { ipcMain, service, taskBaseDir, disposeIpc, receivedEvents };
}

function twoPageTransport(total = 25) {
  return async (opts) => {
    const payload = JSON.parse(opts.body);
    const page = payload.pageNum;
    const startIndex = (page - 1) * 20;
    const count = Math.min(20, total - startIndex);
    const rows = Array.from({ length: count }, (_, index) => ({
      userId: `batch-u-${startIndex + index + 1}`,
      nickname: `博主${startIndex + index + 1}`,
      fansNum: 1000 + startIndex + index,
    }));
    return jsonResponse({ code: 0, data: { kols: rows, total }, msg: "" });
  };
}

async function waitForTaskStatus(service, taskId, statuses, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const task = await service.batchGet({ taskId });
    if (statuses.includes(task.status)) {
      // finalize 先写 status 再写 completeness（两写之间有空窗）：
      // completed/incomplete 必须等完整性落定，避免断言到中间态。
      const settled =
        task.status === "completed"
          ? task.completeness === "complete"
          : task.status === "incomplete"
            ? task.completeness === "cannot-prove"
            : true;
      if (settled) {
        return task;
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`等待任务状态超时: ${task.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

test("batch-start/list/get/export：两页任务完成、完整性与全量导出 Payload", async (t) => {
  const { ipcMain, service, disposeIpc, receivedEvents } = createBatchHarness({
    t,
    transportImpl: twoPageTransport(35),
  });
  try {
    const start = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: { gender: "女", fansNumberLower: 10000, fansNumberUpper: 50000 },
      columns: ["userId", "nickname", "fansNum"],
    });
    assert.equal(start.ok, true);
    assert.match(start.data.taskId, /^pgykol-[A-Za-z0-9_-]+$/);

    let task = await waitForTaskStatus(service, start.data.taskId, ["completed"]);
    // finalize 顺序为 status → completeness（两写之间有空窗），等完整性落定。
    for (let i = 0; i < 40 && task.completeness === "not-started"; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      task = await service.batchGet({ taskId: start.data.taskId });
    }
    assert.equal(task.status, "completed");
    assert.equal(task.completeness, "complete");
    assert.equal(task.counts.raw, 35);
    assert.equal(task.counts.unique, 35);
    assert.equal(task.counts.dup, 0);
    assert.equal(task.counts.missingUid, 0);

    // 事件推送：至少收到 progress 与 done（done 在状态翻转后微秒级到达，轮询等待）。
    assert.ok(receivedEvents.some((event) => event.channel === PGY_KOL_IPC_CHANNELS.batchEvent && event.payload.type === "progress"));
    let sawDone = receivedEvents.some((event) => event.channel === PGY_KOL_IPC_CHANNELS.batchEvent && event.payload.type === "done");
    for (let i = 0; i < 40 && !sawDone; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      sawDone = receivedEvents.some((event) => event.channel === PGY_KOL_IPC_CHANNELS.batchEvent && event.payload.type === "done");
    }
    assert.ok(sawDone, "必须收到 done 事件");

    const list = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchList)();
    assert.equal(list.ok, true);
    assert.ok(list.data.some((item) => item.taskId === start.data.taskId));

    const exported = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchExport)({}, { taskId: start.data.taskId });
    assert.equal(exported.ok, true);
    assert.equal(exported.data.mode, "two-row");
    assert.deepEqual(exported.data.headers.map((header) => header.key), ["userId", "nickname", "fansNum"]);
    assert.equal(exported.data.data.length, 35, "导出必须覆盖持久化全量行");
  } finally {
    disposeIpc();
  }
});

test("batch IPC 入参校验：未知列、非法 taskId、超预算全部拒绝", async (t) => {
  const { ipcMain, disposeIpc } = createBatchHarness({ t, transportImpl: twoPageTransport(5) });
  try {
    const unknownColumn = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: {},
      columns: ["userId", "cookie"],
    });
    assert.equal(unknownColumn.ok, false);
    assert.equal(unknownColumn.error.code, "unknown-column");

    const emptyColumns = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: {},
      columns: [],
    });
    assert.equal(emptyColumns.ok, false);
    assert.equal(emptyColumns.error.code, "invalid-columns");

    const badBudgets = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: {},
      columns: ["userId"],
      budgets: { queryBudget: 999999 },
    });
    assert.equal(badBudgets.ok, false);
    assert.equal(badBudgets.error.code, "invalid-budgets");

    for (const taskId of ["../escape", "CON", "", "a".repeat(97), "bad id"]) {
      const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchGet)({}, { taskId });
      assert.equal(result.ok, false, `taskId ${JSON.stringify(taskId)} must be rejected`);
      assert.equal(result.error.code, "invalid-task-id");
    }

    const badFilter = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: { notAField: "x" },
      columns: ["userId"],
    });
    assert.equal(badFilter.ok, false);
  } finally {
    disposeIpc();
  }
});

test("batchStart 快照规范化：Payload 形态值不二次序列化，节点形态值只序列化一次", async (t) => {
  // 回归：Phase 3 实证的 top20CrowdsLabel 叶子字符串（"自在户外 自在户外-挑战极限者"）
  // 已是 Payload 形态，若再次经过 top20-transform 会产生双重前缀
  // （"自在户外 自在户外-自在户外-挑战极限者"），真实接口返回 total=0。
  const bodies = [];
  const { ipcMain, service, disposeIpc } = createBatchHarness({
    t,
    transportImpl: async (opts) => {
      bodies.push(JSON.parse(opts.body));
      return jsonResponse({ code: 0, data: { kols: [], total: 0 }, msg: "" });
    },
  });
  try {
    const start = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: {
        gender: "女",
        fansNumberLower: 10000,
        fansNumberUpper: 50000,
        top20CrowdsLabel: ["自在户外 自在户外-挑战极限者"],
        contentThemeLabel: ["通用 干货分享"],
        location: [{ path: " 中国 广东 广州 ", children: [] }],
      },
      columns: ["userId", "nickname"],
    });
    assert.equal(start.ok, true);
    await waitForTaskStatus(service, start.data.taskId, ["completed"]);

    const task = await service.batchGet({ taskId: start.data.taskId });
    assert.deepEqual(task.filterState.top20CrowdsLabel, ["自在户外 自在户外-挑战极限者"], "Payload 形态的 top20 值必须原样保留");
    assert.deepEqual(task.filterState.contentThemeLabel, ["通用 干货分享"], "Payload 形态的内容题材值必须原样保留");
    assert.deepEqual(task.filterState.location, ["中国 广东 广州"], "节点形态的地域值必须序列化为空格路径数组");
    assert.equal(task.filterState.gender, "女");

    // 实际发出的请求体同样必须是单前缀（不经过二次序列化）。
    const firstBody = bodies.find((body) => body.top20CrowdsLabel);
    assert.ok(firstBody, "至少发过一次请求");
    assert.deepEqual(firstBody.top20CrowdsLabel, ["自在户外 自在户外-挑战极限者"]);
    assert.deepEqual(firstBody.location, ["中国 广东 广州"]);

    // 快照值清洗（fresh reviewer M2）：字符串值中的本地路径/敏感形态文本不得落盘。
    const start2 = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: { gender: "女 token=abc C:\\Users\\x\\secret" },
      columns: ["userId", "nickname"],
    });
    assert.equal(start2.ok, true);
    const task2 = await service.batchGet({ taskId: start2.data.taskId });
    assert.ok(
      !task2.filterState.gender.includes("C:\\Users"),
      `快照泄漏本地路径: ${task2.filterState.gender}`,
    );
    assert.ok(!task2.filterState.gender.includes("token=abc"), `快照泄漏敏感形态文本: ${task2.filterState.gender}`);
  } finally {
    disposeIpc();
  }
});

test("IPC 错误详情不得泄漏本地绝对路径（fresh reviewer M1）", async (t) => {
  const { ipcMain, service, taskBaseDir, disposeIpc } = createBatchHarness({
    t,
    transportImpl: twoPageTransport(5),
  });
  try {
    const start = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: {},
      columns: ["userId"],
    });
    assert.equal(start.ok, true);
    const taskId = start.data.taskId;
    // 破坏任务目录：目录替换为普通文件 → getTask 的 readJson 抛 ENOTDIR
    // （消息携带绝对路径），IPC 错误封装必须脱敏。
    const taskDir = path.join(taskBaseDir, taskId);
    fs.rmSync(taskDir, { recursive: true, force: true });
    fs.writeFileSync(taskDir, "not-a-dir", "utf8");

    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchGet)({}, { taskId });
    assert.equal(result.ok, false);
    assert.ok(result.error && typeof result.error.message === "string");
    assert.ok(
      !result.error.message.includes(taskBaseDir),
      `IPC 错误泄漏本地路径: ${result.error.message}`,
    );
    // 不允许出现任何盘符绝对路径形态（无论错误被吞为“任务不存在”还是脱敏后的 fs 错误）。
    assert.ok(
      !/[A-Za-z]:\\/.test(result.error.message),
      `IPC 错误仍包含盘符路径: ${result.error.message}`,
    );
  } finally {
    disposeIpc();
  }
});

test("batch-pause/resume/cancel 通道存在且作用于任务（transport gate 确定性时序）", async (t) => {
  // Phase 4.1 时序修复：不再用 fetchIndex + setTimeout(10) 轮询等待请求到达；
  // transport 为第 2/3 页提供显式 deferred 信号（entered），测试先 await
  // “请求已进入 transport”再执行 pause/cancel，再由测试放行（release）。
  // 仅保留一个较长的最终防死锁 timeout，不参与正常时序同步。
  const gates = new Map();
  function gateFor(pageNum) {
    let gate = gates.get(pageNum);
    if (!gate) {
      let enteredResolve = null;
      let releaseResolve = null;
      const entered = new Promise((resolve) => {
        enteredResolve = resolve;
      });
      const release = new Promise((resolve) => {
        releaseResolve = resolve;
      });
      gate = { entered, release, enteredResolve, releaseResolve };
      gates.set(pageNum, gate);
    }
    return gate;
  }
  const DEADLOCK_TIMEOUT_MS = 10000;
  const awaitGate = (gate, label) =>
    Promise.race([
      gate.entered,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} 等待 transport 信号超时（仅防死锁，不参与正常时序）`)),
          DEADLOCK_TIMEOUT_MS,
        ),
      ),
    ]);
  const secondGate = gateFor(2);
  const thirdGate = gateFor(3);
  const { ipcMain, service, disposeIpc } = createBatchHarness({
    t,
    transportImpl: async (opts) => {
      const payload = JSON.parse(opts.body);
      const page = payload.pageNum;
      if (page === 2 || page === 3) {
        const gate = gateFor(page);
        gate.enteredResolve();
        await gate.release;
      }
      const kols = Array.from({ length: 20 }, (_, index) => ({
        userId: `loop-u-${page}-${index + 1}`,
        nickname: `n${page}-${index + 1}`,
      }));
      return jsonResponse({ code: 0, data: { kols, total: 100 }, msg: "" });
    },
  });
  try {
    const start = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: {},
      columns: ["userId"],
      budgets: { queryBudget: 1000 },
    });
    assert.equal(start.ok, true);
    const taskId = start.data.taskId;

    // 第 1 页先行提交；await “第 2 页请求已进入 transport”后再暂停。
    await awaitGate(secondGate, "第 2 页请求");
    const paused = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchPause)({}, { taskId });
    assert.equal(paused.ok, true);
    secondGate.releaseResolve();
    const pausedTask = await waitForTaskStatus(service, taskId, ["paused"]);
    assert.equal(pausedTask.counts.raw, 40, "第 1、2 页提交后暂停");

    const resumed = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchResume)({}, { taskId });
    assert.equal(resumed.ok, true);
    // await “第 3 页请求已进入 transport”后再取消。
    await awaitGate(thirdGate, "第 3 页请求");
    const cancelled = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchCancel)({}, { taskId });
    assert.equal(cancelled.ok, true);
    thirdGate.releaseResolve();
    const cancelledTask = await waitForTaskStatus(service, taskId, ["cancelled"]);
    assert.equal(cancelledTask.counts.raw, 60, "第 3 页提交后取消，数据保留");

    const columns = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.columns)();
    assert.equal(columns.ok, true);
    assert.ok(columns.data.length >= 10, "columns 通道必须返回 confirmed 列数组");
    const defaults = columns.data.filter((column) => column.defaultDisplay === true).map((column) => column.id);
    // Phase 5：默认展示 = 官网当前账号默认 8 项（固定列 + 全部报价 + 粉丝数 +
    // 阅读/互动中位数（日常）+ 活跃粉丝占比）。
    assert.ok(defaults.includes("kolInfo"), "固定列 博主信息 必须默认展示");
    assert.ok(defaults.includes("fansNum"), "粉丝数 必须默认展示");
    assert.ok(defaults.includes("fansActiveIn28dLv"), "活跃粉丝占比 必须默认展示");
    assert.equal(defaults.length, 8);
  } finally {
    disposeIpc();
  }
});

test("batch-resume 携带 budgets：拒绝未增加/非法预算且不发请求，增加后从检查点继续", async (t) => {
  const pageNums = [];
  const { ipcMain, service, disposeIpc } = createBatchHarness({
    t,
    transportImpl: async (opts) => {
      const payload = JSON.parse(opts.body);
      pageNums.push(payload.pageNum);
      const startIndex = (payload.pageNum - 1) * 20;
      const kols = Array.from({ length: 20 }, (_, index) => ({
        userId: `bu-${startIndex + index + 1}`,
        nickname: `n${startIndex + index + 1}`,
      }));
      return jsonResponse({ code: 0, data: { kols, total: 100 }, msg: "" });
    },
  });
  try {
    const start = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchStart)({}, {
      filterState: {},
      columns: ["userId"],
      budgets: { queryBudget: 2 },
    });
    assert.equal(start.ok, true);
    const taskId = start.data.taskId;

    let task = await waitForTaskStatus(service, taskId, ["incomplete"]);
    assert.equal(task.completeness, "cannot-prove");
    assert.equal(task.summary.stopReason, "budget-exhausted");
    assert.deepEqual(pageNums, [1, 2], "极小预算 2 → 两页后预算耗尽");

    // 未增加 / 不带预算 / 超上限 / 非法字段 → 全部拒绝，不发请求。
    const equal = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchResume)({}, { taskId, budgets: { queryBudget: 2 } });
    assert.equal(equal.ok, false);
    assert.equal(equal.error.code, "budget-not-increased");
    const noBudgets = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchResume)({}, { taskId });
    assert.equal(noBudgets.ok, false);
    assert.equal(noBudgets.error.code, "invalid-budgets");
    const overCap = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchResume)({}, { taskId, budgets: { queryBudget: 1001 } });
    assert.equal(overCap.ok, false);
    assert.equal(overCap.error.code, "invalid-budgets");
    const unknownKey = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchResume)({}, { taskId, budgets: { queryBudget: 5, bogus: 1 } });
    assert.equal(unknownKey.ok, false);
    assert.equal(unknownKey.error.code, "invalid-budgets");
    assert.deepEqual(pageNums, [1, 2], "拒绝路径不得发出任何请求");

    // 严格增加 queryBudget → 从第 3 页继续，返回预算与已消费信息。
    const resumed = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.batchResume)({}, { taskId, budgets: { queryBudget: 5 } });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.data.status, "running");
    assert.equal(resumed.data.budgets.queryBudget, 5);
    assert.equal(resumed.data.budgetUsed, 2);

    task = await waitForTaskStatus(service, taskId, ["completed"]);
    assert.equal(task.completeness, "complete");
    assert.deepEqual(pageNums, [1, 2, 3, 4, 5], "从原检查点继续，已提交页不重抓");
    assert.equal(task.counts.raw, 100, "累计计数不清零");
    assert.equal(task.budgetUsed, 5, "预算消耗跨恢复累计");
    assert.equal(task.budgets.queryBudget, 5, "新预算必须持久化");
    assert.equal(task.taskId, start.data.taskId, "taskId 不得更换");
  } finally {
    disposeIpc();
  }
});
