const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "../..");
const runtimeSource = readFileSync(path.join(projectRoot, "app-source", "dist-electron", "index.js"), "utf8");
const requireFromApp = createRequire(path.join(projectRoot, "app-source", "package.json"));
const JSZip = requireFromApp("jszip");
const XLSX = requireFromApp("xlsx-js-style");

const pythonMatch = runtimeSource.match(
  /const PGY_PYTHON_CHART_SCRIPT = String\.raw`\r?\n([\s\S]*?)`;\r?\nfunction pgyChartRendererCandidates/,
);
assert.ok(pythonMatch, "embedded Python chart renderer must be present");
const pythonSource = pythonMatch[1];

const helperMatch = runtimeSource.match(
  /function pgyDailyNoteFormatInteger\(a\) \{[\s\S]*?\n\}\nasync function buildPgyBloggerChartFields/,
);
assert.ok(helperMatch, "daily note JS fallback helpers must be present");
const helperSource = helperMatch[0].replace(/\nasync function buildPgyBloggerChartFields$/, "");
const jsHelpers = new Function(
  "pgyChartEscape",
  `${helperSource}; return { pgyDailyNoteCategories, pgyDailyNotePerformanceSvg };`,
)((value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
})[char]));

function runPython(source, payload) {
  const failures = [];
  for (const candidate of [["python"], ["py", "-3"]]) {
    const result = spawnSync(candidate[0], [...candidate.slice(1), "-c", source], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return result.stdout.trim();
    failures.push(result.error?.message || result.stderr || result.stdout || `${candidate[0]} exited ${result.status}`);
  }
  assert.fail(`Python chart renderer did not execute successfully: ${failures.join(" | ")}`);
}

function pngSize(filePath) {
  const buffer = readFileSync(filePath);
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("daily note category formatting is consistent in Python and JS", () => {
  const missing = [{ contentTag: "美妆", percent: null }];
  const ranked = [
    { contentTag: "低", percent: "10" },
    { contentTag: "最高", percent: "90" },
    { contentTag: "中", percent: "20" },
    { contentTag: "次高", percent: "30" },
  ];
  assert.equal(jsHelpers.pgyDailyNoteCategories(missing), "美妆（占比-）");
  assert.equal(jsHelpers.pgyDailyNoteCategories([{ contentTag: "美妆", percent: " " }]), "美妆（占比-）");
  assert.equal(
    jsHelpers.pgyDailyNoteCategories(ranked),
    "最高（占比90.0%）｜次高（占比30.0%）｜中（占比20.0%）｜另有 1 类",
  );

  const probeSource = pythonSource.replace(
    /if __name__ == "__main__":\r?\n    main\(\)/,
    'if __name__ == "__main__":\n    sys.stdout.reconfigure(encoding="utf-8")\n    probe = json.loads(sys.stdin.buffer.read().decode("utf-8"))\n    print(json.dumps({"categories": [daily_note_categories(rows) for rows in probe]}, ensure_ascii=False))',
  );
  const output = JSON.parse(runPython(probeSource, [missing, ranked]));
  assert.deepEqual(output.categories, [
    "美妆（占比-）",
    "最高（占比90.0%）｜次高（占比30.0%）｜中（占比20.0%）｜另有 1 类",
  ]);
});

test("Python renderer writes 760 by 300 PNGs for populated and missing data", (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-daily-note-chart-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const samplePath = path.join(tempDir, "sample.png");
  const missingPath = path.join(tempDir, "missing.png");
  const payload = {
    charts: [
      {
        field: "sample",
        type: "daily-note-performance",
        data: {
          noteNumber: 7,
          noteType: [
            { contentTag: "美食", percent: "85.7" },
            { contentTag: "运动健身", percent: "14.3" },
          ],
          impMedian: 80586,
          readMedian: 9287,
        },
        output: samplePath,
      },
      {
        field: "missing",
        type: "daily-note-performance",
        data: { noteNumber: 0, noteType: [], impMedian: 0, readMedian: 0 },
        output: missingPath,
      },
    ],
  };
  const result = JSON.parse(runPython(pythonSource, payload));
  assert.deepEqual(result.errors, {});
  assert.equal(result.paths.sample, samplePath);
  assert.equal(result.paths.missing, missingPath);
  assert.deepEqual(pngSize(samplePath), { width: 760, height: 300 });
  assert.deepEqual(pngSize(missingPath), { width: 760, height: 300 });
  assert.match(jsHelpers.pgyDailyNotePerformanceSvg(payload.charts[0].data), /width="760" height="300"/);
  assert.match(jsHelpers.pgyDailyNotePerformanceSvg(payload.charts[1].data), />-<\/text>/);
});

test("production Excel embedder adds the daily note PNG and drawing anchor", async (t) => {
  const embedMatch = runtimeSource.match(
    /function pgyXmlEscape\(a\) \{[\s\S]*?\r?\n\}\r?\nasync function ff\(a\) \{/,
  );
  assert.ok(embedMatch, "production Excel image embedder must be present");
  const embedSource = embedMatch[0].replace(/\r?\nasync function ff\(a\) \{$/, "");
  const { pgyEmbedImagesInWorkbook } = new Function(
    "PGY_IMAGE_FIELDS",
    "kt",
    "Qi",
    "Zi",
    "JSZip",
    `${embedSource}; return { pgyEmbedImagesInWorkbook };`,
  )(
    new Set(["dailyNotePerformanceChart"]),
    existsSync,
    readFileSync,
    writeFileSync,
    JSZip,
  );

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-daily-note-xlsx-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const pngPath = path.join(tempDir, "daily-note.png");
  const xlsxPath = path.join(tempDir, "daily-note.xlsx");
  writeFileSync(
    pngPath,
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["日常30天"],
    ["日常笔记表现图"],
    [""],
  ]), "Sheet1");
  XLSX.writeFile(workbook, xlsxPath);

  await pgyEmbedImagesInWorkbook(
    xlsxPath,
    [{ key: "dailyNotePerformanceChart", label: "日常笔记表现图" }],
    [{ dailyNotePerformanceChart: pngPath }],
  );

  const archive = await JSZip.loadAsync(readFileSync(xlsxPath));
  assert.ok(archive.file("xl/media/pgy_chart_1.png"));
  const drawing = await archive.file("xl/drawings/drawing1.xml").async("string");
  assert.match(drawing, /<xdr:col>0<\/xdr:col>/);
  assert.match(drawing, /<xdr:row>2<\/xdr:row>/);
  assert.match(drawing, /name="日常笔记表现图-1"/);
  const sheet = await archive.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(sheet, /<drawing r:id="rId\d+"\/>/);
  const contentTypes = await archive.file("[Content_Types].xml").async("string");
  assert.match(contentTypes, /Extension="png" ContentType="image\/png"/);
});
