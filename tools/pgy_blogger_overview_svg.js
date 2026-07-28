function pgyOverviewGet(a, e) {
  let t = a;
  for (const n of String(e).split(".")) {
    if (t == null || typeof t !== "object" || !(n in t)) return void 0;
    t = t[n];
  }
  return t;
}

function pgyOverviewPick(a, e) {
  for (const t of e) {
    const n = pgyOverviewGet(a, t);
    if (n != null && String(n).trim() !== "") return n;
  }
  return void 0;
}

function pgyOverviewPickAny(a, e) {
  for (const t of a) {
    const n = pgyOverviewPick(t, e);
    if (n != null) return n;
  }
  return void 0;
}

function pgyOverviewLabel(a) {
  if (a == null || a === "") return "-";
  if (Array.isArray(a)) {
    const e = a.map((t) => pgyOverviewLabel(t)).filter((t) => t !== "-");
    return e.join("、") || "-";
  }
  if (typeof a === "object") {
    const e = pgyOverviewPick(a, ["name", "label", "title", "tagName", "contentTag", "industryName", "value", "text"]);
    return e == null ? "-" : pgyOverviewLabel(e);
  }
  const e = String(a).trim();
  return e && !["null", "undefined", "无数据"].includes(e) ? e : "-";
}

function pgyOverviewList(a) {
  if (!Array.isArray(a)) {
    const e = pgyOverviewLabel(a);
    return e === "-" ? [] : e.split(/[、,，/|｜]/).map((t) => t.trim()).filter(Boolean);
  }
  return a.map((e) => pgyOverviewLabel(e)).filter((e) => e !== "-");
}

function pgyOverviewNumber(a) {
  if (a == null || a === "") return null;
  const e = Number(String(a).replace(/[,%￥¥\s]/g, ""));
  return Number.isFinite(e) ? e : null;
}

function pgyOverviewFormatInteger(a) {
  const e = pgyOverviewNumber(a);
  return e == null ? "-" : Math.round(e).toLocaleString("en-US");
}

function pgyOverviewFormatCompact(a) {
  const e = pgyOverviewNumber(a);
  if (e == null) return "-";
  if (Math.abs(e) >= 1e4) {
    const t = (e / 1e4).toFixed(1).replace(/\.0$/, "");
    return t + "w";
  }
  return Math.round(e).toLocaleString("en-US");
}

function pgyOverviewFormatMoney(a) {
  const e = pgyOverviewNumber(a);
  return e == null || e <= 0 ? "-" : "¥" + Math.round(e).toLocaleString("en-US");
}

function pgyOverviewFormatPercent(a) {
  if (a == null || a === "") return "-";
  if (typeof a === "object") {
    const n = pgyOverviewPick(a, ["percent", "value", "rankPercent", "peerPercent", "ratio"]);
    return n == null ? "-" : pgyOverviewFormatPercent(n);
  }
  const e = String(a).trim();
  if (!e || ["null", "undefined", "无数据"].includes(e)) return "-";
  if (e.endsWith("%")) return e;
  const t = pgyOverviewNumber(e);
  return t == null ? "-" : e + "%";
}

function pgyOverviewPeerText(a) {
  const e = pgyOverviewFormatPercent(a);
  return e === "-" ? "优于 - 同行" : "优于 " + e + " 同行";
}

function pgyOverviewDate(a) {
  if (a == null || a === "") return "-";
  const e = String(a).trim();
  const t = e.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
  if (t) return t[0].replace(/[/.]/g, "-").split("-").map((n, s) => s ? n.padStart(2, "0") : n).join("-");
  const n = Number(a), s = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1e3 : n) : new Date(e);
  if (!Number.isFinite(s.getTime())) return "-";
  return [s.getFullYear(), String(s.getMonth() + 1).padStart(2, "0"), String(s.getDate()).padStart(2, "0")].join("-");
}

function pgyOverviewEllipsize(a, e) {
  const t = String(a ?? "-");
  return Array.from(t).length <= e ? t : Array.from(t).slice(0, Math.max(1, e - 3)).join("") + "...";
}

