import test from "node:test";
import assert from "node:assert/strict";

import {
  PGY_ORIGIN,
  PGY_AUTH_EXPIRED_CODES,
  PGY_RISK_CODES,
  PGY_HTTP_AUTH_STATUSES,
  PgyRequestError,
  PgySessionRequest,
} from "../../app-source/pgy-kol/pgy-session-request.mjs";

const FAKE_COOKIE = "secret-cookie-value-abc123";
const FAKE_AUTH = "Bearer secret-auth-token-abc456";
const FAKE_TOKEN = "secret-token-xyz789";

/** 记录型 fake transport：记录每次 opts，按序返回给定响应。 */
function createRecordingTransport(sequence = []) {
  const calls = [];
  const transport = async (opts) => {
    calls.push(opts);
    const next = sequence.shift();
    if (next === undefined) {
      return { statusCode: 200, data: JSON.stringify({ code: 0, data: null, msg: "ok" }) };
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  transport.calls = calls;
  return transport;
}

function normalizeOpts(opts) {
  const copy = { ...opts, headers: { ...opts.headers } };
  delete copy.headers["Content-Type"];
  delete copy.body;
  return copy;
}

test("导出契约：常量与集合精确匹配", () => {
  assert.equal(PGY_ORIGIN, "https://pgy.xiaohongshu.com");
  assert.deepEqual([...PGY_AUTH_EXPIRED_CODES].sort((a, b) => a - b), [-100, 401, 902]);
  assert.deepEqual([...PGY_RISK_CODES], [461]);
  assert.deepEqual([...PGY_HTTP_AUTH_STATUSES].sort((a, b) => a - b), [401, 461]);
});

test("POST JSON：body 序列化、Content-Type、session 透传、请求头合并、X-s/X-t、timeoutMs 透传", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ code: 0, data: { id: 1 }, msg: "ok" }) },
  ]);
  const client = new PgySessionRequest({
    transport,
    getHeaders: () => ({ "X-Platform": "desktop", "X-Trace": "t1" }),
    sign: (path, body) => {
      assert.equal(path, "/solar/pre-trade/note/kol/123");
      assert.deepEqual(body, { noteId: "abc" });
      return { "X-s": "sig-abc", "X-t": 1700000000000 };
    },
    timeoutMs: 5000,
    logger: { info() {}, warn() {}, error() {} },
  });
  const session = { cookieHeader: "fake-session" };

  const result = await client.requestJson({
    url: `${PGY_ORIGIN}/solar/pre-trade/note/kol/123`,
    method: "POST",
    body: { noteId: "abc" },
    session,
    headers: { "X-Custom": "c1" },
    timeoutMs: 9000,
  });

  assert.equal(transport.calls.length, 1);
  const opts = transport.calls[0];
  assert.equal(opts.url, `${PGY_ORIGIN}/solar/pre-trade/note/kol/123`);
  assert.equal(opts.method, "POST");
  assert.equal(opts.body, JSON.stringify({ noteId: "abc" }));
  assert.equal(opts.session, session);
  assert.equal(opts.timeoutMs, 9000);
  assert.equal(opts.headers["Content-Type"], "application/json;charset=UTF-8");
  assert.equal(opts.headers["X-Platform"], "desktop");
  assert.equal(opts.headers["X-Trace"], "t1");
  assert.equal(opts.headers["X-Custom"], "c1");
  assert.equal(opts.headers.referer, `${PGY_ORIGIN}/solar/pre-trade/note/kol`);
  assert.equal(opts.headers["Sec-Fetch-Mode"], "no-cors");
  assert.equal(opts.headers["X-s"], "sig-abc");
  assert.equal(opts.headers["X-t"], "1700000000000");

  assert.equal(result.httpStatusCode, 200);
  assert.equal(result.code, 0);
  assert.deepEqual(result.data, { id: 1 });
  assert.equal(result.msg, "ok");
  assert.deepEqual(result.raw, { code: 0, data: { id: 1 }, msg: "ok" });
});

