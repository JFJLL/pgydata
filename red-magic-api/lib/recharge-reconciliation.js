const { isSuccessfulTradeStatus } = require("./alipay-gateway");
const { ORDER_STATUS } = require("./recharge-settlement");

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("invalid reconciliation clock");
  return date;
}

function centsFromAmount(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [yuan, fraction = ""] = text.split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function statusText(value) {
  return String(value || "UNKNOWN").trim().toUpperCase().slice(0, 64) || "UNKNOWN";
}

function isDefinitiveUnpaidStatus(status) {
  return ["TRADE_CLOSED", "TRADE_NOT_EXIST", "ACQ.TRADE_NOT_EXIST"].includes(statusText(status));
}

function isExpired(order, now) {
  const expiresAt = new Date(order?.expires_at || "");
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= asDate(now).getTime();
}

async function claimPendingOrder({
  db,
  orderNo,
  now = new Date(),
  minIntervalMs = 15000,
  allowExpiredRetry = false,
} = {}) {
  const current = asDate(now);
  const nowIso = current.toISOString();
  const cutoffIso = new Date(current.getTime() - minIntervalMs).toISOString();
  const expiryGuard = allowExpiredRetry
    ? ""
    : "\n       AND (expires_at IS NULL OR expires_at > ? OR expiry_query_at IS NULL)";
  const params = [nowIso, nowIso, nowIso, orderNo, ORDER_STATUS.PENDING, cutoffIso];
  if (!allowExpiredRetry) params.push(nowIso);
  const result = await db.run(
    `UPDATE recharge_orders
     SET last_query_at = ?,
         query_attempts = COALESCE(query_attempts, 0) + 1,
         expiry_query_at = CASE
           WHEN expires_at IS NOT NULL AND expires_at <= ? AND expiry_query_at IS NULL THEN ?
           ELSE expiry_query_at
         END
      WHERE order_no = ?
       AND status = ?
       AND channel = 'alipay'
       AND (last_query_status IS NULL OR last_query_status NOT LIKE 'MANUAL_REVIEW:%')
       AND (last_query_at IS NULL OR last_query_at <= ?)
       ${expiryGuard}`,
    params,
  );
  if (Number(result?.changes || 0) !== 1) return null;
  return db.get("SELECT * FROM recharge_orders WHERE order_no = ?", [orderNo]);
}

async function setQueryStatus({
  db,
  orderNo,
  status,
  close = false,
  manualReviewReason = null,
  now = new Date(),
}) {
  const nowIso = asDate(now).toISOString();
  await db.run(
    `UPDATE recharge_orders
     SET last_query_status = ?,
         manual_review_reason = ?,
         status = CASE WHEN ? = 1 THEN ? ELSE status END,
         updated_at = ?
     WHERE order_no = ? AND status = ?`,
    [statusText(status), manualReviewReason ? String(manualReviewReason).slice(0, 128) : null, close ? 1 : 0, ORDER_STATUS.CLOSED, nowIso, orderNo, ORDER_STATUS.PENDING],
  );
}

async function reconcileOnce({
  db,
  gateway,
  settle,
  withMutation,
  now = new Date(),
  batchSize = 20,
  minIntervalMs = 15000,
  maxAgeMs = 24 * 60 * 60 * 1000,
} = {}) {
  const current = asDate(now);
  const oldest = new Date(current.getTime() - maxAgeMs).toISOString();
  const mutate = typeof withMutation === "function" ? (callback) => withMutation(() => callback()) : (callback) => callback();
  const candidates = await db.all(
    `SELECT order_no, created_at, expires_at, expiry_query_at
     FROM recharge_orders
     WHERE status = ?
       AND channel = 'alipay'
       AND (last_query_status IS NULL OR last_query_status NOT LIKE 'MANUAL_REVIEW:%')
     ORDER BY created_at ASC LIMIT ?`,
    [ORDER_STATUS.PENDING, batchSize],
  );
  const results = [];
  for (const candidate of candidates) {
    const candidateStale = String(candidate.created_at || "") < oldest;
    if (candidate.expiry_query_at) {
      if (candidateStale) {
        await mutate(() => setQueryStatus({
          db,
          orderNo: candidate.order_no,
          status: "MANUAL_REVIEW:MAX_AGE",
          manualReviewReason: "MAX_AGE:EXPIRY_QUERY_ALREADY_ATTEMPTED",
          now: current,
        }));
        results.push({
          orderNo: candidate.order_no,
          status: "MANUAL_REVIEW",
          reason: "MAX_AGE:EXPIRY_QUERY_ALREADY_ATTEMPTED",
        });
      }
      continue;
    }
    const order = await mutate(() => claimPendingOrder({ db, orderNo: candidate.order_no, now: current, minIntervalMs }));
    if (!order) continue;
    const stale = String(order.created_at || "") < oldest;
    const expired = isExpired(order, current);
    try {
      const response = await gateway.queryTrade({ orderNo: order.order_no });
      if (response?.outTradeNo && response.outTradeNo !== order.order_no) {
        throw new Error("支付宝查询返回了其他订单");
      }
      const status = statusText(response?.tradeStatus);
      if (isSuccessfulTradeStatus(status)) {
        const amountCents = centsFromAmount(response.totalAmount);
        if (!amountCents || !response.tradeNo || response.outTradeNo !== order.order_no) {
          throw new Error("支付宝查询成功但交易信息不完整");
        }
        const settled = await settle({
          source: "reconciliation",
          orderNo: order.order_no,
          channel: "alipay",
          amountCents,
          merchantId: response.sellerId,
          appId: response.appId,
          transactionId: response.tradeNo,
          paidAt: response.gmtPayment,
        });
        results.push({ orderNo: order.order_no, status, settled });
      } else if (isDefinitiveUnpaidStatus(status)) {
        await mutate(() => setQueryStatus({ db, orderNo: order.order_no, status, close: true, now: current }));
        results.push({ orderNo: order.order_no, status, expired });
      } else if (stale) {
        await mutate(() => setQueryStatus({
          db,
          orderNo: order.order_no,
          status: "MANUAL_REVIEW:MAX_AGE",
          manualReviewReason: `MAX_AGE:${status}`,
          now: current,
        }));
        results.push({ orderNo: order.order_no, status: "MANUAL_REVIEW", reason: `MAX_AGE:${status}` });
      } else {
        const pendingStatus = expired ? `EXPIRED:${status}` : status;
        await mutate(() => setQueryStatus({ db, orderNo: order.order_no, status: pendingStatus, now: current }));
        results.push({ orderNo: order.order_no, status: pendingStatus });
      }
    } catch {
      if (stale) {
        await mutate(() => setQueryStatus({
          db,
          orderNo: order.order_no,
          status: "MANUAL_REVIEW:MAX_AGE",
          manualReviewReason: "MAX_AGE:QUERY_FAILED",
          now: current,
        }));
        results.push({ orderNo: order.order_no, status: "MANUAL_REVIEW", reason: "MAX_AGE:QUERY_FAILED" });
      } else {
        await mutate(() => setQueryStatus({ db, orderNo: order.order_no, status: "ERROR:QUERY_FAILED", now: current }));
        results.push({ orderNo: order.order_no, status: "ERROR" });
      }
    }
  }
  return results;
}

module.exports = {
  claimPendingOrder,
  centsFromAmount,
  isDefinitiveUnpaidStatus,
  reconcileOnce,
  setQueryStatus,
};
