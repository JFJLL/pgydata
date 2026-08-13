const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "../..");
const runtimeSource = readFileSync(path.join(projectRoot, "app-source", "dist-electron", "index.js"), "utf8");
const requireFromApp = createRequire(path.join(projectRoot, "app-source", "package.json"));
const JSZip = requireFromApp("jszip");
const XLSX = requireFromApp("xlsx-js-style");

const pythonMatch = runtimeSource.match(
  /const PGY_PYTHON_CHART_SCRIPT = String\.raw`\r?\n([\s\S]*?)`;\r?\n(?:\r?\n)?function pgyChartRendererCandidates/,
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
  // 源码含内嵌 base64（头像/图标）体积较大，写入临时文件运行，避免 python -c 命令行超长
  const scriptDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-pychart-"));
  const scriptPath = path.join(scriptDir, "renderer.py");
  writeFileSync(scriptPath, source, "utf8");
  try {
    for (const candidate of [["python"], ["py", "-3"]]) {
      const result = spawnSync(candidate[0], [...candidate.slice(1), scriptPath], {
        input: JSON.stringify(payload),
        encoding: "utf8",
        env: { ...process.env, PGY_CHINA_GEOJSON_PATH: path.join(projectRoot, "tools", "china-provinces.geojson") },
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      });
      if (!result.error && result.status === 0) return result.stdout.trim();
      failures.push(result.error?.message || result.stderr || result.stdout || `${candidate[0]} exited ${result.status}`);
    }
  } finally {
    rmSync(scriptDir, { recursive: true, force: true });
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
  copyFileSync(path.join(projectRoot, "tools", "pgy_trend_svg.js"), path.join(toolsDir, "pgy_trend_svg.js"));
  copyFileSync(path.join(projectRoot, "tools", "china-provinces.geojson"), path.join(toolsDir, "china-provinces.geojson"));
  cpSync(path.join(projectRoot, "tools", "overview-icons"), path.join(toolsDir, "overview-icons"), { recursive: true });

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
  assert.match(upgraded, /dailyNotePicturePerformanceChart/);
  assert.match(upgraded, /dailyNoteVideoPerformanceChart/);
  assert.match(upgraded, /noteType=1/);
  assert.match(upgraded, /noteType=2/);

  const secondRun = spawnSync(process.execPath, [patchScript], { cwd: projectRoot, env, encoding: "utf8", windowsHide: true });
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
  assert.equal(readFileSync(path.join(distDir, "index.js"), "utf8"), upgraded);
});

