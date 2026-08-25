const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CREDITED_STATUS = 1;
const PENDING_STATUS = 0;
const CLOSED_STATUS = 2;
const FIRST_RECHARGE_PROMO_CODE = "first_recharge_v1";
const MAX_CUSTOM_RANGE_DAYS = 366;

const FEATURES = new Map([
  ["pgy:blogger", { key: "pgy-blogger", label: "蒲公英博主采集" }],
  ["pgy:blog", { key: "pgy-note", label: "蒲公英笔记采集" }],
  ["pgy:note", { key: "pgy-note", label: "蒲公英笔记采集" }],
  ["starmap:blogger", { key: "starmap-blogger", label: "星图主页采集" }],
  ["pgy-kol:", { key: "pgy-kol", label: "找博主" }],
]);

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function yuan(cents) {
  return Number((number(cents) / 100).toFixed(2));
}

function dayStart(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("无效日期");
  const cst = new Date(date.getTime() + CST_OFFSET_MS);
  return new Date(Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate()) - CST_OFFSET_MS);
}

function addDays(value, days) {
  return new Date(new Date(value).getTime() + number(days) * DAY_MS);
}

function dayKey(value) {
  return new Date(new Date(value).getTime() + CST_OFFSET_MS).toISOString().slice(0, 10);
}

function parseCstDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - CST_OFFSET_MS);
  return dayKey(date) === text ? date : null;
}

function buildPeriod(start, end, source) {
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return {
    source,
    days,
    from: dayKey(start),
    to: dayKey(addDays(end, -1)),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    previousStartAt: addDays(start, -days).toISOString(),
    previousEndAt: start.toISOString(),
  };
}

/** Dashboard time filters always use China Standard Time (UTC+8), never process TZ. */
function parseAnalyticsPeriod(query = {}, now = new Date()) {
  const from = String(query.from || "").trim();
  const to = String(query.to || "").trim();
  if (from || to) {
    const start = parseCstDate(from);
    const toStart = parseCstDate(to);
    if (!start || !toStart || toStart < start) {
      throw new Error("自定义日期必须为完整且有效的 YYYY-MM-DD");
    }
    const end = addDays(toStart, 1);
    if (Math.round((end - start) / DAY_MS) > MAX_CUSTOM_RANGE_DAYS) {
      throw new Error(`自定义日期范围最多 ${MAX_CUSTOM_RANGE_DAYS} 天`);
    }
    return buildPeriod(start, end, "custom");
  }

  const range = String(query.range || "30d").toLowerCase();
  if (!["7d", "30d", "90d"].includes(range)) {
    throw new Error("range 仅支持 7d、30d、90d 或自定义日期");
  }
  const end = addDays(dayStart(now), 1);
  return buildPeriod(addDays(end, -Number.parseInt(range, 10)), end, range);
}

function daySql(column) {
  return `strftime('%Y-%m-%d', datetime(${column}, '+8 hours'))`;
}

/** A task is distinct (user_id, task_id); each legacy record without task_id is one valid task. */
function taskCountSql() {
  return "COUNT(DISTINCT CASE WHEN task_id IS NOT NULL AND TRIM(task_id) <> '' THEN CAST(user_id AS TEXT) || ':' || hex(task_id) END) + COALESCE(SUM(CASE WHEN task_id IS NULL OR TRIM(task_id) = '' THEN 1 ELSE 0 END), 0)";
}

function feature(pluginId, taskType) {
  const plugin = String(pluginId || "").trim().toLowerCase();
  const task = String(taskType || "").trim().toLowerCase();
  return FEATURES.get(`${plugin}:${task}`)
    || FEATURES.get(`${plugin}:`)
    || { key: `other:${plugin || "unknown"}:${task || "unknown"}`, label: `其他 / ${plugin || "unknown"} · ${task || "unknown"}` };
}

function channelLabel(channel) {
  if (channel === "alipay") return "支付宝";
  if (channel === "wxpay") return "微信支付";
  return "legacy / 其他";
}

function kpi(value, previousValue) {
  const current = number(value);
  const previous = number(previousValue);
  if (previous === 0 && current > 0) {
    return { value: current, previousValue: previous, changePercent: null, changeType: "new" };
  }
  const changePercent = previous === 0 ? 0 : Number((((current - previous) / previous) * 100).toFixed(1));
  return {
    value: current,
    previousValue: previous,
    changePercent,
    changeType: changePercent > 0 ? "up" : changePercent < 0 ? "down" : "flat",
  };
}

