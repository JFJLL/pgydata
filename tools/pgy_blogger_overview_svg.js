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
    const e = pgyOverviewPick(a, ["taxonomy1Tag", "name", "label", "title", "tagName", "contentTag", "industryName", "value", "text"]);
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

function pgyOverviewCategoryList(a) {
  const e = [];
  const t = (n) => {
    const s = String(n ?? "").trim();
    s && s !== "-" && !e.includes(s) && e.push(s);
  };
  for (const n of Array.isArray(a) ? a : a == null ? [] : [a]) {
    if (typeof n === "object" && n) {
      t(pgyOverviewPick(n, ["taxonomy1Tag", "categoryName", "contentTag", "name", "label"]));
    } else {
      for (const s of pgyOverviewList(n)) t(s);
    }
  }
  return e;
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

function pgyOverviewFormatAudience(a) {
  const e = pgyOverviewNumber(a);
  if (e == null) return "-";
  if (Math.abs(e) >= 1e4) return (e / 1e4).toFixed(1).replace(/\.0$/, "") + "w";
  return String(Math.round(e));
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

function pgyOverviewTextWidth(a, e) {
  return Array.from(String(a ?? "")).reduce((t, n) => t + (n.charCodeAt(0) > 127 ? e : /[A-Z0-9]/.test(n) ? e * 0.64 : e * 0.54), 0);
}

function pgyOverviewFitText(a, e, t) {
  const n = String(a ?? "-");
  if (pgyOverviewTextWidth(n, e) <= t) return n;
  const s = Array.from(n);
  while (s.length && pgyOverviewTextWidth(s.join("") + "...", e) > t) s.pop();
  return (s.join("") || Array.from(n)[0] || "-") + "...";
}

function pgyBuildBloggerOverviewData(a) {
  const e = a == null ? {} : a, t = e.profile ?? {}, n = e.effective ?? {}, s = e.daily30 ?? {}, i = e.fansSummary ?? {}, d = e.overview ?? {}, o = [d, t, n, s, i];
  const profileCategories = pgyOverviewCategoryList(pgyOverviewPick(t, ["contentTags", "categoryTags", "top2CategoryList"]));
  const featureTags = pgyOverviewList(pgyOverviewPick(t, ["featureTags", "tags"]));
  const personaTags = pgyOverviewList(pgyOverviewPick(t, ["personalTags"]));
  const u = [];
  for (const D of [...profileCategories, ...featureTags]) u.includes(D) || u.push(D);
  const l = pgyOverviewList(pgyOverviewPick(d, ["noteType"]) ?? pgyOverviewPick(s, ["noteType", "contentTags", "categories"]));
  const cats = l.length ? l : u;
  const trades = pgyOverviewList(
    pgyOverviewPick(d, ["tradeNames"]) ?? pgyOverviewPick(t, ["cooperationIndustry", "cooperateIndustry", "cooperationIndustries", "industryTags", "businessTags"])
  );
  const p = pgyOverviewPick(d, ["activeDayInLast7"]) ?? pgyOverviewPickAny(o, ["activeDays", "activeDays7", "activeDayNum", "sevenDayActiveDays", "servicePerformance.activeDays"]);
  const h = pgyOverviewPick(d, ["responseRate"]) ?? pgyOverviewPickAny(o, ["replyRate", "inviteReplyRate", "inviteReplyRatio", "servicePerformance.replyRate"]);
  const exposure = pgyOverviewPick(d, ["mAccumImpNum"]) ?? pgyOverviewPick(s, ["impMedian", "exposureMedian"]);
  const f = pgyOverviewPick(d, ["mAccumImpCompare"]) ?? pgyOverviewPick(s, ["impMedianBeyondRate", "impMedianPercent", "impMedianRankPercent"]);
  const readMedian = pgyOverviewPick(d, ["mValidRawReadFeedNum"]) ?? pgyOverviewPick(s, ["readMedian"]);
  const g = pgyOverviewPick(d, ["mValidRawReadFeedCompare"]) ?? pgyOverviewPick(s, ["readMedianBeyondRate", "readMedianPercent", "readMedianRankPercent"]);
  const m = pgyOverviewPick(d, ["mEngagementNum"]) ?? pgyOverviewPick(s, ["interactionMedian", "interactMedian", "mEngagementNum", "engagementMedian"]);
  const v = pgyOverviewPick(d, ["mEngagementNumCompare"]) ?? pgyOverviewPick(s, ["interactionBeyondRate", "interactMedianPercent", "mEngagementNumPercent"]);
  const growth = pgyOverviewPick(d, ["fans30GrowthRate"]) ?? pgyOverviewPick(i, ["fansGrowthRate", "fansIncreaseRate", "fansChangeRate"]);
  const y = pgyOverviewPick(d, ["fans30GrowthBeyondRate"]) ?? pgyOverviewPick(i, ["fansGrowthBeyondRate", "fansGrowthRatePercent", "fansGrowthRankPercent", "growthRankPercent"]);
  const b = pgyOverviewPick(t, ["liveSign.name", "noteSign.name", "mcnName", "orgName", "organization.name", "companyName"]);
  const S = pgyOverviewPick(d, ["kolAdvantage"]) ?? pgyOverviewPick(t, ["bloggerAdvantage", "kolAdvantage", "currentLevel.name", "currentLevel.label"]);
  let advantageText = pgyOverviewLabel(S);
  if (/^-?\d+(?:\.\d+)?$/.test(advantageText)) advantageText = "-";
  const C = pgyOverviewPick(d, ["dateKey"]) ?? pgyOverviewPickAny(o, ["dataUpdateTime", "dataUpdatedAt", "updateTime", "updatedAt", "lastUpdateTime", "dataDate"]);
  const _ = d.isActive === true ? "活跃" : pgyOverviewPickAny(o, ["activeLabel", "activeStatus", "activityLabel", "servicePerformance.activeLabel"]);
  const k = d.easyConnect === true ? "好联系" : pgyOverviewPickAny(o, ["replyLabel", "replyStatus", "contactLabel", "servicePerformance.replyLabel"]);
  const level = pgyOverviewNumber(pgyOverviewPick(t, ["currentLevel.level", "currentLevel"]));
  const noteCount = pgyOverviewPick(d, ["noteNumber"]) ?? pgyOverviewPick(s, ["noteNumber", "noteCount"]);
  const genderLabel = pgyOverviewLabel(pgyOverviewPick(t, ["gender", "sex"]));
  return {
    nickname: pgyOverviewLabel(pgyOverviewPick(t, ["name", "nickName", "nickname"])),
    avatar: pgyOverviewLabel(e.avatar ?? pgyOverviewPick(t, ["headPhoto", "avatar", "avatarUrl"])),
    redId: pgyOverviewLabel(pgyOverviewPick(t, ["redId", "redBookId", "xhsId"])),
    location: pgyOverviewLabel(pgyOverviewPick(t, ["location", "city", "province", "locationName"])),
    mcn: (() => {
      const D = pgyOverviewLabel(b);
      return D === "-" ? "无机构" : D;
    })(),
    genderText: genderLabel === "女" || genderLabel === "男" ? genderLabel : "-",
    healthLevel: level == null || level < 0 ? null : Math.round(level),
    profileSummaryText: personaTags.join("、") || "-",
    travelAreaText: pgyOverviewList(pgyOverviewPick(t, ["travelAreaList", "travelAreas"])).join("、") || "-",
    categoryTags: u.slice(0, 6),
    fansText: pgyOverviewFormatAudience(pgyOverviewPick(t, ["fansCount", "fansNum", "followerCount"])),
    likeCollectText: pgyOverviewFormatCompact(pgyOverviewPick(t, ["likeCollectCountInfo", "likeCollectCount", "likeAndCollectCount"])),
    picturePriceText: pgyOverviewFormatMoney(pgyOverviewPick(t, ["picturePrice", "picPrice", "imagePrice"])),
    videoPriceText: pgyOverviewFormatMoney(pgyOverviewPick(t, ["videoPrice"])),
    updatedAtText: pgyOverviewDate(C),
    advantageText,
    publishedNotesText: (() => {
      const D = pgyOverviewFormatInteger(noteCount);
      return D === "-" ? "-" : D + "篇";
    })(),
    contentCategoriesText: pgyOverviewEllipsize(cats.join("、") || "-", 26),
    cooperationIndustryText: trades.join("、") || "暂无",
    exposureText: pgyOverviewFormatInteger(exposure),
    exposurePeerText: pgyOverviewPeerText(f),
    readText: pgyOverviewFormatInteger(readMedian),
    readPeerText: pgyOverviewPeerText(g),
    interactionText: pgyOverviewFormatInteger(m),
    interactionPeerText: pgyOverviewPeerText(v),
    activeDaysText: p == null || p === "" ? "-" : pgyOverviewFormatInteger(p) + "天",
    activeLabelText: pgyOverviewLabel(_),
    replyRateText: pgyOverviewFormatPercent(h),
    replyLabelText: pgyOverviewLabel(k),
    fansGrowthText: pgyOverviewFormatPercent(growth),
    fansGrowthPeerText: pgyOverviewPeerText(y)
  };
}

const PGY_OVERVIEW_SHIELD_PNG = {
  2: "data:image/png;base64,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",
  0: "data:image/png;base64,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"
};

function pgyOverviewShieldSvg(a, e, t) {
  const n = Number(a) === 2 ? PGY_OVERVIEW_SHIELD_PNG[2] : PGY_OVERVIEW_SHIELD_PNG[0];
  return `<image href="${n}" x="${e - 11}" y="${t - 11}" width="22" height="22" preserveAspectRatio="xMidYMid meet"/>`;
}

function pgyOverviewNicknameSvg(a, e, t, n, s) {
  const i = /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/gu;
  let o = "", r = e, c = 0;
  for (const u of String(a ?? "-").matchAll(i)) {
    const l = String(a).slice(c, u.index);
    l && (o += `<text x="${r}" y="${t}" font-size="${n}" font-weight="600" fill="#262626">${pgyChartEscape(l)}</text>`, r += pgyOverviewTextWidth(l, n));
    const p = u[0], h = s == null ? void 0 : s[p];
    h ? o += `<image href="${pgyChartEscape(h)}" x="${r}" y="${t - n + 2}" width="${n}" height="${n}" preserveAspectRatio="xMidYMid meet"/>` : o += `<text x="${r}" y="${t}" font-size="${n}" font-weight="600" fill="#262626">${pgyChartEscape(p)}</text>`;
    r += n, c = u.index + p.length;
  }
  const u = String(a ?? "-").slice(c);
  return u && (o += `<text x="${r}" y="${t}" font-size="${n}" font-weight="600" fill="#262626">${pgyChartEscape(u)}</text>`), o;
}

function pgyOverviewWarn(a) {
  (typeof j === "undefined" ? console : j).warn(a);
}

async function pgyInlineOverviewAvatar(a) {
  const e = String(a ?? "");
  if (!e || e === "-" || e.startsWith("data:image/") || !e.startsWith("http")) return e;
  try {
    const t = await fetch(e, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6e3)
    });
    if (!t.ok) return e;
    const n = Buffer.from(await t.arrayBuffer());
    if (!n.length || n.length > 5 * 1024 * 1024) return e;
    return `data:${t.headers.get("content-type") || "image/jpeg"};base64,${n.toString("base64")}`;
  } catch (t) {
    return pgyOverviewWarn(`[pgy-chart] 头像内嵌失败，继续生成概览图: ${t instanceof Error ? t.message : String(t)}`), e;
  }
}

