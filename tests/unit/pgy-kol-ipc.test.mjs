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
    assert.equal(status.data.phase, 2);
    assert.equal(typeof status.data.schemaVersion, "string");
  } finally {
    disposeIpc();
  }
});

test("search-first-page POSTs a built payload over the shared session with signing and headers", async (t) => {
  const { ipcMain, calls, fakeSession, disposeIpc } = createHarness({ t, transportImpl: async () => cappedSearchResponse });
  try {
    const result = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.searchFirstPage)({}, { gender: "男", location: [{ path: " 广东 " }] });
    assert.equal(result.ok, true);
    assert.equal(result.data.total, 5000);
    assert.equal(result.data.capSignal.capped, true);
    assert.equal(result.data.capSignal.exactTotalNotProven, true);
    assert.ok(result.data.quarantinedFields.includes("unknownFieldA"), "unknown response fields must be quarantined");

    const call = calls[0];
    assert.ok(call.url.endsWith("/api/solar/cooperator/blogger/v2"), "search must hit blogger/v2");
    assert.equal(call.method, "POST");
    assert.equal(call.session, fakeSession, "session must be the shared Electron session");
    assert.equal(call.headers["X-Extra"], "h1");
    assert.equal(call.headers["X-s"], "sig-value");
    assert.equal(call.headers["X-t"], "123456");
    assert.match(call.headers["Content-Type"] ?? "", /application\/json/);
    const body = JSON.parse(call.body);
    assert.equal(body.gender, "男");
    assert.equal(body.location[0], "广东", "location must be path-trim serialized");
    assert.equal(body.brandUserId, undefined, "no brandUserId without explicit selection");
    assert.ok(body.trackId, "trackId must be present");
    assert.equal(body.pageNum, 1);
    assert.equal(body.pageSize, 20);
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
    assert.equal(calls.length, 1);

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
    assert.equal(calls.length, 1, "非法分页参数不得发起网络请求");
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

test("PGY_KOL_IPC_CHANNELS 契约：5 个只读通道", () => {
  assert.deepEqual(Object.values(PGY_KOL_IPC_CHANNELS), [
    "pgy-kol:status",
    "pgy-kol:schema-status",
    "pgy-kol:search-first-page",
    "pgy-kol:config",
    "pgy-kol:payload-preview",
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
      version: "pgy-filter-schema/1.0.0",
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
      version: "pgy-filter-schema/1.0.0",
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