function fillDays(period, rows, columns) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const output = [];
  for (let date = new Date(period.startAt); date < new Date(period.endAt); date = addDays(date, 1)) {
    const row = byDay.get(dayKey(date)) || {};
    output.push({
      day: dayKey(date),
      ...Object.fromEntries(columns.map((name) => [name, number(row[name])])),
    });
  }
  return output;
}

async function usageSummary(db, startAt, endAt) {
  return db.get(`
    SELECT COUNT(DISTINCT user_id) AS effectiveUsers,
           ${taskCountSql()} AS effectiveTasks,
           COALESCE(SUM(count), 0) AS collectedItems,
           COALESCE(SUM(count), 0) AS consumedPoints
    FROM consume_records
    WHERE created_at >= ? AND created_at < ?
  `, [startAt, endAt]);
}

async function usageTrend(db, period) {
  const rows = await db.all(`
    SELECT ${daySql("created_at")} AS day,
           COUNT(DISTINCT user_id) AS effectiveActiveUsers,
           ${taskCountSql()} AS effectiveTasks,
           COALESCE(SUM(count), 0) AS collectedItems
    FROM consume_records
    WHERE created_at >= ? AND created_at < ?
    GROUP BY day
    ORDER BY day
  `, [period.startAt, period.endAt]);
  return fillDays(period, rows, ["effectiveActiveUsers", "effectiveTasks", "collectedItems"]);
}

async function newUserTrend(db, period) {
  const rows = await db.all(`
    SELECT ${daySql("created_at")} AS day, COUNT(*) AS newUsers
    FROM users
    WHERE created_at >= ? AND created_at < ?
    GROUP BY day
    ORDER BY day
  `, [period.startAt, period.endAt]);
  return fillDays(period, rows, ["newUsers"]);
}

async function revenueTrend(db, period) {
  const rows = await db.all(`
    SELECT ${daySql("credited_at")} AS day, COALESCE(SUM(amount_cents), 0) AS revenueCents
    FROM recharge_orders
    WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ?
    GROUP BY day
    ORDER BY day
  `, [CREDITED_STATUS, period.startAt, period.endAt]);
  return fillDays(period, rows, ["revenueCents"])
    .map((row) => ({ day: row.day, value: yuan(row.revenueCents) }));
}

/** Revenue includes only credited orders whose credited_at is in range. */
async function financeTotals(db, startAt, endAt) {
  const [credited, created, firstPayers, repeatPayers] = await Promise.all([
    db.get(`SELECT COALESCE(SUM(amount_cents), 0) AS revenueCents, COUNT(*) AS creditedOrders, COUNT(DISTINCT user_id) AS payers
            FROM recharge_orders WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ?`,
    [CREDITED_STATUS, startAt, endAt]),
    db.get(`SELECT COUNT(*) AS createdOrders,
                   COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS creditedCreatedOrders,
                   COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS pendingOrders,
                   COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS closedOrders
            FROM recharge_orders WHERE created_at >= ? AND created_at < ?`,
    [CREDITED_STATUS, PENDING_STATUS, CLOSED_STATUS, startAt, endAt]),
    db.get(`/* First payer: first credited order falls inside the current period. */
            SELECT COUNT(DISTINCT r.user_id) AS count FROM recharge_orders r
            WHERE r.status = ? AND r.credited_at IS NOT NULL AND r.credited_at >= ? AND r.credited_at < ?
              AND NOT EXISTS (SELECT 1 FROM recharge_orders prior WHERE prior.user_id = r.user_id AND prior.status = ? AND prior.credited_at IS NOT NULL AND prior.credited_at < r.credited_at)`,
    [CREDITED_STATUS, startAt, endAt, CREDITED_STATUS]),
    db.get(`/* Repeat payer: credited in period and had a strictly earlier credited order. */
            SELECT COUNT(DISTINCT r.user_id) AS count FROM recharge_orders r
            WHERE r.status = ? AND r.credited_at IS NOT NULL AND r.credited_at >= ? AND r.credited_at < ?
              AND EXISTS (SELECT 1 FROM recharge_orders prior WHERE prior.user_id = r.user_id AND prior.status = ? AND prior.credited_at IS NOT NULL AND prior.credited_at < r.credited_at)`,
    [CREDITED_STATUS, startAt, endAt, CREDITED_STATUS]),
  ]);
  const revenueCents = number(credited.revenueCents);
  const creditedOrders = number(credited.creditedOrders);
  const payers = number(credited.payers);
  const createdOrders = number(created.createdOrders);
  return {
    revenueYuan: yuan(revenueCents),
    revenueCents,
    payers,
    creditedOrders,
    createdOrders,
    creditedCreatedOrders: number(created.creditedCreatedOrders),
    pendingOrders: number(created.pendingOrders),
    closedOrders: number(created.closedOrders),
    paymentConversionRate: createdOrders > 0 ? Number(((number(created.creditedCreatedOrders) / createdOrders) * 100).toFixed(1)) : null,
    aovYuan: creditedOrders > 0 ? Number((revenueCents / creditedOrders / 100).toFixed(2)) : null,
    arppuYuan: payers > 0 ? Number((revenueCents / payers / 100).toFixed(2)) : null,
    firstTimePayers: number(firstPayers.count),
    repeatPayers: number(repeatPayers.count),
  };
}