async function pgyInlineOverviewEmojis(a) {
  const e = [...new Set(String(a ?? "").match(/\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/gu) ?? [])].slice(0, 6), t = {};
  await Promise.all(e.map(async (n) => {
    const s = Array.from(n).map((i) => i.codePointAt(0).toString(16)).filter((i) => i !== "fe0f").join("-");
    try {
      const i = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${s}.png`, { signal: AbortSignal.timeout(4e3) });
      if (!i.ok) return;
      const o = Buffer.from(await i.arrayBuffer());
      o.length && o.length < 256 * 1024 && (t[n] = `data:image/png;base64,${o.toString("base64")}`);
    } catch {
    }
  }));
  return t;
}

async function pgyPrepareOverviewData(a) {
  const e = { ...(a ?? {}) };
  return e.avatar = await pgyInlineOverviewAvatar(e.avatar), e.nicknameEmojiImages = await pgyInlineOverviewEmojis(e.nickname), e;
}

function pgyBloggerOverviewSvg(a) {
  const e = a ?? {}, t = (n) => pgyChartEscape(n == null || n === "" ? "-" : String(n));
  const nickname = pgyOverviewFitText(e.nickname, 24, 278);
  const nicknameMarkup = pgyOverviewNicknameSvg(nickname, 252, 194, 24, e.nicknameEmojiImages);
  let iconX = 252 + Math.ceil(pgyOverviewTextWidth(nickname, 24)) + 16;
  let profileIcons = "";
  if (e.genderText === "女" || e.genderText === "男") {
    const female = e.genderText === "女", personColor = female ? "#ff6f91" : "#4d7ed8", personBackground = female ? "#fff0f4" : "#e9f1ff";
    profileIcons += `<circle cx="${iconX}" cy="185" r="12" fill="${personBackground}"/><circle cx="${iconX}" cy="181" r="4.2" fill="${personColor}"/><path d="M${iconX - 6} 192c1.2-5 10.8-5 12 0" fill="${personColor}"/>`;
    iconX += 36;
  }
  if (e.healthLevel != null) profileIcons += pgyOverviewShieldSvg(e.healthLevel, iconX, 184);
  const hasSummary = e.profileSummaryText && e.profileSummaryText !== "-";
  const summaryRow = hasSummary
    ? `<text x="252" y="275" font-size="18" fill="#999">${t(pgyOverviewFitText(e.profileSummaryText, 18, 210))}</text>`
    : "";
  const infoY = hasSummary ? 307 : 276;
  const hasTravel = e.travelAreaText && e.travelAreaText !== "-";
  const travelRow = hasTravel
    ? `<path d="M252 ${infoY + 30} L272 ${infoY + 18} L262 ${infoY + 34} Z" fill="#b9bec7"/><text x="280" y="${infoY + 32}" font-size="18" fill="#595959">${t(pgyOverviewFitText(e.travelAreaText, 18, 200))}</text>`
    : "";
  const tags = Array.isArray(e.categoryTags) ? e.categoryTags.slice(0, 6) : [];
  const tagY = infoY + (hasTravel ? 47 : 17);
  let tagX = 126, tagSvg = "";
  for (const n of tags) {
    const label = pgyOverviewFitText(n, 18, 76);
    const w = Math.max(48, Math.min(98, Math.ceil(pgyOverviewTextWidth(label, 18)) + 20));
    if (tagX + w > 586) break;
    tagSvg += `<rect x="${tagX}" y="${tagY}" width="${w}" height="30" rx="4" fill="#f2f2f2"/><text x="${tagX + 10}" y="${tagY + 21}" font-size="18" fill="#595959">${t(label)}</text>`;
    tagX += w + 10;
  }
  const activeBadge = e.activeLabelText && e.activeLabelText !== "-"
    ? `<rect x="726" y="846" width="${Math.ceil(pgyOverviewTextWidth(e.activeLabelText, 18)) + 20}" height="29" fill="#eef2ff"/><text x="736" y="868" font-size="18" fill="#5273b4">${t(e.activeLabelText)}</text>`
    : "";
  const replyBadge = e.replyLabelText && e.replyLabelText !== "-"
    ? `<rect x="1020" y="846" width="${Math.ceil(pgyOverviewTextWidth(e.replyLabelText, 18)) + 20}" height="29" fill="#eef2ff"/><text x="1030" y="868" font-size="18" fill="#5273b4">${t(e.replyLabelText)}</text>`
    : "";
  const o = t(String(e.nickname ?? "-").slice(0, 1));
  const r = e.avatar && e.avatar !== "-" ? `<image href="${t(e.avatar)}" x="126" y="164" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1066" viewBox="0 0 2048 1066">
<defs><clipPath id="avatarClip"><circle cx="178" cy="216" r="52"/></clipPath></defs>
<rect width="2048" height="1066" fill="#f7f7f9"/>
<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,Arial,sans-serif">
<rect x="96" y="20" width="520" height="98" rx="14" fill="#fff"/><rect x="126" y="42" width="214" height="48" rx="5" fill="#fff" stroke="#eee"/><rect x="340" y="42" width="246" height="48" rx="5" fill="#f6f6f6"/><text x="188" y="75" font-size="24" font-weight="600" fill="#262626">笔记主页</text><text x="424" y="75" font-size="24" fill="#666">直播主页</text>
<rect x="650" y="20" width="1298" height="74" rx="14" fill="#fff"/><text x="712" y="67" font-size="26" font-weight="700" fill="#262626">数据概览</text><text x="856" y="67" font-size="24" fill="#777">笔记数据</text><text x="996" y="67" font-size="24" fill="#777">粉丝分析</text><line x1="700" y1="92" x2="826" y2="92" stroke="#c73549" stroke-width="2"/><text x="1632" y="66" font-size="21" fill="#aaa">数据更新至： ${t(e.updatedAtText)}</text>
<rect x="96" y="120" width="520" height="500" rx="14" fill="#fff"/><circle cx="178" cy="216" r="52" fill="#e8edf4"/><text x="164" y="229" font-size="34" font-weight="700" fill="#6d87a8">${o}</text>${r}${nicknameMarkup}${profileIcons}
<text x="252" y="236" font-size="19" fill="#999">小红书号：</text><text x="354" y="236" font-size="20" fill="#2878ff">${t(e.redId)}</text><rect x="530" y="222" width="11" height="12" rx="1" fill="none" stroke="#999"/><rect x="526" y="226" width="11" height="12" rx="1" fill="none" stroke="#999"/>${summaryRow}<text x="252" y="${infoY}" font-size="18" fill="#999">● ${t(pgyOverviewFitText(e.location, 18, 132))}</text><rect x="420" y="${infoY - 14}" width="12" height="14" fill="none" stroke="#777" stroke-width="2"/><line x1="424" y1="${infoY - 11}" x2="424" y2="${infoY - 3}" stroke="#777"/><line x1="428" y1="${infoY - 11}" x2="428" y2="${infoY - 3}" stroke="#777"/><text x="440" y="${infoY}" font-size="18" fill="#5273b4">${t(pgyOverviewFitText(e.mcn, 18, 105))}</text>${travelRow}${tagSvg}
<text x="198" y="423" font-size="22" fill="#262626">粉丝数</text><text x="402" y="423" font-size="22" fill="#262626">获赞与收藏</text><text x="192" y="468" font-size="32" font-weight="700" fill="#262626">${t(e.fansText)}</text><text x="402" y="468" font-size="32" font-weight="700" fill="#262626">${t(e.likeCollectText)}</text><line x1="126" y1="500" x2="586" y2="500" stroke="#f1f1f1"/>
<rect x="126" y="530" width="210" height="56" rx="6" fill="#f7f7f7"/><rect x="352" y="530" width="234" height="56" rx="6" fill="#f23b49"/><text x="190" y="567" font-size="22" fill="#333">☆ 收藏</text><circle cx="413" cy="558" r="7" fill="none" stroke="#fff" stroke-width="2"/><circle cx="423" cy="558" r="7" fill="none" stroke="#fff" stroke-width="2"/><text x="442" y="567" font-size="22" fill="#fff">邀约</text>
<rect x="96" y="650" width="520" height="390" rx="14" fill="#fff"/><text x="126" y="708" font-size="28" font-weight="600" fill="#262626">合作报价</text><rect x="126" y="736" width="460" height="126" rx="5" fill="#fff" stroke="#e8e8e8"/><text x="158" y="786" font-size="22" fill="#595959">图文笔记一口价</text><text x="158" y="832" font-size="27" fill="#262626">${t(e.picturePriceText)}</text><circle cx="552" cy="798" r="14" fill="none" stroke="#d73c51" stroke-width="3"/><text x="545" y="805" font-size="22" fill="#d73c51">+</text><rect x="126" y="882" width="460" height="126" rx="5" fill="#fff" stroke="#e8e8e8"/><text x="158" y="932" font-size="22" fill="#595959">视频笔记一口价</text><text x="158" y="978" font-size="27" fill="#262626">${t(e.videoPriceText)}</text><circle cx="552" cy="944" r="14" fill="none" stroke="#d73c51" stroke-width="3"/><text x="545" y="951" font-size="22" fill="#d73c51">+</text>
<rect x="650" y="112" width="1298" height="928" rx="14" fill="#fff"/><text x="700" y="174" font-size="28" font-weight="700" fill="#262626">数据概览</text><line x1="650" y1="212" x2="1948" y2="212" stroke="#eee"/>
<rect x="700" y="240" width="1198" height="78" rx="9" fill="#f7f7f7"/><text x="720" y="288" font-size="21" fill="#999">博主优势</text><text x="820" y="288" font-size="22" font-weight="600" fill="#262626">${t(pgyOverviewEllipsize(e.advantageText, 10))}</text><line x1="948" y1="257" x2="948" y2="302" stroke="#ddd"/><text x="972" y="288" font-size="21" fill="#999">发布笔记</text><text x="1068" y="288" font-size="22" font-weight="600" fill="#262626">${t(e.publishedNotesText)}</text><line x1="1166" y1="257" x2="1166" y2="302" stroke="#ddd"/><text x="1190" y="288" font-size="21" fill="#999">内容类目</text><text x="1294" y="288" font-size="22" font-weight="600" fill="#262626">${t(pgyOverviewEllipsize(e.contentCategoriesText, 18))}</text><line x1="1582" y1="257" x2="1582" y2="302" stroke="#ddd"/><text x="1606" y="288" font-size="21" fill="#999">合作行业</text><text x="1710" y="288" font-size="22" font-weight="600" fill="#262626">${t(pgyOverviewEllipsize(e.cooperationIndustryText, 10))}</text>
<rect x="700" y="344" width="1198" height="292" rx="9" fill="#fff" stroke="#e8e8e8"/><rect x="726" y="372" width="34" height="34" rx="8" fill="#fff0e7"/><line x1="736" y1="382" x2="750" y2="382" stroke="#e8753a" stroke-width="2"/><line x1="736" y1="389" x2="750" y2="389" stroke="#e8753a" stroke-width="2"/><line x1="736" y1="396" x2="750" y2="396" stroke="#e8753a" stroke-width="2"/><text x="778" y="400" font-size="27" font-weight="600" fill="#262626">笔记数据</text><rect x="726" y="430" width="112" height="48" rx="6" fill="#fff0f1"/><text x="748" y="462" font-size="21" font-weight="600" fill="#d43d51">按规模</text><rect x="850" y="430" width="100" height="48" rx="6" fill="#f7f7f7"/><text x="872" y="462" font-size="21" fill="#555">按成本</text><rect x="1658" y="430" width="218" height="48" rx="6" fill="#f7f7f7"/><rect x="1664" y="436" width="112" height="36" rx="5" fill="#fff" stroke="#eee"/><text x="1680" y="461" font-size="20" fill="#262626">日常笔记</text><text x="1788" y="461" font-size="20" fill="#777">合作笔记</text>
<text x="726" y="528" font-size="21" fill="#666">曝光中位数</text><line x1="726" y1="535" x2="840" y2="535" stroke="#999" stroke-dasharray="5 5"/><text x="726" y="574" font-size="31" font-weight="700" fill="#111">${t(e.exposureText)}</text><text x="726" y="608" font-size="19" fill="#777">${t(e.exposurePeerText)}</text><line x1="1078" y1="506" x2="1078" y2="608" stroke="#ddd"/><text x="1110" y="528" font-size="21" fill="#666">阅读中位数</text><line x1="1110" y1="535" x2="1224" y2="535" stroke="#999" stroke-dasharray="5 5"/><text x="1110" y="574" font-size="31" font-weight="700" fill="#111">${t(e.readText)}</text><text x="1110" y="608" font-size="19" fill="#777">${t(e.readPeerText)}</text><line x1="1500" y1="506" x2="1500" y2="608" stroke="#ddd"/><text x="1532" y="528" font-size="21" fill="#666">互动中位数</text><line x1="1532" y1="535" x2="1646" y2="535" stroke="#999" stroke-dasharray="5 5"/><text x="1532" y="574" font-size="31" font-weight="700" fill="#111">${t(e.interactionText)}</text><text x="1532" y="608" font-size="19" fill="#777">${t(e.interactionPeerText)}</text>
<rect x="700" y="662" width="574" height="240" rx="9" fill="#fff" stroke="#e8e8e8"/><rect x="726" y="690" width="34" height="34" rx="8" fill="#e8f4ff"/><text x="738" y="715" font-size="19" fill="#4a91d8">◇</text><text x="778" y="716" font-size="27" font-weight="600" fill="#262626">服务表现</text><text x="726" y="778" font-size="21" fill="#666">近7天活跃天数</text><line x1="726" y1="786" x2="862" y2="786" stroke="#999" stroke-dasharray="5 5"/><text x="726" y="826" font-size="31" font-weight="700" fill="#111">${t(e.activeDaysText)}</text>${activeBadge}<line x1="986" y1="758" x2="986" y2="866" stroke="#ddd"/><text x="1020" y="778" font-size="21" fill="#666">邀约48小时回复率</text><line x1="1020" y1="786" x2="1180" y2="786" stroke="#999" stroke-dasharray="5 5"/><text x="1020" y="826" font-size="31" font-weight="700" fill="#111">${t(e.replyRateText)}</text>${replyBadge}
<rect x="1300" y="662" width="598" height="240" rx="9" fill="#fff" stroke="#e8e8e8"/><rect x="1326" y="690" width="34" height="34" rx="8" fill="#e8f7f4"/><line x1="1335" y1="713" x2="1335" y2="701" stroke="#58aa9b" stroke-width="2"/><line x1="1335" y1="713" x2="1351" y2="713" stroke="#58aa9b" stroke-width="2"/><polyline points="1338,709 1343,704 1348,707 1353,698" fill="none" stroke="#58aa9b" stroke-width="2"/><text x="1378" y="716" font-size="27" font-weight="600" fill="#262626">成长表现</text><text x="1326" y="778" font-size="21" fill="#666">粉丝量变化幅度</text><line x1="1326" y1="786" x2="1464" y2="786" stroke="#999" stroke-dasharray="5 5"/><text x="1326" y="826" font-size="31" font-weight="700" fill="#111">${t(e.fansGrowthText)}</text><text x="1326" y="868" font-size="19" fill="#777">${t(e.fansGrowthPeerText)}</text>
</g></svg>`;
}