function pgyBuildBloggerOverviewData(a) {
  const e = a == null ? {} : a, t = e.profile ?? {}, n = e.effective ?? {}, s = e.daily30 ?? {}, i = e.fansSummary ?? {}, o = [t, n, s, i];
  const r = pgyOverviewList(pgyOverviewPick(t, ["personalTags", "featureTags", "contentTags", "tags", "categoryTags"]));
  const c = pgyOverviewList(pgyOverviewPick(s, ["noteType", "contentTags", "categories"]));
  const u = c.length ? c : r;
  const l = pgyOverviewList(pgyOverviewPick(t, ["cooperationIndustry", "cooperateIndustry", "cooperationIndustries", "industryTags", "businessTags", "tradeTags"]));
  const p = pgyOverviewPickAny(o, ["activeDays", "activeDays7", "activeDayNum", "sevenDayActiveDays", "sevenDaysActiveNum", "servicePerformance.activeDays"]);
  const h = pgyOverviewPickAny(o, ["responseRate", "replyRate", "inviteReplyRate", "inviteReplyRatio", "cooperateReplyRate", "servicePerformance.replyRate"]);
  const m = pgyOverviewPick(s, ["interactMedian", "interactionMedian", "mEngagementNum", "engagementMedian"]);
  const f = pgyOverviewPick(s, ["impMedianPercent", "impMedianRankPercent", "impMedianPeerPercent", "impRankPercent", "impRank"]);
  const g = pgyOverviewPick(s, ["readMedianPercent", "readMedianRankPercent", "readMedianPeerPercent", "readRankPercent", "readRank"]);
  const v = pgyOverviewPick(s, ["interactMedianPercent", "interactionMedianPercent", "mEngagementNumPercent", "engagementMedianPercent", "interactRankPercent"]);
  const y = pgyOverviewPick(i, ["fansGrowthRatePercent", "fansGrowthRankPercent", "fansGrowthPeerPercent", "fansIncreasePercent", "growthRankPercent"]);
  const b = pgyOverviewPick(t, ["liveSign.name", "noteSign.name", "mcnName", "orgName", "organization.name", "companyName"]);
  const S = pgyOverviewPick(t, ["bloggerAdvantage", "bloggerType", "kolType", "currentLevel.name", "currentLevel.label", "currentLevel"]);
  const C = pgyOverviewPickAny(o, ["dataUpdateTime", "dataUpdatedAt", "updateTime", "updatedAt", "lastUpdateTime", "lastUpdatedAt", "dataDate"]);
  const _ = pgyOverviewPickAny(o, ["activeLabel", "activeStatus", "activityLabel", "servicePerformance.activeLabel"]);
  const k = pgyOverviewPickAny(o, ["replyLabel", "replyStatus", "contactLabel", "servicePerformance.replyLabel"]);
  const P = pgyOverviewPick(t, ["verified", "isVerified", "verifyStatus", "certified"]);
  return {
    nickname: pgyOverviewLabel(pgyOverviewPick(t, ["name", "nickName", "nickname"])),
    avatar: pgyOverviewLabel(e.avatar ?? pgyOverviewPick(t, ["headPhoto", "avatar", "avatarUrl"])),
    redId: pgyOverviewLabel(pgyOverviewPick(t, ["redId", "redBookId", "xhsId"])),
    location: pgyOverviewLabel(pgyOverviewPick(t, ["location", "city", "province", "locationName"])),
    mcn: pgyOverviewLabel(b),
    verified: Boolean(P && !["0", "false", "未认证"].includes(String(P).toLowerCase())),
    categoryTags: (r.length ? r : c).slice(0, 3),
    fansText: pgyOverviewFormatCompact(pgyOverviewPick(t, ["fansCount", "fansNum", "followerCount"])),
    likeCollectText: pgyOverviewFormatCompact(pgyOverviewPick(t, ["likeCollectCountInfo", "likeCollectCount", "likeAndCollectCount"])),
    picturePriceText: pgyOverviewFormatMoney(pgyOverviewPick(t, ["picturePrice", "picPrice", "imagePrice"])),
    videoPriceText: pgyOverviewFormatMoney(pgyOverviewPick(t, ["videoPrice"])),
    updatedAtText: pgyOverviewDate(C),
    advantageText: pgyOverviewLabel(S),
    publishedNotesText: (() => {
      const Q = pgyOverviewFormatInteger(pgyOverviewPick(s, ["noteNumber", "noteCount"]));
      return Q === "-" ? "-" : Q + "篇";
    })(),
    contentCategoriesText: pgyOverviewEllipsize(u.join("、") || "-", 26),
    cooperationIndustryText: l.join("、") || "暂无",
    exposureText: pgyOverviewFormatInteger(pgyOverviewPick(s, ["impMedian", "exposureMedian"])),
    exposurePeerText: pgyOverviewPeerText(f),
    readText: pgyOverviewFormatInteger(pgyOverviewPick(s, ["readMedian"])),
    readPeerText: pgyOverviewPeerText(g),
    interactionText: pgyOverviewFormatInteger(m),
    interactionPeerText: pgyOverviewPeerText(v),
    activeDaysText: p == null || p === "" ? "-" : pgyOverviewFormatInteger(p) + "天",
    activeLabelText: pgyOverviewLabel(_),
    replyRateText: pgyOverviewFormatPercent(h),
    replyLabelText: pgyOverviewLabel(k),
    fansGrowthText: pgyOverviewFormatPercent(pgyOverviewPick(i, ["fansGrowthRate", "fansIncreaseRate", "fansChangeRate"])),
    fansGrowthPeerText: pgyOverviewPeerText(y)
  };
}