function mergeDimensions(createdRows, creditedRows, key) {
  const result = new Map();
  for (const row of createdRows) {
    const value = String(row[key] || "legacy");
    result.set(value, { key: value, createdOrders: number(row.createdOrders), creditedCreatedOrders: number(row.creditedCreatedOrders) });
  }
  for (const row of creditedRows) {
    const value = String(row[key] || "legacy");
    const item = result.get(value) || { key: value, createdOrders: 0, creditedCreatedOrders: 0 };
    Object.assign(item, {
      creditedOrders: number(row.creditedOrders),
      revenueCents: number(row.revenueCents),
      payers: number(row.payers),
      basePoints: number(row.basePoints),
      giftPoints: number(row.giftPoints),
      promotionPoints: number(row.promotionPoints),
    });
    result.set(value, item);
  }
  return [...result.values()].map((item) => ({
    ...item,
    creditedOrders: number(item.creditedOrders),
    revenueYuan: yuan(item.revenueCents),
    payers: number(item.payers),
    paymentConversionRate: item.createdOrders > 0 ? Number(((item.creditedCreatedOrders / item.createdOrders) * 100).toFixed(1)) : null,
    aovYuan: number(item.creditedOrders) > 0 ? Number((number(item.revenueCents) / number(item.creditedOrders) / 100).toFixed(2)) : null,
  }));
}

async function queryFinanceAnalytics(db, period) {
  const [recharge, previous, channelCreated, channelCredited, packageCreated, packageCredited, promoCreated, promoCredited, points, trend] = await Promise.all([
    financeTotals(db, period.startAt, period.endAt),
    financeTotals(db, period.previousStartAt, period.previousEndAt),
    db.all(`SELECT COALESCE(NULLIF(channel, ''), 'legacy') AS channel, COUNT(*) AS createdOrders, COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS creditedCreatedOrders FROM recharge_orders WHERE created_at >= ? AND created_at < ? GROUP BY channel`, [CREDITED_STATUS, period.startAt, period.endAt]),
    db.all(`SELECT COALESCE(NULLIF(channel, ''), 'legacy') AS channel, COUNT(*) AS creditedOrders, COALESCE(SUM(amount_cents), 0) AS revenueCents, COUNT(DISTINCT user_id) AS payers FROM recharge_orders WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ? GROUP BY channel`, [CREDITED_STATUS, period.startAt, period.endAt]),
    db.all(`SELECT package_id AS packageId, COUNT(*) AS createdOrders, COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS creditedCreatedOrders FROM recharge_orders WHERE created_at >= ? AND created_at < ? GROUP BY package_id`, [CREDITED_STATUS, period.startAt, period.endAt]),
    db.all(`SELECT package_id AS packageId, COUNT(*) AS creditedOrders, COALESCE(SUM(amount_cents), 0) AS revenueCents, COUNT(DISTINCT user_id) AS payers, COALESCE(SUM(base_count), 0) AS basePoints, COALESCE(SUM(gift_count), 0) AS giftPoints, COALESCE(SUM(promotion_count), 0) AS promotionPoints FROM recharge_orders WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ? GROUP BY package_id`, [CREDITED_STATUS, period.startAt, period.endAt]),
    db.get(`SELECT COUNT(*) AS createdOrders, COUNT(DISTINCT user_id) AS users, COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS creditedCreatedOrders FROM recharge_orders WHERE promotion_code = ? AND created_at >= ? AND created_at < ?`, [CREDITED_STATUS, FIRST_RECHARGE_PROMO_CODE, period.startAt, period.endAt]),
    db.get(`SELECT COUNT(*) AS creditedOrders, COUNT(DISTINCT user_id) AS creditedUsers, COALESCE(SUM(promotion_count), 0) AS extraPoints FROM recharge_orders WHERE promotion_code = ? AND status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ?`, [FIRST_RECHARGE_PROMO_CODE, CREDITED_STATUS, period.startAt, period.endAt]),
    db.get(`SELECT
      (SELECT COALESCE(SUM(balance), 0) FROM shumiao_accounts) AS totalCurrentBalance,
      (SELECT COALESCE(SUM(count), 0) FROM consume_records WHERE created_at >= ? AND created_at < ?) AS consumed,
      (SELECT COALESCE(SUM(base_count), 0) FROM recharge_orders WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ?) AS creditedBase,
      (SELECT COALESCE(SUM(gift_count), 0) FROM recharge_orders WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ?) AS creditedGift,
      (SELECT COALESCE(SUM(promotion_count), 0) FROM recharge_orders WHERE status = ? AND credited_at IS NOT NULL AND credited_at >= ? AND credited_at < ?) AS creditedPromotion,
      (SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) FROM admin_balance_adjustments WHERE created_at >= ? AND created_at < ?) AS adminAdded,
      (SELECT COALESCE(ABS(SUM(CASE WHEN delta < 0 THEN delta ELSE 0 END)), 0) FROM admin_balance_adjustments WHERE created_at >= ? AND created_at < ?) AS adminDeducted`,
    [period.startAt, period.endAt, CREDITED_STATUS, period.startAt, period.endAt, CREDITED_STATUS, period.startAt, period.endAt, CREDITED_STATUS, period.startAt, period.endAt, period.startAt, period.endAt, period.startAt, period.endAt]),
    revenueTrend(db, period),
  ]);
  const byChannel = mergeDimensions(channelCreated, channelCredited, "channel").map((row) => ({ ...row, channel: row.key, label: channelLabel(row.key) }));
  const byPackage = mergeDimensions(packageCreated, packageCredited, "packageId").map((row) => ({ ...row, packageId: row.key, packageLabel: row.key }));
  const promoCreatedCount = number(promoCreated.createdOrders);
  return {
    period,
    recharge: {
      ...recharge,
      previousRevenueYuan: previous.revenueYuan,
      byChannel,
      byPackage,
      trend,
      firstRechargePromo: {
        code: FIRST_RECHARGE_PROMO_CODE,
        createdOrders: promoCreatedCount,
        creditedOrders: number(promoCredited.creditedOrders),
        users: number(promoCreated.users),
        creditedUsers: number(promoCredited.creditedUsers),
        extraPoints: number(promoCredited.extraPoints),
        paymentConversionRate: promoCreatedCount > 0 ? Number(((number(promoCreated.creditedCreatedOrders) / promoCreatedCount) * 100).toFixed(1)) : null,
      },
    },
    points: Object.fromEntries(Object.entries(points).map(([key, value]) => [key, number(value)])),
  };
}

