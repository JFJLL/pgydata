import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  KOL_SEARCH_ENDPOINT,
  KNOWN_KOL_FIELDS,
  PgyKolSearchClient,
} from "../../app-source/pgy-kol/pgy-kol-search-client.mjs";

const MODULE_URL = new URL("../../app-source/pgy-kol/pgy-kol-search-client.mjs", import.meta.url);
const loadFixture = async (name) =>
  JSON.parse(await readFile(new URL(`../fixtures/pgy-kol/${name}.json`, import.meta.url), "utf8"));

function makeClient(respond) {
  const calls = [];
  const client = new PgyKolSearchClient({
    request: {
      requestJson: async (options) => {
        calls.push(options);
        return respond(options);
      },
    },
  });
  return { client, calls };
}

test("searchPage 正确 POST：url/method/body/referer", async () => {
  const body = await loadFixture("search-first-page-normal");
  const payload = { pageNum: 1, pageSize: 20, trackId: "track-post-check" };
  const { client, calls } = makeClient(() => body);

  await client.searchPage({ payload });

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith(KOL_SEARCH_ENDPOINT), "url 必须以搜索接口路径结尾");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(calls[0].body, payload, "body 必须深等于传入 payload");
  assert.equal(calls[0].referer, "https://pgy.xiaohongshu.com/solar/pre-trade/note/kol");
});

test("成功返回：total/kols/uniqueUidCount 正确，未知字段隔离", async () => {
  const body = await loadFixture("search-first-page-capped");
  const { client } = makeClient(() => body);

  const result = await client.searchPage({ payload: { pageNum: 1, pageSize: 20 } });

  assert.equal(result.total, 5000);
  assert.equal(result.code, 0);
  assert.equal(result.pageNum, 1);
  assert.equal(result.pageSize, 20);
  assert.equal(result.kols.length, 20);
  assert.equal(result.uniqueUidCount, 20);
  assert.deepEqual(result.quarantinedFields, ["mengagementNum", "superSecretField"]);
  assert.ok(Object.hasOwn(result, "httpStatusCode"));
  assert.ok(Object.hasOwn(result, "trackId"));
  assert.ok(Object.hasOwn(result, "startedAt"));
  assert.ok(Object.hasOwn(result, "durationMs"));
  assert.ok(result.durationMs >= 0);

  for (const kol of result.kols) {
    assert.ok(Object.hasOwn(kol, "userId"), "kols 每项都必须保留 userId");
    for (const key of Object.keys(kol)) {
      assert.ok(KNOWN_KOL_FIELDS.includes(key), `未知字段 ${key} 不得出现在 kols`);
    }
  }
  assert.ok(
    result.kols.every((kol) => !("mengagementNum" in kol) && !("superSecretField" in kol)),
    "未知字段绝不进入 kols",
  );
  assert.deepEqual(result.kols.find((kol) => kol.userId === "kol_0003"), { userId: "kol_0003" });
  assert.equal(result.kols.find((kol) => kol.userId === "kol_0001").nickname, "虚构博主一号");
});

test("capSignal：total=5000 → total-window；total=4820 → 不触顶", async () => {
  const cappedBody = await loadFixture("search-first-page-capped");
  const normalBody = await loadFixture("search-first-page-normal");

  const cappedClient = makeClient(() => cappedBody).client;
  const capped = await cappedClient.searchPage({ payload: { pageNum: 1, pageSize: 20 } });
  assert.equal(capped.capSignal.capped, true);
  assert.equal(capped.capSignal.reason, "total-window");
  assert.equal(capped.capSignal.exactTotalNotProven, true);

  const normalClient = makeClient(() => normalBody).client;
  const normal = await normalClient.searchPage({ payload: { pageNum: 1, pageSize: 20 } });
  assert.equal(normal.capSignal.capped, false);
  assert.equal(normal.capSignal.reason, null);
  assert.equal(normal.capSignal.exactTotalNotProven, true);
});

test("capSignal：pageNum=250 且满页 → max-page-full", async () => {
  const cappedBody = await loadFixture("search-first-page-capped");
  const fullPageBody = { ...cappedBody, data: { ...cappedBody.data, total: 4820 } };
  const { client } = makeClient(() => fullPageBody);

  const result = await client.searchPage({ payload: { pageNum: 250, pageSize: 20 } });

  assert.equal(result.kols.length, 20);
  assert.equal(result.capSignal.capped, true);
  assert.equal(result.capSignal.reason, "max-page-full");
});

test("code 902/461/500：request 层错误原样抛出，绝不返回空列表", async () => {
  const errorCases = await loadFixture("search-error-cases");
  const kindByCode = { 902: "auth-expired", 461: "risk-control", 500: "api" };

  for (const { name, body } of errorCases.cases) {
    if (name === "bad-shape") {
      continue;
    }
    const expected = Object.assign(new Error(body.msg), {
      kind: kindByCode[body.code],
      pgyCode: body.code,
    });
    const client = new PgyKolSearchClient({
      request: {
        requestJson: async () => {
          throw expected;
        },
      },
    });
    await assert.rejects(
      client.searchPage({ payload: { pageNum: 1, pageSize: 20 } }),
      (err) => err === expected,
      `${name} 必须原样抛出 request 层错误`,
    );
  }
});