test("无 body 的 GET：opts 无 body 键、无 Content-Type；与 POST 仅 method/body/Content-Type 不同", async () => {
  const url = `${PGY_ORIGIN}/solar/pre-trade/note/detail?noteId=abc123`;
  const referer = `${PGY_ORIGIN}/solar/pre-trade/note/kol`;
  const session = { cookieHeader: "fake-session" };
  const headers = { "X-Custom": "c1" };
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ code: 0, data: { id: 1 } }) },
    { statusCode: 200, data: JSON.stringify({ code: 0, data: { id: 1 } }) },
  ]);
  const client = new PgySessionRequest({
    transport,
    getHeaders: () => ({ "X-Platform": "desktop" }),
    sign: () => ({ "X-s": "sig", "X-t": 1 }),
  });

  await client.requestJson({ url, method: "GET", session, referer, headers });
  await client.requestJson({ url, method: "POST", body: { noteId: "abc123" }, session, referer, headers });

  assert.equal(transport.calls.length, 2);
  const [getOpts, postOpts] = transport.calls;

  assert.equal(getOpts.method, "GET");
  assert.ok(!("body" in getOpts));
  assert.equal(getOpts.headers["Content-Type"], undefined);
  assert.equal(getOpts.headers.referer, referer);
  assert.equal(getOpts.session, session);

  assert.equal(postOpts.method, "POST");
  assert.equal(postOpts.body, '{"noteId":"abc123"}');
  assert.equal(postOpts.headers["Content-Type"], "application/json;charset=UTF-8");

  const getNorm = normalizeOpts(getOpts);
  const postNorm = normalizeOpts(postOpts);
  getNorm.method = "NORMALIZED";
  postNorm.method = "NORMALIZED";
  assert.deepEqual(getNorm, postNorm);
});