test("blogger overview normalization preserves PGY formatting and missing-value policy", () => {
  assert.match(runtimeSource, /profile: \[[\s\S]*?"bloggerOverviewChart"[\s\S]*?effective: \[/);
  assert.match(runtimeSource, /effective: \[[\s\S]*?"bloggerOverviewChart"[\s\S]*?daily30: \[/);
  assert.match(runtimeSource, /daily30: \[[\s\S]*?"bloggerOverviewChart"[\s\S]*?daily90: \[/);
  assert.match(runtimeSource, /fansSummary: \[[^\]]*"bloggerOverviewChart"[^\]]*\]/);
  assert.match(runtimeSource, /overviewSummary: \(a\) => `[^`]+data_summary\?userId=\$\{a\}&business=0`/);
  assert.match(runtimeSource, /overviewSummary: \["bloggerOverviewChart"\]/);
  assert.match(runtimeSource, /overview: \(\(t\.overviewSummary == null \? void 0 : t\.overviewSummary\.data\) \?\? \{\}\)/);
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
    genderText: "-",
    healthLevel: null,
    healthRisk: false,
    profileSummaryText: "文化艺术",
    travelAreaText: "-",
    categoryTags: [],
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
  assert.equal(missing.mcn, "无机构");
  const missingSvg = jsHelpers.pgyBloggerOverviewSvg(missing);
  assert.doesNotMatch(missingSvg, /fill="#eef2ff"/, "empty service labels must not render badge boxes");
});

test("blogger overview prefers the web data_summary source over legacy guesses", () => {
  const overview = jsHelpers.pgyBuildBloggerOverviewData({
    avatar: "https://example.test/avatar.png",
    profile: {
      name: "满满Dangdang～（孕期）",
      redId: "180103955",
      location: "福建 漳州 龙海区",
      travelAreaList: ["福建", "广东"],
      contentTags: [{ taxonomy1Tag: "母婴", taxonomy2Tags: ["婴童用品"] }],
      featureTags: ["露营徒步", "ootd", "氛围感", "plog"],
      gender: "女",
      currentLevel: 2,
      noteSign: null,
      liveSign: null,
      fansCount: 13273,
      likeCollectCountInfo: 120640,
      picturePrice: 3000,
      videoPrice: 4000,
    },
    overview: {
      dateKey: "2026-07-29",
      kolAdvantage: "品效型博主",
      noteNumber: 10,
      noteType: [
        { contentTag: "母婴", percent: "90.0" },
        { contentTag: "出行旅游", percent: "10.0" },
      ],
      tradeNames: ["食品饮料", "母婴"],
      mAccumImpNum: 81258,
      mAccumImpCompare: 94.35,
      mValidRawReadFeedNum: 9378,
      mValidRawReadFeedCompare: 90.59,
      mEngagementNum: 574,
      mEngagementNumCompare: 88.32,
      activeDayInLast7: 7,
      isActive: true,
      responseRate: "95.5",
      easyConnect: true,
      fans30GrowthRate: "4.9",
      fans30GrowthBeyondRate: "96.3",
    },
    daily30: { noteNumber: 1, impMedian: 81212, readMedian: 9374, interactionMedian: 541 },
    fansSummary: { fansGrowthRate: "4.9", fansGrowthBeyondRate: "96.3" },
  });
  assert.equal(overview.updatedAtText, "2026-07-29");
  assert.equal(overview.advantageText, "品效型博主");
  assert.equal(overview.publishedNotesText, "10篇");
  assert.equal(overview.contentCategoriesText, "母婴、出行旅游");
  assert.equal(overview.cooperationIndustryText, "食品饮料、母婴");
  assert.equal(overview.exposureText, "81,258");
  assert.equal(overview.exposurePeerText, "优于 94.35% 同行");
  assert.equal(overview.readText, "9,378");
  assert.equal(overview.readPeerText, "优于 90.59% 同行");
  assert.equal(overview.interactionText, "574");
  assert.equal(overview.interactionPeerText, "优于 88.32% 同行");
  assert.equal(overview.activeDaysText, "7天");
  assert.equal(overview.activeLabelText, "活跃");
  assert.equal(overview.replyRateText, "95.5%");
  assert.equal(overview.replyLabelText, "好联系");
  assert.equal(overview.fansGrowthText, "4.9%");
  assert.equal(overview.fansGrowthPeerText, "优于 96.3% 同行");
  assert.equal(overview.mcn, "无机构");
  assert.equal(overview.genderText, "女");
  assert.equal(overview.healthLevel, 2);
  assert.equal(overview.profileSummaryText, "-");
  assert.equal(overview.travelAreaText, "福建、广东");
  assert.deepEqual(overview.categoryTags, ["母婴", "露营徒步", "ootd", "氛围感", "plog"]);

  assert.equal(overview.healthRisk, false);

  const overviewIconImages = {
    health: "data:image/png;base64,HEALTH",
    healthRisk: "data:image/png;base64,RISK",
    genderFemale: "data:image/png;base64,FEMALE",
    copy: "data:image/jpeg;base64,COPY",
    cooperationPrice: "data:image/jpeg;base64,PRICE",
    notes: "data:image/png;base64,NOTES",
    service: "data:image/png;base64,SERVICE",
    growth: "data:image/png;base64,GROWTH",
  };
  const svg = jsHelpers.pgyBloggerOverviewSvg({ ...overview, overviewIconImages });
  for (const expected of [
    "数据更新至： 2026-07-29",
    "品效型博主",
    "无机构",
    ">福建、广东</text>",
    "data:image/png;base64,HEALTH",
    "data:image/png;base64,FEMALE",
    "plog",
    "优于 94.35% 同行",
    "优于 96.3% 同行",
    ">活跃</text>",
    ">好联系</text>",
  ]) {
    assert.ok(svg.includes(expected), `overview SVG is missing ${expected}`);
  }
  assert.match(svg, /base64,FEMALE"[^>]+width="20" height="20"/, "gender icon must use the enlarged output size");
  assert.match(svg, /base64,HEALTH"[^>]+width="28" height="28"/, "healthy icon must use the enlarged output size");
  assert.match(svg, /base64,NOTES"[^>]+width="40" height="40"/, "section icons must use the enlarged output size");
  assert.match(svg, /base64,PRICE"[^>]+width="34" height="34"/, "price icon must use the enlarged output size");
  assert.match(svg, /<text x="766" y="400" font-size="24" fill="#262626">笔记数据<\/text>/, "section title must use the lighter reference typography");
  assert.match(svg, /<text x="252" y="192" font-size="22" fill="#262626">/, "nickname must use the lighter reference typography");

  const shortNameSvg = jsHelpers.pgyBloggerOverviewSvg({ ...overview, nickname: "Q", redId: "a", overviewIconImages });
  const longNameSvg = jsHelpers.pgyBloggerOverviewSvg({ ...overview, nickname: "Q米夫妇_", redId: "btccco", overviewIconImages });
  const iconX = (markup, token) => Number(markup.match(new RegExp(`base64,${token}\\" x=\\"([0-9.]+)`))[1]);
  assert.ok(iconX(longNameSvg, "FEMALE") > iconX(shortNameSvg, "FEMALE"), "nickname icons must follow the measured nickname width");
  assert.ok(iconX(longNameSvg, "COPY") > iconX(shortNameSvg, "COPY"), "copy icon must follow the measured red ID width");

  const riskSvg = jsHelpers.pgyBloggerOverviewSvg({ ...overview, healthLevel: 1, healthRisk: true, overviewIconImages });
  assert.ok(riskSvg.includes("data:image/png;base64,RISK"), "risk state must use the supplied risk icon");
  assert.equal((riskSvg.match(/暂停接单/g) || []).length, 2, "risk state must pause both cooperation prices");
  assert.ok(!riskSvg.includes("data:image/jpeg;base64,PRICE"), "risk state must hide both cooperation price icons");
  const noLevelSvg = jsHelpers.pgyBloggerOverviewSvg({ ...overview, healthLevel: null, healthRisk: false, overviewIconImages });
  assert.ok(!noLevelSvg.includes("base64,HEALTH") && !noLevelSvg.includes("base64,RISK"), "missing level must not render a health icon");
});

test("typed daily note charts use independent endpoints and visible filter labels", () => {
  assert.match(runtimeSource, /daily30Picture: \(a\) => `[^`]+noteType=1&dateType=1/);
  assert.match(runtimeSource, /daily30Video: \(a\) => `[^`]+noteType=2&dateType=1/);
  assert.match(runtimeSource, /daily30Picture: \["dailyNotePicturePerformanceChart"\]/);
  assert.match(runtimeSource, /daily30Video: \["dailyNoteVideoPerformanceChart"\]/);
  assert.match(jsHelpers.pgyDailyNotePerformanceSvg({ pgyNoteTypeLabel: "图文" }), />图文<\/text>/);
  assert.match(jsHelpers.pgyDailyNotePerformanceSvg({ pgyNoteTypeLabel: "视频" }), />视频<\/text>/);
  assert.match(jsHelpers.pgyDailyNotePerformanceSvg({}), />图文\+视频<\/text>/);
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

test("Python renderer creates province and city region distribution cards", (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-region-chart-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const provincePath = path.join(tempDir, "province.png");
  const cityPath = path.join(tempDir, "city.png");
  const provinceRows = [
    { name: "广东", value: 14.6 },
    { name: "海外", value: 14.0 },
    { name: "北京", value: 9.0 },
    { name: "上海", value: 9.0 },
    { name: "浙江", value: 6.3 },
    { name: "江苏", value: 5.7 },
    { name: "山东", value: 4.0 },
  ];
  const cityRows = [
    { name: "北京", value: 9.0 },
    { name: "上海", value: 9.0 },
    { name: "深圳", value: 5.7 },
    { name: "广州", value: 3.8 },
    { name: "杭州", value: 3.4 },
    { name: "成都", value: 2.8 },
    { name: "其他", value: 2.0 },
  ];
  const result = JSON.parse(runPython(pythonSource, {
    charts: [
      { field: "fansProvinceChart", type: "region-distribution", data: { mode: "province", provinceRows, cityRows }, output: provincePath },
      { field: "fansCityChart", type: "region-distribution", data: { mode: "city", provinceRows, cityRows }, output: cityPath },
    ],
  }));

  assert.deepEqual(result.errors, {});
  assert.equal(result.paths.fansProvinceChart, provincePath);
  assert.equal(result.paths.fansCityChart, cityPath);
  assert.deepEqual(pngSize(provincePath), { width: 784, height: 464 });
  assert.deepEqual(pngSize(cityPath), { width: 784, height: 464 });
  assert.notDeepEqual(readFileSync(provincePath), readFileSync(cityPath));
  assert.match(runtimeSource, /type: "region-distribution"/);
  assert.match(pythonSource, /def save_region_distribution\(chart\):/);
});

test("Python renderer creates reference-sized age and gender distribution cards", (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-demographic-chart-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const agePath = path.join(tempDir, "age.png");
  const genderPath = path.join(tempDir, "gender.png");
  const combinedPath = path.join(tempDir, "gender-age.png");
  const ageRows = [
    { name: "<18", value: 2.3 },
    { name: "18-24", value: 7.5 },
    { name: "25-34", value: 30.8 },
    { name: "35-44", value: 37.1 },
    { name: ">44", value: 22.4 },
  ];
  const gender = { female: 0.4097, male: 0.5902 };
  const result = JSON.parse(runPython(pythonSource, {
    charts: [
      {
        field: "fansAgeChart",
        type: "age-distribution",
        rows: ageRows,
        output: agePath,
      },
      { field: "fansGenderChart", type: "gender", data: gender, output: genderPath },
      { field: "fansGenderAgeChart", type: "gender-age-distribution", data: { rows: ageRows, gender }, output: combinedPath },
    ],
  }));

  assert.deepEqual(result.errors, {});
  assert.equal(result.paths.fansAgeChart, agePath);
  assert.equal(result.paths.fansGenderChart, genderPath);
  assert.equal(result.paths.fansGenderAgeChart, combinedPath);
  assert.deepEqual(pngSize(agePath), { width: 382, height: 372 });
  assert.deepEqual(pngSize(genderPath), { width: 379, height: 383 });
  assert.deepEqual(pngSize(combinedPath), { width: 783, height: 390 });
  assert.notDeepEqual(readFileSync(agePath), readFileSync(genderPath));
  assert.match(runtimeSource, /field: "fansAgeChart", type: "age-distribution"/);
  assert.match(runtimeSource, /field: "fansGenderAgeChart", type: "gender-age-distribution"/);
  assert.match(pythonSource, /def save_age_distribution\(chart\):/);
  assert.match(pythonSource, /width, height, scale = 379, 383, 4/);
  assert.match(pythonSource, /def save_gender_age_distribution\(chart\):/);
});

test("Python renderer creates a reference-sized marker-free 30-day fan trend card", (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-fans-trend-chart-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const output = path.join(tempDir, "fans-trend.png");
  const unorderedOutput = path.join(tempDir, "fans-trend-unordered.png");
  const values = [107174, 107172, 107169, 107174, 107190, 107190, 107192, 107193, 107187, 107186, 107176, 107174, 107168, 107164, 107163, 107169, 107174, 107218, 107249, 107270, 107286, 107294, 107292, 107280, 107277, 107286, 107286, 107284, 107276, 107268];
  const rows = values.map((num, index) => {
    const date = new Date(Date.UTC(2026, 6, 13 + index));
    return { dateKey: date.toISOString().slice(0, 10).replace(/-/g, ""), num };
  });
  const unorderedRows = [{ dateKey: "20260712", num: 107170 }, ...rows, { ...rows[0] }].reverse();
  const result = JSON.parse(runPython(pythonSource, {
    charts: [
      { field: "fansGrowthTrendChart", type: "trend", rows, output },
      { field: "fansGrowthTrendChartUnordered", type: "trend", rows: unorderedRows, output: unorderedOutput },
    ],
  }));

  assert.deepEqual(result.errors, {});
  assert.equal(result.paths.fansGrowthTrendChart, output);
  assert.deepEqual(pngSize(output), { width: 813, height: 419 });
  assert.deepEqual(readFileSync(unorderedOutput), readFileSync(output), "date sorting, de-duplication and recent-30 selection must preserve every daily bend");
  const trendSection = pythonSource.slice(pythonSource.indexOf("def save_trend(chart):"), pythonSource.indexOf("def main():"));
  assert.doesNotMatch(trendSection, /for x, y in points:/, "trend line must not draw point markers");
  assert.doesNotMatch(trendSection, /x - 4, y - 4, x \+ 4, y \+ 4/, "trend line must not draw point markers");
  assert.match(trendSection, /for sample in range\(12\)/, "smooth curve must interpolate through every daily value");
  assert.match(trendSection, /draw\.line\(curve, fill="#3f6eff"/);
  assert.match(trendSection, /for candidate in \(1, 2, 3, 5, 10\)/, "107163–107294 must use a 30-fan axis step");
  assert.match(trendSection, /rows = trend_points\(chart\.get\("rows"\)\)\[-30:\]/);
  assert.match(trendSection, /label_indices = \[0, 6, 12, 18, 24\]/);
  assert.match(pythonSource, /return sorted\(points_by_date\.values\(\), key=lambda point: point\["date_key"\]\)/);
  assert.match(runtimeSource, /const o = Array\.isArray\(t\) \? t : \[\];/);
  assert.match(runtimeSource, /o\.type === "trend" \? r = pgyWriteSvgPng\(pgyTrendChartSvg\(o\.rows \?\? \[\]\), o\.output\)/, "JS fallback must render the refined trend SVG");
  assert.match(runtimeSource, /粉丝总量/);
  assert.match(runtimeSource, /粉丝增量/);
  assert.match(runtimeSource, /近30日/);
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

test("production Excel embedder adds typed daily-note and blogger-overview PNGs in field order", async (t) => {
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
    new Set(["dailyNotePerformanceChart", "dailyNotePicturePerformanceChart", "dailyNoteVideoPerformanceChart", "bloggerOverviewChart", "fansGenderAgeChart"]),
    existsSync,
    readFileSync,
    writeFileSync,
    JSZip,
  );

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magiorix-daily-note-xlsx-"));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const pngPath = path.join(tempDir, "daily-note.png");
  const picturePath = path.join(tempDir, "daily-note-picture.png");
  const videoPath = path.join(tempDir, "daily-note-video.png");
  const overviewPath = path.join(tempDir, "blogger-overview.png");
  const combinedPath = path.join(tempDir, "gender-age.png");
  const ageRows = [
    { name: "<18", value: 2.3 },
    { name: "18-24", value: 7.5 },
    { name: "25-34", value: 30.8 },
    { name: "35-44", value: 37.1 },
    { name: ">44", value: 22.4 },
  ];
  const gender = { female: 0.4097, male: 0.5902 };
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
          field: "dailyNotePicturePerformanceChart",
          type: "daily-note-performance",
          data: { noteNumber: 4, noteType: [], impMedian: 70000, readMedian: 9000, pgyNoteTypeLabel: "图文" },
          output: picturePath,
        },
        {
          field: "dailyNoteVideoPerformanceChart",
          type: "daily-note-performance",
          data: { noteNumber: 3, noteType: [], impMedian: 90000, readMedian: 12000, pgyNoteTypeLabel: "视频" },
          output: videoPath,
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
  assert.deepEqual(pngSize(picturePath), { width: 808, height: 378 });
  assert.deepEqual(pngSize(videoPath), { width: 808, height: 378 });
  assert.deepEqual(pngSize(overviewPath), { width: 2048, height: 1066 });
  const combinedResult = JSON.parse(runPython(pythonSource, {
    charts: [
      {
        field: "fansGenderAgeChart",
        type: "gender-age-distribution",
        data: { rows: ageRows, gender },
        output: combinedPath,
      },
    ],
  }));
  assert.deepEqual(combinedResult.errors, {});
  assert.equal(combinedResult.paths.fansGenderAgeChart, combinedPath);
  assert.deepEqual(pngSize(combinedPath), { width: 783, height: 390 });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["日常30天", "", "", "", ""],
    ["日常笔记表现图（图文+视频）", "日常笔记表现图（图文）", "日常笔记表现图（视频）", "博主数据概览图", "性别分布+年龄分布"],
    ["", "", "", "", ""],
  ]), "Sheet1");
  XLSX.writeFile(workbook, xlsxPath);

  await pgyEmbedImagesInWorkbook(
    xlsxPath,
    [
      { key: "dailyNotePerformanceChart", label: "日常笔记表现图（图文+视频）" },
      { key: "dailyNotePicturePerformanceChart", label: "日常笔记表现图（图文）" },
      { key: "dailyNoteVideoPerformanceChart", label: "日常笔记表现图（视频）" },
      { key: "bloggerOverviewChart", label: "博主数据概览图" },
      { key: "fansGenderAgeChart", label: "性别分布+年龄分布" },
    ],
    [{
      dailyNotePerformanceChart: pngPath,
      dailyNotePicturePerformanceChart: picturePath,
      dailyNoteVideoPerformanceChart: videoPath,
      bloggerOverviewChart: overviewPath,
      fansGenderAgeChart: combinedPath,
    }],
  );

  const archive = await JSZip.loadAsync(readFileSync(xlsxPath));
  assert.ok(archive.file("xl/media/pgy_chart_1.png"));
  assert.ok(archive.file("xl/media/pgy_chart_2.png"));
  assert.ok(archive.file("xl/media/pgy_chart_3.png"));
  assert.ok(archive.file("xl/media/pgy_chart_4.png"));
  assert.ok(archive.file("xl/media/pgy_chart_5.png"));
  const drawing = await archive.file("xl/drawings/drawing1.xml").async("string");
  const anchors = [...drawing.matchAll(
    /<xdr:twoCellAnchor[^>]*><xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<xdr:cNvPr[^>]*name="([^"]+)"/g,
  )].map((match) => ({ col: Number(match[1]), row: Number(match[2]), name: match[3] }));
  assert.deepEqual(anchors, [
    { col: 0, row: 2, name: "日常笔记表现图（图文+视频）-1" },
    { col: 1, row: 2, name: "日常笔记表现图（图文）-1" },
    { col: 2, row: 2, name: "日常笔记表现图（视频）-1" },
    { col: 3, row: 2, name: "博主数据概览图-1" },
    { col: 4, row: 2, name: "性别分布+年龄分布-1" },
  ]);
  const sheet = await archive.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(sheet, /<drawing r:id="rId\d+"\/>/);
  const contentTypes = await archive.file("[Content_Types].xml").async("string");
  assert.match(contentTypes, /Extension="png" ContentType="image\/png"/);
});
