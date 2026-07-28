const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
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
  /function pgyDailyNoteFormatInteger\(a\) \{[\s\S]*?\r?\n\}\r?\n(?:\r?\n)?async function buildPgyBloggerChartFields/,
);
assert.ok(helperMatch, "daily note JS fallback helpers must be present");
const helperSource = helperMatch[0].replace(/\r?\n(?:\r?\n)?async function buildPgyBloggerChartFields$/, "");
const jsHelpers = new Function(
  "pgyChartEscape",
  `${helperSource}; return { pgyDailyNoteCategories, pgyDailyNoteEllipsize, pgyDailyNoteTextWidth, pgyDailyNotePerformanceSvg, pgyBuildBloggerOverviewData, pgyBloggerOverviewSvg };`,
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
  assert.deepEqual(buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
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
  const longCategories = [
    { contentTag: "这是一个特别长的出行旅游内容分类名称", percent: "80" },
    { contentTag: "这是一个同样很长的时尚穿搭内容分类名称", percent: "15" },
    { contentTag: "这是第三个需要稳定截断的生活方式内容分类", percent: "5" },
  ];
  assert.equal(jsHelpers.pgyDailyNoteCategories(missing), "美妆（占比-）");
  assert.equal(jsHelpers.pgyDailyNoteCategories([{ contentTag: "美妆", percent: " " }]), "美妆（占比-）");
  assert.equal(
    jsHelpers.pgyDailyNoteCategories(ranked),
    "最高（占比90.0%）｜次高（占比30.0%）｜中（占比20.0%）｜另有 1 类",
  );
  const longCategoryText = jsHelpers.pgyDailyNoteCategories(longCategories);
  const jsEllipsized = jsHelpers.pgyDailyNoteEllipsize(longCategoryText);
  assert.match(jsEllipsized, /\.\.\.$/);
  assert.ok(jsHelpers.pgyDailyNoteTextWidth(jsEllipsized) <= 535);

  const probeSource = pythonSource.replace(
    /if __name__ == "__main__":\r?\n    main\(\)/,
    'if __name__ == "__main__":\n    sys.stdout.reconfigure(encoding="utf-8")\n    probe = json.loads(sys.stdin.buffer.read().decode("utf-8"))\n    categories = [daily_note_categories(rows) for rows in probe]\n    print(json.dumps({"categories": categories, "ellipsized": [daily_note_ellipsize(value) for value in categories]}, ensure_ascii=False))',
  );
  const output = JSON.parse(runPython(probeSource, [missing, ranked, longCategories]));
  assert.deepEqual(output.categories, [
    "美妆（占比-）",
    "最高（占比90.0%）｜次高（占比30.0%）｜中（占比20.0%）｜另有 1 类",
    longCategoryText,
  ]);
  assert.equal(output.ellipsized[2], jsEllipsized);
});

test("runtime patch upgrades the legacy daily-note layout and is idempotent", (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-runtime-patch-upgrade-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const distDir = path.join(tempDir, "app-source", "dist-electron");
  const toolsDir = path.join(tempDir, "tools");
  mkdirSync(distDir, { recursive: true });
  mkdirSync(toolsDir, { recursive: true });
  writeFileSync(
    path.join(distDir, "index.js"),
    execFileSync("git", ["show", "HEAD:app-source/dist-electron/index.js"], { cwd: projectRoot }),
  );
  writeFileSync(
    path.join(distDir, "preload.mjs"),
    execFileSync("git", ["show", "HEAD:app-source/dist-electron/preload.mjs"], { cwd: projectRoot }),
  );
  copyFileSync(path.join(projectRoot, "tools", "pgy_chart_renderer.py"), path.join(toolsDir, "pgy_chart_renderer.py"));
  copyFileSync(path.join(projectRoot, "tools", "pgy_daily_note_svg.js"), path.join(toolsDir, "pgy_daily_note_svg.js"));
  copyFileSync(path.join(projectRoot, "tools", "pgy_blogger_overview_svg.js"), path.join(toolsDir, "pgy_blogger_overview_svg.js"));

  const patchScript = path.join(projectRoot, "scripts", "apply-magiorix-runtime-patches.js");
  const env = { ...process.env, MAGIORIX_PATCH_PROJECT_ROOT: tempDir };
  const firstRun = spawnSync(process.execPath, [patchScript], { cwd: projectRoot, env, encoding: "utf8", windowsHide: true });
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
  const upgraded = readFileSync(path.join(distDir, "index.js"), "utf8");
  assert.match(upgraded, /width="808" height="378"/);
  assert.match(upgraded, /function pgyDailyNoteEllipsize/);
  assert.doesNotMatch(upgraded, /width="760" height="300"[^]*数据表现/);
  assert.match(upgraded, /width="2048" height="1066"/);
  assert.match(upgraded, /bloggerOverviewChart/);

  const secondRun = spawnSync(process.execPath, [patchScript], { cwd: projectRoot, env, encoding: "utf8", windowsHide: true });
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
  assert.equal(readFileSync(path.join(distDir, "index.js"), "utf8"), upgraded);
});