function pgyBloggerOverviewSvg(a) {
  const e = a ?? {}, t = (n) => pgyChartEscape(n == null || n === "" ? "-" : String(n)), s = Array.isArray(e.categoryTags) ? e.categoryTags.slice(0, 3) : [];
  const i = s.map((n, o) => {
    const r = 126 + o * 112, c = pgyOverviewEllipsize(n, 6);
    return `<rect x="${r}" y="303" width="92" height="30" rx="4" fill="#f2f2f2"/><text x="${r + 10}" y="324" font-size="18" fill="#595959">${t(c)}</text>`;
  }).join("");
  const o = t(String(e.nickname ?? "-").slice(0, 1));
  const r = e.avatar && e.avatar !== "-" ? `<image href="${t(e.avatar)}" x="126" y="164" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1066" viewBox="0 0 2048 1066">
<defs><clipPath id="avatarClip"><circle cx="178" cy="216" r="52"/></clipPath></defs>
<rect width="2048" height="1066" fill="#f7f7f9"/>
<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,Arial,sans-serif">
<rect x="96" y="20" width="520" height="98" rx="14" fill="#fff"/><rect x="126" y="42" width="214" height="48" rx="5" fill="#fff" stroke="#eee"/><rect x="340" y="42" width="246" height="48" rx="5" fill="#f6f6f6"/><text x="188" y="75" font-size="24" font-weight="600" fill="#262626">笔记主页</text><text x="424" y="75" font-size="24" fill="#666">直播主页</text>
<rect x="650" y="20" width="1298" height="74" rx="14" fill="#fff"/><text x="712" y="67" font-size="26" font-weight="700" fill="#262626">数据概览</text><text x="856" y="67" font-size="24" fill="#777">笔记数据</text><text x="996" y="67" font-size="24" fill="#777">粉丝分析</text><line x1="700" y1="92" x2="826" y2="92" stroke="#c73549" stroke-width="2"/><text x="1632" y="66" font-size="21" fill="#aaa">数据更新至： ${t(e.updatedAtText)}</text>
<rect x="96" y="120" width="520" height="500" rx="14" fill="#fff"/><circle cx="178" cy="216" r="52" fill="#e8edf4"/><text x="164" y="229" font-size="34" font-weight="700" fill="#6d87a8">${o}</text>${r}<text x="252" y="194" font-size="24" font-weight="600" fill="#262626">${t(pgyOverviewEllipsize(e.nickname, 12))}</text><circle cx="390" cy="188" r="12" fill="#e9f1ff"/><text x="385" y="194" font-size="14" fill="#4d7ed8">●</text>${e.verified ? '<circle cx="427" cy="188" r="12" fill="#edf9ef" stroke="#5ab76b"/><path d="M421 188l4 4 7-9" fill="none" stroke="#5ab76b" stroke-width="2"/>' : ""}
<text x="252" y="236" font-size="19" fill="#999">小红书号：</text><text x="354" y="236" font-size="20" fill="#5273b4">${t(e.redId)}</text><text x="252" y="276" font-size="18" fill="#999">● ${t(pgyOverviewEllipsize(e.location, 10))}</text><rect x="420" y="262" width="12" height="14" fill="none" stroke="#777" stroke-width="2"/><line x1="424" y1="265" x2="424" y2="273" stroke="#777"/><line x1="428" y1="265" x2="428" y2="273" stroke="#777"/><text x="440" y="276" font-size="18" fill="#5273b4">${t(pgyOverviewEllipsize(e.mcn, 8))}</text>${i}
<text x="198" y="405" font-size="22" fill="#262626">粉丝数</text><text x="402" y="405" font-size="22" fill="#262626">获赞与收藏</text><text x="192" y="460" font-size="32" font-weight="700" fill="#262626">${t(e.fansText)}</text><text x="402" y="460" font-size="32" font-weight="700" fill="#262626">${t(e.likeCollectText)}</text><line x1="126" y1="500" x2="586" y2="500" stroke="#f1f1f1"/>
<rect x="126" y="530" width="210" height="56" rx="6" fill="#f7f7f7"/><rect x="352" y="530" width="234" height="56" rx="6" fill="#f23b49"/><text x="190" y="567" font-size="22" fill="#333">☆ 收藏</text><circle cx="413" cy="558" r="7" fill="none" stroke="#fff" stroke-width="2"/><circle cx="423" cy="558" r="7" fill="none" stroke="#fff" stroke-width="2"/><text x="442" y="567" font-size="22" fill="#fff">邀约</text>
<rect x="96" y="650" width="520" height="390" rx="14" fill="#fff"/><text x="126" y="708" font-size="28" font-weight="600" fill="#262626">合作报价</text><rect x="126" y="736" width="460" height="126" rx="5" fill="#fff" stroke="#e8e8e8"/><text x="158" y="786" font-size="22" fill="#595959">图文笔记一口价</text><text x="158" y="832" font-size="27" fill="#262626">${t(e.picturePriceText)}</text><circle cx="552" cy="798" r="14" fill="none" stroke="#d73c51" stroke-width="3"/><text x="545" y="805" font-size="22" fill="#d73c51">+</text><rect x="126" y="882" width="460" height="126" rx="5" fill="#fff" stroke="#e8e8e8"/><text x="158" y="932" font-size="22" fill="#595959">视频笔记一口价</text><text x="158" y="978" font-size="27" fill="#262626">${t(e.videoPriceText)}</text><circle cx="552" cy="944" r="14" fill="none" stroke="#d73c51" stroke-width="3"/><text x="545" y="951" font-size="22" fill="#d73c51">+</text>
<rect x="650" y="112" width="1298" height="928" rx="14" fill="#fff"/><text x="700" y="174" font-size="28" font-weight="700" fill="#262626">数据概览</text><line x1="650" y1="212" x2="1948" y2="212" stroke="#eee"/>
<rect x="700" y="240" width="1198" height="78" rx="9" fill="#f7f7f7"/><text x="720" y="288" font-size="21" fill="#999">博主优势</text><text x="820" y="288" font-size="22" font-weight="600" fill="#262626">${t(pgyOverviewEllipsize(e.advantageText, 10))}</text><line x1="948" y1="257" x2="948" y2="302" stroke="#ddd"/><text x="972" y="288" font-size="21" fill="#999">发布笔记</text><text x="1068" y="288" font-size="22" font-weight="600" fill="#262626">${t(e.publishedNotesText)}</text><line x1="1166" y1="257" x2="1166" y2="302" stroke="#ddd"/><text x="1190" y="288" font-size="21" fill="#999">内容类目</text><text x="1294" y="288" font-size="22" font-weight="600" fill="#262626">${t(pgyOverviewEllipsize(e.contentCategoriesText, 18))}</text><line x1="1582" y1="257" x2="1582" y2="302" stroke="#ddd"/><text x="1606" y="288" font-size="21" fill="#999">合作行业</text><text x="1710" y="288" font-size="22" font-weight="600" fill="#262626">${t(pgyOverviewEllipsize(e.cooperationIndustryText, 10))}</text>
<rect x="700" y="344" width="1198" height="292" rx="9" fill="#fff" stroke="#e8e8e8"/><rect x="726" y="372" width="34" height="34" rx="8" fill="#fff0e7"/><line x1="736" y1="382" x2="750" y2="382" stroke="#e8753a" stroke-width="2"/><line x1="736" y1="389" x2="750" y2="389" stroke="#e8753a" stroke-width="2"/><line x1="736" y1="396" x2="750" y2="396" stroke="#e8753a" stroke-width="2"/><text x="778" y="400" font-size="27" font-weight="600" fill="#262626">笔记数据</text><rect x="726" y="430" width="112" height="48" rx="6" fill="#fff0f1"/><text x="748" y="462" font-size="21" font-weight="600" fill="#d43d51">按规模</text><rect x="850" y="430" width="100" height="48" rx="6" fill="#f7f7f7"/><text x="872" y="462" font-size="21" fill="#555">按成本</text><rect x="1658" y="430" width="218" height="48" rx="6" fill="#f7f7f7"/><rect x="1664" y="436" width="112" height="36" rx="5" fill="#fff" stroke="#eee"/><text x="1680" y="461" font-size="20" fill="#262626">日常笔记</text><text x="1788" y="461" font-size="20" fill="#777">合作笔记</text>
<text x="726" y="528" font-size="21" fill="#666">曝光中位数</text><line x1="726" y1="535" x2="840" y2="535" stroke="#999" stroke-dasharray="5 5"/><text x="726" y="574" font-size="31" font-weight="700" fill="#111">${t(e.exposureText)}</text><text x="726" y="608" font-size="19" fill="#777">${t(e.exposurePeerText)}</text><line x1="1078" y1="506" x2="1078" y2="608" stroke="#ddd"/><text x="1110" y="528" font-size="21" fill="#666">阅读中位数</text><line x1="1110" y1="535" x2="1224" y2="535" stroke="#999" stroke-dasharray="5 5"/><text x="1110" y="574" font-size="31" font-weight="700" fill="#111">${t(e.readText)}</text><text x="1110" y="608" font-size="19" fill="#777">${t(e.readPeerText)}</text><line x1="1500" y1="506" x2="1500" y2="608" stroke="#ddd"/><text x="1532" y="528" font-size="21" fill="#666">互动中位数</text><line x1="1532" y1="535" x2="1646" y2="535" stroke="#999" stroke-dasharray="5 5"/><text x="1532" y="574" font-size="31" font-weight="700" fill="#111">${t(e.interactionText)}</text><text x="1532" y="608" font-size="19" fill="#777">${t(e.interactionPeerText)}</text>
<rect x="700" y="662" width="574" height="240" rx="9" fill="#fff" stroke="#e8e8e8"/><rect x="726" y="690" width="34" height="34" rx="8" fill="#e8f4ff"/><text x="738" y="715" font-size="19" fill="#4a91d8">◇</text><text x="778" y="716" font-size="27" font-weight="600" fill="#262626">服务表现</text><text x="726" y="778" font-size="21" fill="#666">近7天活跃天数</text><line x1="726" y1="786" x2="862" y2="786" stroke="#999" stroke-dasharray="5 5"/><text x="726" y="826" font-size="31" font-weight="700" fill="#111">${t(e.activeDaysText)}</text><rect x="726" y="846" width="70" height="29" fill="#eef2ff"/><text x="736" y="868" font-size="18" fill="#5273b4">${t(e.activeLabelText)}</text><line x1="986" y1="758" x2="986" y2="866" stroke="#ddd"/><text x="1020" y="778" font-size="21" fill="#666">邀约48小时回复率</text><line x1="1020" y1="786" x2="1180" y2="786" stroke="#999" stroke-dasharray="5 5"/><text x="1020" y="826" font-size="31" font-weight="700" fill="#111">${t(e.replyRateText)}</text><rect x="1020" y="846" width="82" height="29" fill="#eef2ff"/><text x="1030" y="868" font-size="18" fill="#5273b4">${t(e.replyLabelText)}</text>
<rect x="1300" y="662" width="598" height="240" rx="9" fill="#fff" stroke="#e8e8e8"/><rect x="1326" y="690" width="34" height="34" rx="8" fill="#e8f7f4"/><line x1="1335" y1="713" x2="1335" y2="701" stroke="#58aa9b" stroke-width="2"/><line x1="1335" y1="713" x2="1351" y2="713" stroke="#58aa9b" stroke-width="2"/><polyline points="1338,709 1343,704 1348,707 1353,698" fill="none" stroke="#58aa9b" stroke-width="2"/><text x="1378" y="716" font-size="27" font-weight="600" fill="#262626">成长表现</text><text x="1326" y="778" font-size="21" fill="#666">粉丝量变化幅度</text><line x1="1326" y1="786" x2="1464" y2="786" stroke="#999" stroke-dasharray="5 5"/><text x="1326" y="826" font-size="31" font-weight="700" fill="#111">${t(e.fansGrowthText)}</text><text x="1326" y="868" font-size="19" fill="#777">${t(e.fansGrowthPeerText)}</text>
</g></svg>`;
}