async function queryOverview(db, period) {
  const [usage, previousUsage, newUsers, previousNewUsers, finance, previousFinance, useTrend, usersTrend] = await Promise.all([
    usageSummary(db, period.startAt, period.endAt),
    usageSummary(db, period.previousStartAt, period.previousEndAt),
    db.get("SELECT COUNT(*) AS count FROM users WHERE created_at >= ? AND created_at < ?", [period.startAt, period.endAt]),
    db.get("SELECT COUNT(*) AS count FROM users WHERE created_at >= ? AND created_at < ?", [period.previousStartAt, period.previousEndAt]),
    queryFinanceAnalytics(db, period),
    financeTotals(db, period.previousStartAt, period.previousEndAt),
    usageTrend(db, period),
    newUserTrend(db, period),
  ]);
  return {
    period,
    kpis: {
      effectiveActiveUsers: kpi(usage.effectiveUsers, previousUsage.effectiveUsers),
      newUsers: kpi(newUsers.count, previousNewUsers.count),
      effectiveTasks: kpi(usage.effectiveTasks, previousUsage.effectiveTasks),
      collectedItems: kpi(usage.collectedItems, previousUsage.collectedItems),
      rechargeRevenueYuan: kpi(finance.recharge.revenueYuan, previousFinance.revenueYuan),
      payers: kpi(finance.recharge.payers, previousFinance.payers),
    },
    trends: {
      effectiveActiveUsers: useTrend.map((row) => ({ day: row.day, value: row.effectiveActiveUsers })),
      newUsers: usersTrend.map((row) => ({ day: row.day, value: row.newUsers })),
      effectiveTasks: useTrend.map((row) => ({ day: row.day, value: row.effectiveTasks })),
      collectedItems: useTrend.map((row) => ({ day: row.day, value: row.collectedItems })),
      rechargeRevenueYuan: finance.recharge.trend,
    },
  };
}

