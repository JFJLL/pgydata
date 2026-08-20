import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PgyPayloadBuilder } from "../../app-source/pgy-kol/pgy-payload-builder.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("找博主前端：排序字段不再混入筛选查询请求", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "pgy-kol-phase52-page-source.js"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "app-source", "package.json"), "utf8"));
  const bundle = fs.readFileSync(path.join(root, "assets", pkg.assetsVersion, "assets", "index-B09sHfUO.js"), "utf8");
  for (const content of [source, bundle]) {
    assert.doesNotMatch(content, /keyword:\"\",column:/, "默认筛选不能带排序字段");
    assert.doesNotMatch(content, /if\(f\.column\)out\.column/);
    assert.doesNotMatch(content, /filterPayload\.column|filterPayload\.sort/);
    assert.match(content, /sortColumn:sortCol\|\|\"comprehensiverank\"/);
    assert.match(content, /sortOrder:sortOrd\|\|\"desc\"/);
  }
});

test("排序字段：fansNum 映射为官网 fansCount，方向保持不变", () => {
  const builder = new PgyPayloadBuilder({
    schema: {
      getField: () => null,
      getFieldByStateKey: () => null,
      serialize: () => null,
    },
  });
  const payload = builder.build({ column: "fansNum", sort: "desc" });
  assert.equal(payload.column, "fansCount");
  assert.equal(payload.sort, "desc");
});
