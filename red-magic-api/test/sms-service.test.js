const test = require("node:test");
const assert = require("node:assert/strict");
const { createSmsService } = require("../lib/sms-service");

function fakeSmsDatabase() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    async get(sql, params = []) {
      if (sql.includes("COUNT(*)")) {
        const [value, since] = params;
        const column = sql.includes("source_ip_hash") ? "source_ip_hash" : "phone";
        return { count: rows.filter((row) => row[column] === value && row.created_at >= since).length };
      }
      if (sql.includes("status = 'sent'")) {
        const [phone, purpose] = params;
        return rows
          .filter((row) => row.phone === phone && row.purpose === purpose && row.status === "sent")
          .sort((left, right) => right.id - left.id)[0] || null;
      }
      return null;
    },
    async run(sql, params = []) {
      if (sql.includes("SET status = 'invalidated'")) {
        const [usedAt, phone, purpose] = params;
        let changes = 0;
        for (const row of rows) {
          if (row.phone === phone && row.purpose === purpose && ["sent", "reserved"].includes(row.status)) {
            row.status = "invalidated";
            row.used_at = usedAt;
            changes += 1;
          }
        }
        return { changes };
      }
      if (sql.includes("INSERT INTO sms_codes")) {
        const [phone, purpose, codeHash, sourceIpHash, expiresAt, createdAt] = params;
        const row = {
          id: nextId++, phone, purpose, code_hash: codeHash, status: "reserved", attempts: 0,
          source_ip_hash: sourceIpHash, expires_at: expiresAt, created_at: createdAt,
        };
        rows.push(row);
        return { lastID: row.id, changes: 1 };
      }
      if (sql.includes("SET status = 'sent'")) {
        const [requestId, id] = params;
        const row = rows.find((item) => item.id === id && item.status === "reserved");
        if (!row) return { changes: 0 };
        row.status = "sent";
        row.provider_request_id = requestId;
        return { changes: 1 };
      }
      if (sql.includes("SET status = 'failed'")) {
        const [providerErrorCode, id] = params;
        const row = rows.find((item) => item.id === id && item.status === "reserved");
        if (!row) return { changes: 0 };
        row.status = "failed";
        row.provider_error_code = providerErrorCode;
        return { changes: 1 };
      }
      return { changes: 1 };
    },
  };
}

test("resending while the previous provider call is in flight invalidates the reserved old code", async () => {
  const db = fakeSmsDatabase();
  let releaseFirstProvider;
  let firstProviderStarted;
  const firstStarted = new Promise((resolve) => { firstProviderStarted = resolve; });
  const firstProviderGate = new Promise((resolve) => { releaseFirstProvider = resolve; });
  let providerCalls = 0;
  const service = createSmsService({
    db,
    withTransaction: (() => {
      let tail = Promise.resolve();
      return (callback) => {
        const operation = tail.then(() => callback(db));
        tail = operation.catch(() => {});
        return operation;
      };
    })(),
    secret: "test-secret",
    ipSecret: "test-ip-secret",
    limits: { phone: [[60_000, 100]], ip: [[60_000, 100]] },
    clock: () => new Date("2026-08-03T12:00:00.000Z"),
    codeGenerator: (() => {
      const codes = ["1111", "2222"];
      return () => codes.shift();
    })(),
    provider: async ({ code }) => {
      providerCalls += 1;
      if (providerCalls === 1) {
        firstProviderStarted();
        await firstProviderGate;
      }
      return { requestId: `request-${code}`, debugCode: code };
    },
  });

  const firstSend = service.send({ phone: "13800000500", purpose: "register", ip: "127.0.0.1" });
  await firstStarted;
  const secondSend = await service.send({ phone: "13800000500", purpose: "register", ip: "127.0.0.1" });
  assert.equal(secondSend.sent, true);
  releaseFirstProvider();
  const firstResult = await firstSend;
  assert.equal(firstResult.sent, false);
  assert.equal(providerCalls, 2);
  assert.equal(db.rows[0].status, "invalidated");
  assert.equal(db.rows[1].status, "sent");
});