async function queryRetention(db, period, now) {
  const retention = {};
  for (const [key, days] of [["d1", 1], ["d7", 7], ["d30", 30]]) {
    // A Dn target day must have fully ended; a cohort whose target is today is not mature yet.
    const matureThrough = dayKey(addDays(dayStart(now), -(days + 1)));
    const row = await db.get(`
      SELECT COUNT(*) AS cohortSize,
             COALESCE(SUM(CASE WHEN EXISTS (
               SELECT 1 FROM consume_records c
               WHERE c.user_id = u.id AND ${daySql("c.created_at")} = date(${daySql("u.created_at")}, '+' || ? || ' days')
             ) THEN 1 ELSE 0 END), 0) AS retainedUsers
      FROM users u
      WHERE u.created_at >= ? AND u.created_at < ? AND ${daySql("u.created_at")} <= ?
    `, [days, period.startAt, period.endAt, matureThrough]);
    const cohortSize = number(row.cohortSize);
    retention[key] = { cohortSize, retainedUsers: number(row.retainedUsers), value: cohortSize > 0 ? Number(((number(row.retainedUsers) / cohortSize) * 100).toFixed(1)) : null };
  }
  return retention;
}

async function queryUsersAnalytics(db, period, now = new Date()) {
  const today = dayStart(now);
  const [counts, activation, dau, wau, mau, retention, newTrend, activeTrend] = await Promise.all([
    db.get("SELECT COUNT(*) AS totalUsers, COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS activeAccounts, COALESCE(SUM(CASE WHEN status <> 1 THEN 1 ELSE 0 END), 0) AS deletedUsers FROM users"),
    db.get(`/* Activation means any later effective collection; it is not a 24-hour activation rate. */
            SELECT COUNT(*) AS newUsers, COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM consume_records c WHERE c.user_id = u.id AND c.created_at >= u.created_at) THEN 1 ELSE 0 END), 0) AS activatedNewUsers FROM users u WHERE u.created_at >= ? AND u.created_at < ?`, [period.startAt, period.endAt]),
    db.get("SELECT COUNT(DISTINCT user_id) AS count FROM consume_records WHERE created_at >= ? AND created_at < ?", [today.toISOString(), addDays(today, 1).toISOString()]),
    db.get("SELECT COUNT(DISTINCT user_id) AS count FROM consume_records WHERE created_at >= ? AND created_at < ?", [addDays(today, -6).toISOString(), addDays(today, 1).toISOString()]),
    db.get("SELECT COUNT(DISTINCT user_id) AS count FROM consume_records WHERE created_at >= ? AND created_at < ?", [addDays(today, -29).toISOString(), addDays(today, 1).toISOString()]),
    queryRetention(db, period, now),
    newUserTrend(db, period),
    usageTrend(db, period),
  ]);
  const newUsers = number(activation.newUsers);
  return {
    period,
    totalUsers: number(counts.totalUsers),
    activeAccounts: number(counts.activeAccounts),
    deletedUsers: number(counts.deletedUsers),
    newUsers,
    activatedNewUsers: number(activation.activatedNewUsers),
    activationRate: newUsers > 0 ? Number(((number(activation.activatedNewUsers) / newUsers) * 100).toFixed(1)) : null,
    dau: number(dau.count),
    wau: number(wau.count),
    mau: number(mau.count),
    retention,
    newUserTrend: newTrend,
    effectiveActiveTrend: activeTrend.map((row) => ({ day: row.day, value: row.effectiveActiveUsers })),
  };
}

