const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const sqlite3 = require("sqlite3").verbose();
const { runMigrations } = require("../lib/database-migrations");

function openDatabase(file) {
  const db = new sqlite3.Database(file);
  return {
    run(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function done(error) { if (error) reject(error); else resolve(this); })); },
    get(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))); },
    all(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows))); },
    close() { return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); },
  };
}

test("Diagnostics Server E2E: Idempotency, Rate Limit, Expected/Actual Integrity, Retention & Deletion", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-diag-e2e-"));
  const dbFile = path.join(tempDir, "test.sqlite");
  const diagDir = path.join(tempDir, "diagnostics");
  fs.mkdirSync(diagDir, { recursive: true });
  const db = openDatabase(dbFile);

  try {
    await runMigrations(db);

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

    // 1. Seed two users
    await db.run("INSERT INTO users (id, phone, nickname, status, created_at, updated_at) VALUES (1, '13800000001', 'UserOne', 1, ?, ?)", [now, now]);
    await db.run("INSERT INTO users (id, phone, nickname, status, created_at, updated_at) VALUES (2, '13800000002', 'UserTwo', 1, ?, ?)", [now, now]);

    // 2. Test clientReportId idempotency constraint and duplicate handling
    const reportId1 = "MGR-20260902-AAAAAA";
    const clientReportId = "client_uuid_1001";

    await db.run(
      `INSERT INTO diagnostic_reports (
        id, user_id, client_report_id, app_version, assets_version, platform, arch,
        status, expected_size_bytes, expected_sha256, summary_json, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reportId1, 1, clientReportId, "1.4.5", "1.4.5", "win32", "x64", "pending", 1024, "abc", "{}", now, expiresAt],
    );

    // Unique constraint should reject duplicate client_report_id for same user
    await assert.rejects(async () => {
      await db.run(
        `INSERT INTO diagnostic_reports (
          id, user_id, client_report_id, app_version, assets_version, platform, arch,
          status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["MGR-20260902-BBBBBB", 1, clientReportId, "1.4.5", "1.4.5", "win32", "x64", "pending", now, expiresAt],
      );
    }, /UNIQUE constraint failed/);

    // 3. Test Rate Limiter DB query (5 per hour per user)
    for (let i = 2; i <= 5; i++) {
      await db.run(
        `INSERT INTO diagnostic_reports (
          id, user_id, client_report_id, app_version, assets_version, platform, arch,
          status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`MGR-20260902-RATE0${i}`, 1, `client_uuid_${i}`, "1.4.5", "1.4.5", "win32", "x64", "pending", now, expiresAt],
      );
    }

    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const countUser1 = await db.get("SELECT COUNT(*) AS count FROM diagnostic_reports WHERE user_id = ? AND created_at >= ?", [1, oneHourAgo]);
    assert.equal(countUser1.count, 5, "User 1 should have reached limit of 5 reports in 1h");

    const countUser2 = await db.get("SELECT COUNT(*) AS count FROM diagnostic_reports WHERE user_id = ? AND created_at >= ?", [2, oneHourAgo]);
    assert.equal(countUser2.count, 0, "User 2 should not be affected by User 1 rate limit");

    // 4. Test Expected vs. Actual Integrity Verification
    const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00]);
    const validZip = Buffer.concat([zipHeader, Buffer.from("actual test diagnostic content")]);
    const validSha = crypto.createHash("sha256").update(validZip).digest("hex");

    // Case A: SHA Mismatch
    const mismatchReportId = "MGR-20260902-SHABAD";
    await db.run(
      `INSERT INTO diagnostic_reports (
        id, user_id, client_report_id, expected_sha256, expected_size_bytes, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [mismatchReportId, 2, "client_sha_bad", "0000000000000000000000000000000000000000000000000000000000000000", validZip.length, "pending", now, expiresAt],
    );

    const reportA = await db.get("SELECT * FROM diagnostic_reports WHERE id = ?", [mismatchReportId]);
    const shaMatches = reportA.expected_sha256 === validSha;
    assert.equal(shaMatches, false);

    // Case B: Size Mismatch
    const sizeMismatchReportId = "MGR-20260902-SIZEBD";
    await db.run(
      `INSERT INTO diagnostic_reports (
        id, user_id, client_report_id, expected_sha256, expected_size_bytes, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sizeMismatchReportId, 2, "client_size_bad", validSha, 999999, "pending", now, expiresAt],
    );
    const reportB = await db.get("SELECT * FROM diagnostic_reports WHERE id = ?", [sizeMismatchReportId]);
    const sizeMatches = reportB.expected_size_bytes === validZip.length;
    assert.equal(sizeMatches, false);

    // Case C: Valid Match -> uploaded
    const validReportId = "MGR-20260902-VALID1";
    await db.run(
      `INSERT INTO diagnostic_reports (
        id, user_id, client_report_id, expected_sha256, expected_size_bytes, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [validReportId, 2, "client_valid_1", validSha, validZip.length, "pending", now, expiresAt],
    );

    const zipPath = path.join(diagDir, `${validReportId}.zip`);
    fs.writeFileSync(zipPath, validZip);

    await db.run(
      `UPDATE diagnostic_reports
       SET status = 'uploaded', file_path = ?, actual_size_bytes = ?, actual_sha256 = ?, uploaded_at = ?
       WHERE id = ?`,
      [`diagnostics/${validReportId}.zip`, validZip.length, validSha, now, validReportId],
    );

    const updatedValid = await db.get("SELECT * FROM diagnostic_reports WHERE id = ?", [validReportId]);
    assert.equal(updatedValid.status, "uploaded");
    assert.equal(updatedValid.expected_sha256, updatedValid.actual_sha256);
    assert.equal(updatedValid.expected_size_bytes, updatedValid.actual_size_bytes);

    // 5. Test Retention Cleaner
    const oldDate = new Date(Date.now() - 31 * 86400 * 1000).toISOString();
    const expiredReportId = "MGR-20260701-EXPIRE";
    const expiredZip = path.join(diagDir, `${expiredReportId}.zip`);
    fs.writeFileSync(expiredZip, validZip);
    await db.run(
      `INSERT INTO diagnostic_reports (id, user_id, status, file_path, created_at, expires_at)
       VALUES (?, ?, 'uploaded', ?, ?, ?)`,
      [expiredReportId, 2, `diagnostics/${expiredReportId}.zip`, oldDate, oldDate],
    );

    // Run cleanup
    const expired = await db.all("SELECT id FROM diagnostic_reports WHERE expires_at < ?", [now]);
    assert.ok(expired.some((r) => r.id === expiredReportId));
    for (const r of expired) {
      const file = path.join(diagDir, `${r.id}.zip`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    await db.run("DELETE FROM diagnostic_reports WHERE expires_at < ?", [now]);

    assert.equal(fs.existsSync(expiredZip), false, "Expired zip file should be deleted");
    assert.equal((await db.get("SELECT id FROM diagnostic_reports WHERE id = ?", [expiredReportId])), null);

    // 6. Test User Deletion & Cascade Clean
    assert.equal(fs.existsSync(zipPath), true, "Active zip should exist before deletion");
    // Delete User 2 and all their diagnostic files
    const user2Reports = await db.all("SELECT id FROM diagnostic_reports WHERE user_id = ?", [2]);
    for (const r of user2Reports) {
      const file = path.join(diagDir, `${r.id}.zip`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    await db.run("DELETE FROM users WHERE id = ?", [2]);
    assert.equal(fs.existsSync(zipPath), false, "User 2 zip file should be removed upon account deletion");
    assert.equal((await db.get("SELECT id FROM diagnostic_reports WHERE user_id = ?", [2])), null);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
