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

test("status channel reports the base module and schema version", async (t) => {
  const { ipcMain, disposeIpc } = createHarness({ t, transportImpl: async () => jsonResponse({ code: 0, data: { kols: [], total: 0 }, msg: "" }) });
  try {
    const status = await ipcMain.handlers.get(PGY_KOL_IPC_CHANNELS.status)();
    assert.equal(status.ok, true);
    assert.equal(status.data.module, "pgy-kol");
    assert.equal(status.data.phase, 1);
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
    for (const provider of ["kolTagsV2", "areas", "consumeBehavior"]) {
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