async function queryEventAnalytics(db, period) {
  const capabilityRows = await db.all(`
    SELECT CASE
      WHEN event_name IN ('task_start', 'task_complete', 'task_failed', 'task_cancelled') THEN 'taskLifecycle'
      WHEN event_name = 'export_complete' THEN 'export'
      WHEN event_name = 'app_open' THEN 'appOpen'
      WHEN event_name = 'recharge_open' THEN 'rechargeOpen'
      WHEN event_name IN ('update_success', 'update_failed') THEN 'update'
    END AS capability, MIN(created_at) AS coverageStartAt
    FROM client_events GROUP BY capability
  `);
  const rowsByCapability = new Map(capabilityRows.filter((row) => row.capability).map((row) => [row.capability, row]));
  const capability = (name) => {
    const row = rowsByCapability.get(name);
    if (!row) return { available: false, coverageStartAt: null, periodStatus: 'unavailable' };
    const coverageStart = new Date(row.coverageStartAt); const periodStart = new Date(period.startAt); const periodEnd = new Date(period.endAt);
    const periodStatus = periodEnd <= coverageStart ? 'before' : periodStart < coverageStart ? 'partial' : 'covered';
    return { available: true, coverageStartAt: row.coverageStartAt, periodStatus };
  };
  const capabilities = { taskLifecycle: capability('taskLifecycle'), export: capability('export'), appOpen: capability('appOpen'), rechargeOpen: capability('rechargeOpen'), update: capability('update') };
  const canRead = (entry) => entry.available && entry.periodStatus !== 'before';
  const lifecycleReadable = canRead(capabilities.taskLifecycle); const exportReadable = canRead(capabilities.export); const appOpenReadable = canRead(capabilities.appOpen); const updateReadable = canRead(capabilities.update);
  if (!capabilities.taskLifecycle.available && !capabilities.export.available && !capabilities.appOpen.available && !capabilities.rechargeOpen.available && !capabilities.update.available) {
    return { available: false, coverageStartAt: null, capabilities, appOpens: null, tasksStarted: null, tasksCompleted: null, tasksFailed: null, tasksCancelled: null, exportsCompleted: null, updateSuccess: null, updateFailures: null, taskSuccessRate: null, taskFailureRate: null, byModule: null, byAppVersion: null };
  }
  const [events, byModule, byAppVersion] = await Promise.all([
    db.get(`SELECT COALESCE(SUM(CASE WHEN event_name = 'app_open' THEN 1 ELSE 0 END), 0) AS appOpens, COALESCE(SUM(CASE WHEN event_name = 'task_start' THEN 1 ELSE 0 END), 0) AS tasksStarted, COALESCE(SUM(CASE WHEN event_name = 'task_complete' THEN 1 ELSE 0 END), 0) AS tasksCompleted, COALESCE(SUM(CASE WHEN event_name = 'task_failed' THEN 1 ELSE 0 END), 0) AS tasksFailed, COALESCE(SUM(CASE WHEN event_name = 'task_cancelled' THEN 1 ELSE 0 END), 0) AS tasksCancelled, COALESCE(SUM(CASE WHEN event_name = 'export_complete' THEN 1 ELSE 0 END), 0) AS exportsCompleted, COALESCE(SUM(CASE WHEN event_name = 'update_success' THEN 1 ELSE 0 END), 0) AS updateSuccess, COALESCE(SUM(CASE WHEN event_name = 'update_failed' THEN 1 ELSE 0 END), 0) AS updateFailures FROM client_events WHERE created_at >= ? AND created_at < ?`, [period.startAt, period.endAt]),
    db.all("SELECT COALESCE(NULLIF(module, ''), 'other') AS module, COUNT(*) AS events, COUNT(DISTINCT user_id) AS users FROM client_events WHERE event_name IN ('task_start', 'task_complete', 'task_failed', 'task_cancelled') AND created_at >= ? AND created_at < ? GROUP BY module ORDER BY events DESC", [period.startAt, period.endAt]),
    db.all("SELECT COALESCE(NULLIF(app_version, ''), 'unknown') AS appVersion, COUNT(*) AS events, COUNT(DISTINCT user_id) AS users FROM client_events WHERE event_name IN ('task_start', 'task_complete', 'task_failed', 'task_cancelled') AND created_at >= ? AND created_at < ? GROUP BY appVersion ORDER BY users DESC, events DESC", [period.startAt, period.endAt]),
  ]);
  const completed = lifecycleReadable ? number(events.tasksCompleted) : null; const failed = lifecycleReadable ? number(events.tasksFailed) : null; const cancelled = lifecycleReadable ? number(events.tasksCancelled) : null; const terminal = completed === null ? 0 : completed + failed + cancelled;
  return {
    available: capabilities.taskLifecycle.available, coverageStartAt: capabilities.taskLifecycle.coverageStartAt, capabilities,
    appOpens: appOpenReadable ? number(events.appOpens) : null, tasksStarted: lifecycleReadable ? number(events.tasksStarted) : null, tasksCompleted: completed, tasksFailed: failed, tasksCancelled: cancelled, exportsCompleted: exportReadable ? number(events.exportsCompleted) : null, updateSuccess: updateReadable ? number(events.updateSuccess) : null, updateFailures: updateReadable ? number(events.updateFailures) : null,
    taskSuccessRate: terminal > 0 ? Number(((completed / terminal) * 100).toFixed(1)) : null, taskFailureRate: terminal > 0 ? Number(((failed / terminal) * 100).toFixed(1)) : null,
    byModule: lifecycleReadable ? byModule.map((row) => ({ module: row.module, events: number(row.events), users: number(row.users) })) : null, byAppVersion: lifecycleReadable ? byAppVersion.map((row) => ({ appVersion: row.appVersion, events: number(row.events), users: number(row.users) })) : null,
  };
}
async function queryUsageAnalytics(db, period) {
  const [summary, grouped, inputTypes, trend, eventAnalytics] = await Promise.all([
    usageSummary(db, period.startAt, period.endAt),
    db.all(`SELECT
      CASE WHEN LOWER(COALESCE(plugin_id, '')) = 'pgy' AND LOWER(COALESCE(task_type, '')) = 'blogger' THEN 'pgy-blogger'
           WHEN LOWER(COALESCE(plugin_id, '')) = 'pgy' AND LOWER(COALESCE(task_type, '')) IN ('blog', 'note') THEN 'pgy-note'
           WHEN LOWER(COALESCE(plugin_id, '')) = 'starmap' AND LOWER(COALESCE(task_type, '')) = 'blogger' THEN 'starmap-blogger'
           WHEN LOWER(COALESCE(plugin_id, '')) = 'pgy-kol' THEN 'pgy-kol'
           ELSE 'other:' || LOWER(COALESCE(NULLIF(plugin_id, ''), 'unknown')) || ':' || LOWER(COALESCE(NULLIF(task_type, ''), 'unknown')) END AS featureKey,
      CASE WHEN LOWER(COALESCE(plugin_id, '')) = 'pgy' AND LOWER(COALESCE(task_type, '')) = 'blogger' THEN '蒲公英博主采集'
           WHEN LOWER(COALESCE(plugin_id, '')) = 'pgy' AND LOWER(COALESCE(task_type, '')) IN ('blog', 'note') THEN '蒲公英笔记采集'
           WHEN LOWER(COALESCE(plugin_id, '')) = 'starmap' AND LOWER(COALESCE(task_type, '')) = 'blogger' THEN '星图主页采集'
           WHEN LOWER(COALESCE(plugin_id, '')) = 'pgy-kol' THEN '找博主'
           ELSE '其他 / ' || LOWER(COALESCE(NULLIF(plugin_id, ''), 'unknown')) || ' · ' || LOWER(COALESCE(NULLIF(task_type, ''), 'unknown')) END AS featureLabel,
      COUNT(DISTINCT user_id) AS users, ${taskCountSql()} AS tasks, COALESCE(SUM(count), 0) AS items, COALESCE(SUM(count), 0) AS points
      FROM consume_records WHERE created_at >= ? AND created_at < ? GROUP BY featureKey, featureLabel`, [period.startAt, period.endAt]),    db.all(`SELECT COALESCE(NULLIF(detail_type, ''), 'unknown') AS inputType, COUNT(DISTINCT user_id) AS users, ${taskCountSql()} AS tasks, COALESCE(SUM(count), 0) AS items FROM consume_records WHERE created_at >= ? AND created_at < ? GROUP BY inputType`, [period.startAt, period.endAt]),
    usageTrend(db, period),
    queryEventAnalytics(db, period),
  ]);
  const collectedItems = number(summary.collectedItems);
  return {
    period,
    coreCollection: {
      effectiveUsers: number(summary.effectiveUsers), effectiveTasks: number(summary.effectiveTasks), collectedItems, consumedPoints: number(summary.consumedPoints),
      avgItemsPerTask: number(summary.effectiveTasks) > 0 ? Number((collectedItems / number(summary.effectiveTasks)).toFixed(2)) : null,
      // SQL groups at canonical feature grain, so pgy:blog / pgy:note are one row and users stay distinct.
      byFeature: grouped.map((row) => {
        const items = number(row.items); const tasks = number(row.tasks);
        return { featureKey: row.featureKey, featureLabel: row.featureLabel, users: number(row.users), tasks, items, points: number(row.points), share: collectedItems > 0 ? Number(((items / collectedItems) * 100).toFixed(1)) : 0, avgItemsPerTask: tasks > 0 ? Number((items / tasks).toFixed(2)) : null };
      }).sort((left, right) => right.items - left.items),
      byInputType: inputTypes.map((row) => ({ inputType: row.inputType, users: number(row.users), tasks: number(row.tasks), items: number(row.items) })),
      trend,
    },
    eventAnalytics,
  };
}

