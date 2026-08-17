const ORDER_STATUS = {
  PENDING: 0,
  CREDITED: 1,
  CLOSED: 2,
};

class SettlementError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SettlementError";
    this.code = code;
  }
}

function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new SettlementError("invalid_payment", `${label}不能为空`);
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "";
}

function parseCents(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return number;
}

function normalizePaidAt(value, fallback) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

async function settleRechargeOrder({
  db,
  withTransaction,
  source,
  orderNo,
  channel,
  amountCents,
  merchantId,
  appId,
  transactionId,
  paidAt,
  clock = () => new Date(),
} = {}) {
  if (!db || typeof withTransaction !== "function") throw new Error("结算服务缺少数据库事务依赖");
  const normalizedOrderNo = requiredText(orderNo, "订单号");
  const normalizedChannel = requiredText(channel, "支付渠道").toLowerCase();
  const normalizedTransactionId = requiredText(transactionId, "平台交易号");
  const normalizedAmountCents = parseCents(amountCents);
  if (!normalizedAmountCents) throw new SettlementError("invalid_payment", "支付金额无效");
  if (normalizedChannel !== "alipay" && normalizedChannel !== "wxpay") {
    throw new SettlementError("invalid_payment", "不支持的支付渠道");
  }
  const normalizedMerchantId = optionalText(merchantId);
  const normalizedAppId = optionalText(appId);
  const sourceName = String(source || "unknown").slice(0, 64);
  const canUseLocalMerchantBoundary = sourceName === "alipay-query"
    || sourceName === "wxpay-query"
    || sourceName === "reconciliation";
  if ((!normalizedMerchantId || !normalizedAppId) && !canUseLocalMerchantBoundary) {
    throw new SettlementError("invalid_payment", "支付商户信息不完整");
  }

  return withTransaction(async (tx) => {
    const order = await tx.get(
      `SELECT order_no, user_id, package_id, amount_cents, total_count, channel,
              merchant_id, app_id, platform_transaction_id, status, paid_at, credited_at
       FROM recharge_orders WHERE order_no = ?`,
      [normalizedOrderNo],
    );
    if (!order) throw new SettlementError("order_not_found", "订单不存在");
    if (String(order.channel || "").toLowerCase() !== normalizedChannel) {
      throw new SettlementError("invalid_payment", "支付渠道不匹配");
    }
    if (Number(order.amount_cents) !== normalizedAmountCents) {
      throw new SettlementError("invalid_payment", "支付金额不匹配");
    }
    const localMerchantId = optionalText(order.merchant_id);
    const localAppId = optionalText(order.app_id);
    if (!localMerchantId || !localAppId) {
      throw new SettlementError("invalid_payment", "本地支付商户配置不完整");
    }
    if ((normalizedMerchantId && localMerchantId !== normalizedMerchantId)
      || (normalizedAppId && localAppId !== normalizedAppId)) {
      throw new SettlementError("invalid_payment", "支付商户信息不匹配");
    }
    const existingTransactionId = String(order.platform_transaction_id || "").trim();
    if (existingTransactionId && existingTransactionId !== normalizedTransactionId) {
      throw new SettlementError("transaction_conflict", "订单已绑定其他平台交易号");
    }
    const duplicate = await tx.get(
      `SELECT order_no FROM recharge_orders
       WHERE channel = ? AND platform_transaction_id = ? AND order_no <> ?`,
      [normalizedChannel, normalizedTransactionId, normalizedOrderNo],
    );
    if (duplicate) throw new SettlementError("transaction_conflict", "平台交易号已被其他订单使用");
    if (Number(order.status) === ORDER_STATUS.CREDITED && existingTransactionId === normalizedTransactionId) {
      const account = await tx.get("SELECT balance FROM shumiao_accounts WHERE user_id = ?", [order.user_id]);
      return {
        idempotent: true,
        orderNo: normalizedOrderNo,
        userId: order.user_id,
        creditedCount: Number(order.total_count || 0),
        balance: Number(account?.balance || 0),
        transactionId: normalizedTransactionId,
      };
    }

    const account = await tx.get("SELECT balance FROM shumiao_accounts WHERE user_id = ?", [order.user_id]);
    const currentBalance = Number(account?.balance || 0);
    if (!account) {
      const createdAt = clock().toISOString();
      await tx.run(
        "INSERT INTO shumiao_accounts (user_id, balance, created_at, updated_at) VALUES (?, 0, ?, ?)",
        [order.user_id, createdAt, createdAt],
      );
    }
    const creditedCount = Number(order.total_count || 0);
    if (!Number.isSafeInteger(creditedCount) || creditedCount <= 0) {
      throw new SettlementError("invalid_order", "订单积分快照无效");
    }
    const now = clock();
    const nowIso = now.toISOString();
    const settlementPaidAt = normalizePaidAt(paidAt, nowIso);
    const nextBalance = currentBalance + creditedCount;
    await tx.run(
      `UPDATE shumiao_accounts SET balance = ?, updated_at = ? WHERE user_id = ?`,
      [nextBalance, nowIso, order.user_id],
    );
    await tx.run(
      `UPDATE recharge_orders
       SET status = ?, platform_transaction_id = ?, paid_at = ?, credited_at = ?,
           failed_reason = NULL, updated_at = ?, last_query_status = ?
       WHERE order_no = ? AND (platform_transaction_id IS NULL OR platform_transaction_id = '' OR platform_transaction_id = ?)`,
      [ORDER_STATUS.CREDITED, normalizedTransactionId, settlementPaidAt, nowIso, nowIso, `settled:${sourceName}`, normalizedOrderNo, normalizedTransactionId],
    );
    return {
      idempotent: false,
      orderNo: normalizedOrderNo,
      userId: order.user_id,
      creditedCount,
      balance: nextBalance,
      transactionId: normalizedTransactionId,
    };
  });
}

module.exports = {
  ORDER_STATUS,
  SettlementError,
  settleRechargeOrder,
};