test("HTTP 401 -> auth-expired", async () => {
  const transport = createRecordingTransport([{ statusCode: 401, data: "unauthorized" }]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/solar/pre-trade/note/kol` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "auth-expired");
      assert.equal(err.httpStatusCode, 401);
      assert.equal(err.pgyCode, null);
      return true;
    }
  );
});

test("HTTP 461 -> risk-control", async () => {
  const transport = createRecordingTransport([{ statusCode: 461, data: "risk" }]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "risk-control");
      assert.equal(err.httpStatusCode, 461);
      return true;
    }
  );
});

test("HTTP 403/500 等非 2xx（非 401/461）-> http 错误，不因 code=0 伪装成功", async () => {
  const request = new PgySessionRequest({ transport: async () => ({ statusCode: 500, data: JSON.stringify({ code: 0, data: { kols: [] }, msg: "网关兜底" }) }) });
  await assert.rejects(
    request.requestJson({ url: `${PGY_ORIGIN}/api/x`, method: "GET" }),
    (err) => err instanceof PgyRequestError && err.kind === "http" && err.httpStatusCode === 500,
  );
  const request403 = new PgySessionRequest({ transport: async () => ({ statusCode: 403, data: JSON.stringify({ code: 0, data: {}, msg: "" }) }) });
  await assert.rejects(
    request403.requestJson({ url: `${PGY_ORIGIN}/api/x`, method: "GET" }),
    (err) => err instanceof PgyRequestError && err.kind === "http" && err.httpStatusCode === 403,
  );
});

test("PgyRequestError.details 递归脱敏", () => {
  const err = new PgyRequestError({
    kind: "api",
    message: "ok message",
    details: { cookie: "secret-cookie-details-1", nested: { token: "secret-token-details-2" }, safe: "可见文本" },
  });
  assert.equal(err.details.cookie, "[redacted]");
  assert.equal(err.details.nested.token, "[redacted]");
  assert.equal(err.details.safe, "可见文本");
  assert.ok(!JSON.stringify(err.details).includes("secret-cookie-details-1"));
  assert.ok(!JSON.stringify(err.details).includes("secret-token-details-2"));
});

test("PGY code 902 -> auth-expired（携带 pgyCode）", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ code: 902, data: null, msg: "登录已过期" }) },
  ]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "auth-expired");
      assert.equal(err.pgyCode, 902);
      assert.equal(err.httpStatusCode, 200);
      return true;
    }
  );
});

test("PGY code 461 -> risk-control（携带 pgyCode）", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ code: 461, data: null, msg: "触发风控" }) },
  ]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "risk-control");
      assert.equal(err.pgyCode, 461);
      return true;
    }
  );
});

test("PGY code 500 -> api（携带 pgyCode=500）", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ code: 500, data: null, msg: "服务端错误" }) },
  ]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "api");
      assert.equal(err.pgyCode, 500);
      assert.equal(err.httpStatusCode, 200);
      return true;
    }
  );
});

test("JSON 解析失败 -> invalid-json", async () => {
  const transport = createRecordingTransport([{ statusCode: 200, data: "<html>not json</html>" }]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "invalid-json");
      assert.equal(err.httpStatusCode, 200);
      return true;
    }
  );
});

test("transport 抛含 timeout 的错误 -> timeout", async () => {
  const transport = async () => {
    throw new Error("request aborted due to timeout after 30000ms");
  };
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "timeout");
      assert.equal(err.httpStatusCode, null);
      assert.equal(err.pgyCode, null);
      return true;
    }
  );
});

test("transport 抛其它错误 -> transport", async () => {
  const transport = async () => {
    throw new Error("socket hang up");
  };
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "transport");
      return true;
    }
  );
});

test("getHeaders/sign 注入函数抛错时包装为脱敏 transport 错误", async () => {
  const request = new PgySessionRequest({
    transport: async () => ({ statusCode: 200, data: JSON.stringify({ code: 0, data: null, msg: "ok" }) }),
    getHeaders: () => {
      throw new Error("Cookie=super-secret-inject-1");
    },
    sign: () => ({ "X-s": "s", "X-t": 1 }),
  });
  await assert.rejects(
    request.requestJson({ url: `${PGY_ORIGIN}/x`, method: "POST", body: {} }),
    (err) =>
      err instanceof PgyRequestError &&
      err.kind === "transport" &&
      !err.message.includes("super-secret-inject-1"),
  );
  const signRequest = new PgySessionRequest({
    transport: async () => ({ statusCode: 200, data: JSON.stringify({ code: 0, data: null, msg: "ok" }) }),
    getHeaders: () => ({}),
    sign: () => {
      throw new Error("token=super-secret-inject-2");
    },
  });
  await assert.rejects(
    signRequest.requestJson({ url: `${PGY_ORIGIN}/x`, method: "POST", body: {} }),
    (err) =>
      err instanceof PgyRequestError &&
      err.kind === "transport" &&
      !err.message.includes("super-secret-inject-2"),
  );
});

test("raw.code 缺失（undefined）-> api 且 pgyCode 为 null", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ data: [] }) },
  ]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "api");
      assert.equal(err.pgyCode, null);
      return true;
    }
  );
});

test("空列表不静默：code=1 + data=[] 必须 throw", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ code: 1, data: [], msg: "无数据" }) },
  ]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "api");
      assert.equal(err.pgyCode, 1);
      return true;
    }
  );
});

test("raw 不是 object -> invalid-response", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify("not-an-object") },
  ]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "invalid-response");
      return true;
    }
  );
});

test("redactText：覆盖 key=value、\"key\":\"value\"、key: value 三种形态且不含假值", () => {
  const input = [
    `Cookie: ${FAKE_COOKIE}`,
    `Authorization: ${FAKE_AUTH}`,
    `"token":"${FAKE_TOKEN}"`,
    `token=${FAKE_TOKEN}`,
    `session=${FAKE_COOKIE}`,
    "x-plain=keep-me",
  ].join("\n");
  const out = PgySessionRequest.redactText(input);
  assert.ok(!out.includes(FAKE_COOKIE));
  assert.ok(!out.includes(FAKE_AUTH));
  assert.ok(!out.includes(FAKE_TOKEN));
  assert.ok(out.includes("[redacted]"));
  assert.ok(out.includes("x-plain=keep-me"));
});

test("redactText：x-s/x-t 签名头值同样脱敏", () => {
  const redacted = PgySessionRequest.redactText('X-s=abc-sig-123 X-t: 1700000000000 "x-t":"987654321"');
  assert.ok(!redacted.includes("abc-sig-123"), "X-s 值必须脱敏");
  assert.ok(!redacted.includes("1700000000000"), "X-t 值必须脱敏");
  assert.ok(!redacted.includes("987654321"), "JSON 形态的 x-t 值必须脱敏");
  assert.ok(redacted.includes("[redacted]"));
});

test("Phase 5：搜索关键词进入脱敏模式（keyword 不得写入普通日志/错误详情）", () => {
  const cases = [
    'keyword="口红测评"',
    'keyword=口红测评',
    "keyword: 口红测评",
    '{"payload":{"searchType":1,"keyword":"口红测评"}}',
  ];
  for (const input of cases) {
    const out = PgySessionRequest.redactText(input);
    assert.ok(!out.includes("口红测评"), `keyword 值必须脱敏: ${input}`);
    assert.ok(out.includes("[redacted]"), `必须留下脱敏标记: ${input}`);
  }
  // 非敏感形态的原文本（无 keyword 键）不受影响。
  const plain = PgySessionRequest.redactText("口红测评");
  assert.ok(plain.includes("口红测评"), "独立字符串（无 keyword 键）不得被误伤");
});

test("redactText：多段 Cookie 头整段脱敏，后续分段不泄漏", () => {
  const out = PgySessionRequest.redactText("Cookie: webId=abc; web_session=SECRET; b=2");
  assert.ok(!out.includes("abc"), "第一段 Cookie 值必须脱敏");
  assert.ok(!out.includes("SECRET"), "后续敏感段值必须脱敏");
  assert.ok(!out.includes("b=2"), "键名不敏感的后续 Cookie 段也必须被整段吞掉");
  const json = PgySessionRequest.redactText('{"cookie": "a=1; b=2"}');
  assert.ok(!json.includes("b=2"), "JSON 形态多段 Cookie 必须整体脱敏");
});

test("redactText：敏感键分号形态补强——值吞掉后续 ; 分段，非敏感赋值分段保留", () => {
  const colon = PgySessionRequest.redactText("session: SECRET; tail");
  assert.ok(!colon.includes("SECRET"), "session: 值中的 SECRET 必须脱敏");
  assert.ok(!colon.includes("tail"), "session: 值后的 ; 分段必须被吞掉，不能只脱敏第一段");

  const eq = PgySessionRequest.redactText("token=a; keep=1");
  assert.ok(!eq.includes("token=a"), "token= 值必须脱敏");
  assert.ok(eq.includes("keep=1"), "非敏感键赋值分段必须保留");

  const multiSensitive = PgySessionRequest.redactText("token=a; session=b; keep=1");
  assert.ok(!multiSensitive.includes("token=a"), "第一个敏感值必须脱敏");
  assert.ok(!multiSensitive.includes("session=b"), "后续敏感值必须脱敏");
  assert.ok(multiSensitive.includes("keep=1"), "非敏感分段保留");

  const colonEqMixed = PgySessionRequest.redactText("session: SECRET; token=x; keep=1");
  assert.ok(!colonEqMixed.includes("SECRET"), "冒号形态敏感值必须脱敏");
  assert.ok(!colonEqMixed.includes("token=x"), "后续敏感赋值必须脱敏");
  assert.ok(colonEqMixed.includes("keep=1"), "非敏感分段保留");
});

test("redactText：超长文本截断到 800 字符", () => {
  const long = `x=${"b".repeat(900)}`;
  const out = PgySessionRequest.redactText(long);
  assert.equal(out.length, 800);
});

test("redactHeaders：敏感键脱敏、保留普通键、返回新对象", () => {
  const original = {
    cookie: FAKE_COOKIE,
    Authorization: FAKE_AUTH,
    token: FAKE_TOKEN,
    "x-s": "sig-value",
    "X-t": 1700000000000,
    "X-Plain": "keep-me",
  };
  const out = PgySessionRequest.redactHeaders(original);
  assert.equal(out.cookie, "[redacted]");
  assert.equal(out.Authorization, "[redacted]");
  assert.equal(out.token, "[redacted]");
  assert.equal(out["x-s"], "[redacted]");
  assert.equal(out["X-t"], "[redacted]");
  assert.equal(out["X-Plain"], "keep-me");
  assert.ok(!JSON.stringify(out).includes(FAKE_COOKIE));
  assert.ok(!JSON.stringify(out).includes(FAKE_AUTH));
  assert.ok(!JSON.stringify(out).includes(FAKE_TOKEN));
  assert.notEqual(out, original);
  assert.equal(original.cookie, FAKE_COOKIE);
});

test("transport 错误消息经 redactText 脱敏", async () => {
  const transport = async () => {
    throw new Error(`net failure cookie=${FAKE_COOKIE}`);
  };
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "transport");
      assert.ok(!err.message.includes(FAKE_COOKIE));
      assert.match(err.message, /\[redacted\]/);
      return true;
    }
  );
});

test("API 错误消息经 redactText 脱敏", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ code: 500, msg: `token=${FAKE_TOKEN}`, data: null }) },
  ]);
  const client = new PgySessionRequest({ transport });
  await assert.rejects(
    client.requestJson({ url: `${PGY_ORIGIN}/x` }),
    (err) => {
      assert.ok(err instanceof PgyRequestError);
      assert.equal(err.kind, "api");
      assert.ok(!err.message.includes(FAKE_TOKEN));
      return true;
    }
  );
});

test("PgyRequestError 构造：字段与消息脱敏", () => {
  const err = new PgyRequestError({
    kind: "api",
    message: `cookie=${FAKE_COOKIE}`,
    httpStatusCode: 200,
    pgyCode: 500,
    details: { trace: "t-1" },
  });
  assert.equal(err.name, "PgyRequestError");
  assert.equal(err.kind, "api");
  assert.equal(err.httpStatusCode, 200);
  assert.equal(err.pgyCode, 500);
  assert.deepEqual(err.details, { trace: "t-1" });
  assert.ok(!err.message.includes(FAKE_COOKIE));
  assert.ok(err instanceof Error);
});

test("未提供 sign：不产生 X-s/X-t", async () => {
  const transport = createRecordingTransport();
  const client = new PgySessionRequest({ transport });
  await client.requestJson({ url: `${PGY_ORIGIN}/x`, method: "GET" });
  const opts = transport.calls[0];
  assert.equal(opts.headers["X-s"], undefined);
  assert.equal(opts.headers["X-t"], undefined);
});

test("调用方显式传 Content-Type 时不被覆盖", async () => {
  const transport = createRecordingTransport();
  const client = new PgySessionRequest({ transport });
  await client.requestJson({
    url: `${PGY_ORIGIN}/x`,
    method: "POST",
    body: { a: 1 },
    headers: { "Content-Type": "text/plain;charset=utf-8" },
  });
  assert.equal(transport.calls[0].headers["Content-Type"], "text/plain;charset=utf-8");
});

test("显式 referer 优先于默认值", async () => {
  const transport = createRecordingTransport();
  const client = new PgySessionRequest({ transport });
  await client.requestJson({
    url: `${PGY_ORIGIN}/x`,
    referer: "https://custom.example/page",
  });
  assert.equal(transport.calls[0].headers.referer, "https://custom.example/page");
});

test("timeoutMs 未传时使用构造默认值", async () => {
  const transport = createRecordingTransport();
  const client = new PgySessionRequest({ transport, timeoutMs: 12345 });
  await client.requestJson({ url: `${PGY_ORIGIN}/x` });
  assert.equal(transport.calls[0].timeoutMs, 12345);
});

test("成功返回结构：缺失的 data/msg 依原始值（undefined）", async () => {
  const transport = createRecordingTransport([
    { statusCode: 200, data: JSON.stringify({ code: 0 }) },
  ]);
  const client = new PgySessionRequest({ transport });
  const result = await client.requestJson({ url: `${PGY_ORIGIN}/x` });
  assert.equal(result.httpStatusCode, 200);
  assert.equal(result.code, 0);
  assert.equal(result.data, undefined);
  assert.equal(result.msg, undefined);
  assert.deepEqual(result.raw, { code: 0 });
});