async function countEvent(db, eventName, period) {
  const row = await db.get("SELECT COUNT(*) AS count FROM client_events WHERE event_name = ? AND created_at >= ? AND created_at < ?", [eventName, period.startAt, period.endAt]);
  return number(row.count);
}

async function querySystemAnalytics(db, period, now = new Date()) {
  const [events, payment] = await Promise.all([
    queryEventAnalytics(db, period),
    db.get(`SELECT
      COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS pendingOrders,
      COALESCE(SUM(CASE WHEN status = ? AND expires_at IS NOT NULL AND expires_at < ? THEN 1 ELSE 0 END), 0) AS stalePendingOrders,
      COALESCE(SUM(CASE WHEN last_query_status LIKE 'ERROR:%' THEN 1 ELSE 0 END), 0) AS queryErrors,
      COALESCE(SUM(CASE WHEN manual_review_reason IS NOT NULL AND TRIM(manual_review_reason) <> '' THEN 1 ELSE 0 END), 0) AS manualReviewOrders
      FROM recharge_orders`, [PENDING_STATUS, PENDING_STATUS, new Date(now).toISOString()]),
  ]);
  return {
    period,
    analyticsCoverage: { available: events.available, coverageStartAt: events.coverageStartAt, capabilities: events.capabilities },
    appVersions: events.byAppVersion,
    taskFailures: events.tasksFailed,
    taskCancellations: events.tasksCancelled,
    taskSuccessRate: events.taskSuccessRate,
    updateSuccess: events.updateSuccess,
    updateFailures: events.updateFailures,
    payment: Object.fromEntries(Object.entries(payment).map(([key, value]) => [key, number(value)])),
  };
}