test("blogger overview normalization preserves PGY formatting and missing-value policy", () => {
  assert.match(runtimeSource, /profile: \[[\s\S]*?"bloggerOverviewChart"[\s\S]*?effective: \[/);
  assert.match(runtimeSource, /effective: \[[\s\S]*?"bloggerOverviewChart"[\s\S]*?daily30: \[/);
  assert.match(runtimeSource, /daily30: \[[\s\S]*?"bloggerOverviewChart"[\s\S]*?daily90: \[/);
  assert.match(runtimeSource, /fansSummary: \[[^\]]*"bloggerOverviewChart"[^\]]*\]/);
  const overview = jsHelpers.pgyBuildBloggerOverviewData({
    avatar: "https://example.test/avatar.png",
    profile: {
      name: "钢钢有营养",
      redId: "4289451266",
      location: "广东 广州",
      liveSign: { name: "六月星河" },
      personalTags: ["文化艺术"],
      fansCount: 83000,
      likeCollectCountInfo: 873000,
      picturePrice: 15000,
      videoPrice: 20000,
      currentLevel: { name: "品效型博主" },
      dataUpdateTime: "2026/07/26 10:30:00",
      cooperationIndustry: [],
      verified: true,
    },
    effective: {
      activeDays7: 7,
      inviteReplyRate: "91.2",
      activeLabel: "活跃",
      replyLabel: "好联系",
    },
    daily30: {
      noteNumber: 3,
      noteType: [
        { contentTag: "文化艺术", percent: "66.7" },
        { contentTag: "运动健身", percent: "33.3" },
      ],
      impMedian: 79464,
      impMedianPercent: "91.67",
      readMedian: 17506,
      readMedianPercent: "87.37",
      mEngagementNum: 1773,
      mEngagementNumPercent: "92",
    },
    fansSummary: {
      fansGrowthRate: "1.9",
      fansGrowthRatePercent: "96.0",
    },
  });

  assert.deepEqual(overview, {
    nickname: "钢钢有营养",
    avatar: "https://example.test/avatar.png",
    redId: "4289451266",
    location: "广东 广州",
    mcn: "六月星河",
    verified: true,
    categoryTags: ["文化艺术"],
    fansText: "8.3w",
    likeCollectText: "87.3w",
    picturePriceText: "¥15,000",
    videoPriceText: "¥20,000",
    updatedAtText: "2026-07-26",
    advantageText: "品效型博主",
    publishedNotesText: "3篇",
    contentCategoriesText: "文化艺术、运动健身",
    cooperationIndustryText: "暂无",
    exposureText: "79,464",
    exposurePeerText: "优于 91.67% 同行",
    readText: "17,506",
    readPeerText: "优于 87.37% 同行",
    interactionText: "1,773",
    interactionPeerText: "优于 92% 同行",
    activeDaysText: "7天",
    activeLabelText: "活跃",
    replyRateText: "91.2%",
    replyLabelText: "好联系",
    fansGrowthText: "1.9%",
    fansGrowthPeerText: "优于 96.0% 同行",
  });

  const svg = jsHelpers.pgyBloggerOverviewSvg(overview);
  assert.match(svg, /width="2048" height="1066"/);
  for (const expected of [
    "数据更新至： 2026-07-26",
    "博主优势",
    "曝光中位数",
    "互动中位数",
    "邀约48小时回复率",
    "粉丝量变化幅度",
    "¥15,000",
    "优于 96.0% 同行",
  ]) {
    assert.ok(svg.includes(expected), `overview SVG is missing ${expected}`);
  }

  const missing = jsHelpers.pgyBuildBloggerOverviewData({});
  assert.equal(missing.nickname, "-");
  assert.equal(missing.picturePriceText, "-");
  assert.equal(missing.exposurePeerText, "优于 - 同行");
  assert.equal(missing.cooperationIndustryText, "暂无");
});

test("Python renderer writes 808 by 378 web-layout PNGs for populated and missing data", (t) => {
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
  assert.deepEqual(pngSize(samplePath), { width: 808, height: 378 });
  assert.deepEqual(pngSize(missingPath), { width: 808, height: 378 });
  const populatedSvg = jsHelpers.pgyDailyNotePerformanceSvg(payload.charts[0].data);
  assert.match(populatedSvg, /width="808" height="378"/);
  assert.match(populatedSvg, />数据表现</);
  assert.match(populatedSvg, />核心指标</);
  assert.match(populatedSvg, /fill="#ff2442"/);
  assert.doesNotMatch(populatedSvg, /互动中位数/);
  assert.match(jsHelpers.pgyDailyNotePerformanceSvg(payload.charts[1].data), />-<\/text>/);
});

test("Python renderer writes a 2048 by 1066 blogger overview PNG without the lower page section", (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-blogger-overview-chart-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, "blogger-overview.png");
  const data = jsHelpers.pgyBuildBloggerOverviewData({
    profile: {
      name: "测试博主",
      redId: "123456789",
      location: "上海",
      fansCount: 83000,
      likeCollectCountInfo: 873000,
      picturePrice: 15000,
      videoPrice: 20000,
      currentLevel: "品效型博主",
      personalTags: ["文化艺术"],
    },
    effective: { activeDays: 7, responseRate: "91.2", activeLabel: "活跃", replyLabel: "好联系" },
    daily30: { noteNumber: 3, impMedian: 79464, readMedian: 17506, mEngagementNum: 1773 },
    fansSummary: { fansGrowthRate: "1.9" },
  });
  const result = JSON.parse(runPython(pythonSource, {
    charts: [{
      field: "bloggerOverviewChart",
      type: "blogger-overview",
      data,
      output: outputPath,
    }],
  }));
  assert.deepEqual(result.errors, {});
  assert.equal(result.paths.bloggerOverviewChart, outputPath);
  assert.deepEqual(pngSize(outputPath), { width: 2048, height: 1066 });
});

test("Python overview avatar uses the same center-crop behavior as the SVG fallback", () => {
  const probeSource = pythonSource.replace(
    /if __name__ == "__main__":\r?\n    main\(\)/,
    'if __name__ == "__main__":\n    source_image = Image.new("RGB", (8, 2), "#ff0000")\n    ImageDraw.Draw(source_image).rectangle((4, 0, 7, 1), fill="#0000ff")\n    encoded_image = io.BytesIO()\n    source_image.save(encoded_image, "PNG")\n    source = "data:image/png;base64," + base64.b64encode(encoded_image.getvalue()).decode("ascii")\n    avatar = load_overview_avatar(source, 4)\n    print(json.dumps({"size": list(avatar.size), "topCenter": list(avatar.getpixel((2, 0))), "bottomCenter": list(avatar.getpixel((2, 3)))}, ensure_ascii=False))',
  );
  const output = JSON.parse(runPython(probeSource, null));
  assert.deepEqual(output.size, [4, 4]);
  assert.equal(output.topCenter[3], 255);
  assert.equal(output.bottomCenter[3], 255);
  assert.notDeepEqual(output.topCenter.slice(0, 3), [232, 237, 244]);
  assert.notDeepEqual(output.bottomCenter.slice(0, 3), [232, 237, 244]);
});

test("bundled chart renderer supports the daily note performance chart", (t) => {
  const rendererPath = path.join(
    projectRoot,
    "runtime",
    "magiorix-desktop",
    "resources",
    "pgy-chart-renderer.exe",
  );
  assert.ok(existsSync(rendererPath), "bundled chart renderer must exist");

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-bundled-daily-note-chart-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, "daily-note.png");
  const payload = {
    charts: [{
      field: "dailyNotePerformanceChart",
      type: "daily-note-performance",
      data: {
        noteNumber: 7,
        noteType: [{ contentTag: "美食", percent: "100" }],
        impMedian: 80586,
        readMedian: 9287,
      },
      output: outputPath,
    }],
  };
  const process = spawnSync(rendererPath, [], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(process.status, 0, process.stderr || process.stdout);
  const result = JSON.parse(process.stdout.trim().split(/\r?\n/).pop());
  assert.deepEqual(result.errors, {});
  assert.equal(result.paths.dailyNotePerformanceChart, outputPath);
  assert.deepEqual(pngSize(outputPath), { width: 808, height: 378 });
});

test("bundled chart renderer supports the blogger overview chart", (t) => {
  const rendererPath = path.join(
    projectRoot,
    "runtime",
    "magiorix-desktop",
    "resources",
    "pgy-chart-renderer.exe",
  );
  assert.ok(existsSync(rendererPath), "bundled chart renderer must exist");
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-bundled-blogger-overview-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, "blogger-overview.png");
  const process = spawnSync(rendererPath, [], {
    input: JSON.stringify({
      charts: [{
        field: "bloggerOverviewChart",
        type: "blogger-overview",
        data: jsHelpers.pgyBuildBloggerOverviewData({
          profile: {
            name: "测试博主",
            redId: "123456789",
            fansCount: 83000,
            likeCollectCountInfo: 873000,
          },
          daily30: { noteNumber: 3, impMedian: 79464, readMedian: 17506, mEngagementNum: 1773 },
          fansSummary: { fansGrowthRate: "1.9" },
        }),
        output: outputPath,
      }],
    }),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(process.status, 0, process.stderr || process.stdout);
  const result = JSON.parse(process.stdout.trim().split(/\r?\n/).pop());
  assert.deepEqual(result.errors, {});
  assert.equal(result.paths.bloggerOverviewChart, outputPath);
  assert.deepEqual(pngSize(outputPath), { width: 2048, height: 1066 });
});

test("production Excel embedder adds daily-note and blogger-overview PNGs in field order", async (t) => {
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
    new Set(["dailyNotePerformanceChart", "bloggerOverviewChart"]),
    existsSync,
    readFileSync,
    writeFileSync,
    JSZip,
  );

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-daily-note-xlsx-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const pngPath = path.join(tempDir, "daily-note.png");
  const overviewPath = path.join(tempDir, "blogger-overview.png");
  const xlsxPath = path.join(tempDir, "daily-note.xlsx");
  const rendererPath = path.join(
    projectRoot,
    "runtime",
    "magiorix-desktop",
    "resources",
    "pgy-chart-renderer.exe",
  );
  const renderProcess = spawnSync(rendererPath, [], {
    input: JSON.stringify({
      charts: [
        {
          field: "dailyNotePerformanceChart",
          type: "daily-note-performance",
          data: {
            noteNumber: 7,
            noteType: [{ contentTag: "美食", percent: "100" }],
            impMedian: 80586,
            readMedian: 9287,
          },
          output: pngPath,
        },
        {
          field: "bloggerOverviewChart",
          type: "blogger-overview",
          data: jsHelpers.pgyBuildBloggerOverviewData({
            profile: { name: "测试博主", redId: "123456789", fansCount: 83000 },
            daily30: { noteNumber: 3, impMedian: 79464, readMedian: 17506 },
          }),
          output: overviewPath,
        },
      ],
    }),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(renderProcess.status, 0, renderProcess.stderr || renderProcess.stdout);
  assert.deepEqual(pngSize(pngPath), { width: 808, height: 378 });
  assert.deepEqual(pngSize(overviewPath), { width: 2048, height: 1066 });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["日常30天", ""],
    ["日常笔记表现图", "博主数据概览图"],
    ["", ""],
  ]), "Sheet1");
  XLSX.writeFile(workbook, xlsxPath);

  await pgyEmbedImagesInWorkbook(
    xlsxPath,
    [
      { key: "dailyNotePerformanceChart", label: "日常笔记表现图" },
      { key: "bloggerOverviewChart", label: "博主数据概览图" },
    ],
    [{ dailyNotePerformanceChart: pngPath, bloggerOverviewChart: overviewPath }],
  );

  const archive = await JSZip.loadAsync(readFileSync(xlsxPath));
  assert.ok(archive.file("xl/media/pgy_chart_1.png"));
  assert.ok(archive.file("xl/media/pgy_chart_2.png"));
  const drawing = await archive.file("xl/drawings/drawing1.xml").async("string");
  const anchors = [...drawing.matchAll(
    /<xdr:twoCellAnchor[^>]*><xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<xdr:cNvPr[^>]*name="([^"]+)"/g,
  )].map((match) => ({ col: Number(match[1]), row: Number(match[2]), name: match[3] }));
  assert.deepEqual(anchors, [
    { col: 0, row: 2, name: "日常笔记表现图-1" },
    { col: 1, row: 2, name: "博主数据概览图-1" },
  ]);
  const sheet = await archive.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(sheet, /<drawing r:id="rId\d+"\/>/);
  const contentTypes = await archive.file("[Content_Types].xml").async("string");
  assert.match(contentTypes, /Extension="png" ContentType="image\/png"/);
});