test("坏结构（kols 非数组）→ PgyRequestError kind invalid-response", async () => {
  const errorCases = await loadFixture("search-error-cases");
  const badShape = errorCases.cases.find((item) => item.name === "bad-shape");
  const { client } = makeClient(() => badShape.body);

  await assert.rejects(
    client.searchPage({ payload: { pageNum: 1, pageSize: 20 } }),
    (err) => err !== null && typeof err === "object" && err.kind === "invalid-response",
    "坏结构必须抛 invalid-response，而不是静默返回空列表",
  );
});

test("响应缺少 data.total → invalid-response，不静默返回", async () => {
  const { client } = makeClient(() => ({ code: 0, data: { kols: [{ userId: "kol_0001" }] }, msg: "" }));
  await assert.rejects(
    client.searchPage({ payload: { pageNum: 1, pageSize: 20 } }),
    (err) => err.kind === "invalid-response",
  );
});

test("data.total 为 NaN → invalid-response，不返回 NaN 总量", async () => {
  const { client } = makeClient(() => ({ code: 0, data: { kols: [], total: NaN }, msg: "" }));
  await assert.rejects(
    client.searchPage({ payload: { pageNum: 1, pageSize: 20 } }),
    (err) => err.kind === "invalid-response",
  );
});

test("kols 中存在非对象条目 → invalid-response，不静默转空行", async () => {
  const { client } = makeClient(() => ({
    code: 0,
    data: { kols: [{ userId: "kol_0001" }, null, "bad"], total: 20 },
    msg: "",
  }));
  await assert.rejects(
    client.searchPage({ payload: { pageNum: 1, pageSize: 20 } }),
    (err) => err.kind === "invalid-response",
  );
});

test("裸响应形态 code≠0 也显式报错（纵深防御），不返回空列表成功", async () => {
  const cases = [
    { code: 902, kind: "auth-expired" },
    { code: 461, kind: "risk-control" },
    { code: 500, kind: "api" },
  ];
  for (const { code, kind } of cases) {
    const { client } = makeClient(() => ({
      code,
      data: { kols: [], total: 0 },
      msg: "业务错误",
    }));
    await assert.rejects(
      client.searchPage({ payload: { pageNum: 1, pageSize: 20 } }),
      (err) => err.kind === kind && err.pgyCode === code,
      `code ${code} 必须抛 ${kind}`,
    );
  }
});

test("缺失 userId 的博主不计入 uniqueUidCount", async () => {
  const body = {
    code: 0,
    data: {
      kols: [
        { userId: "kol_9001", nickname: "有 id" },
        { nickname: "无 id", fansNum: 100 },
        { userId: "kol_9001", nickname: "重复 id" },
        { userId: "kol_9002" },
        { userId: "", nickname: "空 id" },
        { userId: "kol_9003", nickname: "第三个 id" },
      ],
      total: 900,
    },
    msg: "",
  };
  const { client } = makeClient(() => body);

  const result = await client.searchPage({ payload: { pageNum: 1, pageSize: 20 } });

  assert.equal(result.kols.length, 6);
  assert.equal(result.uniqueUidCount, 3, "kol_9001 去重后 + kol_9002 + kol_9003 = 3");
});

test("trackId：payload 提供时沿用，否则自生成", async () => {
  const body = await loadFixture("search-first-page-normal");
  const { client } = makeClient(() => body);

  const withTrack = await client.searchPage({
    payload: { pageNum: 1, pageSize: 20, trackId: "track-fixed" },
  });
  assert.equal(withTrack.trackId, "track-fixed");

  const generated = await client.searchPage({ payload: { pageNum: 1, pageSize: 20 } });
  assert.equal(typeof generated.trackId, "string");
  assert.ok(generated.trackId.length > 0);
  assert.notEqual(generated.trackId, "track-fixed");
});

test("requestJson 返回 { httpStatusCode, body } 包装时透传状态码", async () => {
  const body = await loadFixture("search-first-page-normal");
  const { client } = makeClient(() => ({ httpStatusCode: 200, body }));

  const result = await client.searchPage({ payload: { pageNum: 1, pageSize: 20 } });

  assert.equal(result.httpStatusCode, 200);
  assert.equal(result.total, 4820);
});

test("payload 非 object 时抛出 TypeError", async () => {
  const body = await loadFixture("search-first-page-normal");
  const { client } = makeClient(() => body);

  await assert.rejects(client.searchPage({ payload: null }), TypeError);
  await assert.rejects(client.searchPage({ payload: "nope" }), TypeError);
});

test("模块源码扫描：不得包含禁用字符串", async () => {
  const source = await readFile(MODULE_URL, "utf8");
  assert.ok(!source.includes("6438f862000000000e01e59a"), "不得包含真实 userId 样本");
  assert.ok(!source.includes("token.txt"), "不得包含 token.txt");
  assert.ok(!source.includes("local_config"), "不得包含 local_config");
});

test("KNOWN_KOL_FIELDS 白名单无重复项", () => {
  assert.equal(
    new Set(KNOWN_KOL_FIELDS).size,
    KNOWN_KOL_FIELDS.length,
    "展示白名单不得包含重复字段名",
  );
});