async function queryUserAnalyticsDetail(db, userId) {
  const user = await db.get(`SELECT u.id, u.phone, u.nickname, u.status, u.created_at AS createdAt, u.deleted_at AS deletedAt, COALESCE(a.balance, 0) AS balance FROM users u LEFT JOIN shumiao_accounts a ON a.user_id = u.id WHERE u.id = ?`, [userId]);
  if (!user) return null;
  const [usage, activeDays, recharge, topFeature, recentTasks, recentRecharge] = await Promise.all([
    db.get(`SELECT MAX(created_at) AS lastEffectiveUse, ${taskCountSql()} AS effectiveTasks, COALESCE(SUM(count), 0) AS collectedItems, COALESCE(SUM(count), 0) AS consumedPoints FROM consume_records WHERE user_id = ?`, [userId]),
    db.get(`SELECT COUNT(DISTINCT ${daySql("created_at")}) AS count FROM consume_records WHERE user_id = ? AND created_at >= ?`, [userId, addDays(dayStart(), -29).toISOString()]),
    db.get("SELECT COALESCE(SUM(amount_cents), 0) AS revenueCents, COUNT(*) AS count, MIN(credited_at) AS firstRechargeAt, MAX(credited_at) AS lastRechargeAt FROM recharge_orders WHERE user_id = ? AND status = ? AND credited_at IS NOT NULL", [userId, CREDITED_STATUS]),
    db.get("SELECT plugin_id AS pluginId, task_type AS taskType, COALESCE(SUM(count), 0) AS items FROM consume_records WHERE user_id = ? GROUP BY plugin_id, task_type ORDER BY items DESC LIMIT 1", [userId]),
    db.all("SELECT task_id AS taskId, plugin_id AS pluginId, task_type AS taskType, detail_type AS inputType, SUM(count) AS items, MIN(created_at) AS startedAt, MAX(created_at) AS finishedAt FROM consume_records WHERE user_id = ? GROUP BY CASE WHEN task_id IS NULL OR TRIM(task_id) = '' THEN 'legacy:' || id ELSE task_id END ORDER BY finishedAt DESC LIMIT 10", [userId]),
    db.all("SELECT order_no AS orderNo, package_id AS packageId, channel, amount_cents AS amountCents, credited_at AS creditedAt FROM recharge_orders WHERE user_id = ? AND status = ? AND credited_at IS NOT NULL ORDER BY credited_at DESC LIMIT 10", [userId, CREDITED_STATUS]),
  ]);
  return {
    user: { ...user, balance: number(user.balance) },
    usage: { lastEffectiveUse: usage.lastEffectiveUse || null, activeDaysLast30: number(activeDays.count), effectiveTasks: number(usage.effectiveTasks), collectedItems: number(usage.collectedItems), consumedPoints: number(usage.consumedPoints), mostUsedFeature: topFeature ? { ...feature(topFeature.pluginId, topFeature.taskType), items: number(topFeature.items) } : null },
    recharge: { totalYuan: yuan(recharge.revenueCents), count: number(recharge.count), firstRechargeAt: recharge.firstRechargeAt || null, lastRechargeAt: recharge.lastRechargeAt || null },
    recentTasks: recentTasks.map((row) => ({ ...row, items: number(row.items), feature: feature(row.pluginId, row.taskType) })),
    recentRecharge: recentRecharge.map((row) => ({ ...row, amountYuan: yuan(row.amountCents) })),
  };
}

module.exports = {
  CREDITED_STATUS,
  FIRST_RECHARGE_PROMO_CODE,
  addDays,
  dayKey,
  dayStart,
  feature,
  parseAnalyticsPeriod,
  queryFinanceAnalytics,
  queryOverview,
  querySystemAnalytics,
  queryUsageAnalytics,
  queryUserAnalyticsDetail,
  queryUsersAnalytics,
  yuan,
};
