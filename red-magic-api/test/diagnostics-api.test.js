const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");

test("Diagnostics Real HTTP Server E2E: Full Validation, Streaming, Idempotency, RateLimit, Log RequestId & Orphan Purge", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-http-e2e-"));
  const dbPath = path.join(tempDir, "e2e.sqlite");
  const diagDir = path.join(tempDir, "diagnostics");
  const logDir = path.join(tempDir, "logs");
  fs.mkdirSync(diagDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  process.env.DB_PATH = dbPath;
  process.env.DIAGNOSTICS_DIR = diagDir;
  process.env.LOG_DIR = logDir;
  process.env.DIAGNOSTICS_RATE_LIMIT_PER_HOUR = "5";
  process.env.DIAGNOSTICS_MAX_BYTES = "20971520";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "AdminPassword123!";
  process.env.NODE_ENV = "test";

  const { app, database, initDb, cleanupExpiredDiagnostics } = require("../server");
  await initDb();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function httpRequest(method, reqPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(reqPath, baseUrl);
      const req = http.request(url, { method, headers }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try { json = JSON.parse(raw.toString("utf8")); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
        });
      });
      req.on("error", reject);
      if (body) {
        if (Buffer.isBuffer(body)) req.write(body);
        else if (typeof body === "object") {
          req.setHeader("Content-Type", "application/json");
          req.write(JSON.stringify(body));
        } else {
          req.write(String(body));
        }
      }
      req.end();
    });
  }

  try {
    // 1. Register and login User 1
    const regRes = await httpRequest("POST", "/api/auth/register", {}, {
      phone: "13912345678",
      password: "UserPassword123!",
      nickname: "DiagnosticTester",
    });
    assert.equal(regRes.status, 200);
    const tokenUser1 = regRes.body.data.token;

    // 2. Test Request ID Middleware on standard API & Server Log Verification
    const customReqId = "req_custom_1234567890abcdef";
    const infoRes = await httpRequest("GET", "/api/auth/info", {
      satoken: tokenUser1,
      "X-Magiorix-Request-Id": customReqId,
    });
    assert.equal(infoRes.status, 200);
    assert.equal(infoRes.headers["x-magiorix-request-id"], customReqId);

    // Trigger a warning log with request id to test server-YYYY-MM-DD.log
    await httpRequest("GET", "/api/non-existent-route-for-log-test", {
      "X-Magiorix-Request-Id": customReqId,
    });
    const todayDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const logFilePath = path.join(logDir, `server-${todayDate}.log`);
    // Wait for log append to complete
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(fs.existsSync(logFilePath), `Server log file ${logFilePath} must exist`);
    const logContent = fs.readFileSync(logFilePath, "utf8");
    assert.ok(logContent.includes(customReqId), "Server log must contain requestId");

    // 3. Test Unauthorized access to diagnostic report creation (HTTP 401)
    const unauthRes = await httpRequest("POST", "/api/diagnostics/reports", {}, { clientReportId: crypto.randomUUID() });
    assert.equal(unauthRes.status, 401);

    // 4. Test Strict validation on create report
    const fakeZipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const fakeZip = Buffer.concat([fakeZipHeader, Buffer.from("test diagnostic zip content")]);
    const validSha = crypto.createHash("sha256").update(fakeZip).digest("hex");

    // Invalid non-UUID clientReportId -> 400
    const badUuidRes = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
      clientReportId: "invalid-uuid",
      fileSizeBytes: 100,
      fileSha256: validSha,
    });
    assert.equal(badUuidRes.status, 400);

    // Invalid safe integer size -> 400
    const badSizeRes = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
      clientReportId: crypto.randomUUID(),
      fileSizeBytes: -5,
      fileSha256: validSha,
    });
    assert.equal(badSizeRes.status, 400);

    // 5. Valid create report & Idempotency
    const clientReportId = crypto.randomUUID();
    const createRes1 = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
      clientReportId,
      appVersion: "1.4.5",
      assetsVersion: "1.4.5",
      platform: "win32",
      arch: "x64",
      fileSizeBytes: fakeZip.length,
      fileSha256: validSha,
      userNote: "Task stopped at step 2",
    });
    assert.equal(createRes1.status, 200);
    const reportId1 = createRes1.body.data.reportId;
    assert.match(reportId1, /^MGR-[0-9]{8}-[A-F0-9]{6}$/);

    // Same clientReportId returns identical reportId
    const createRes2 = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
      clientReportId,
      appVersion: "1.4.5",
      fileSizeBytes: fakeZip.length,
      fileSha256: validSha,
    });
    assert.equal(createRes2.status, 200);
    assert.equal(createRes2.body.data.reportId, reportId1);

    // 6. Test Rate Limiter (5 per hour per user)
    for (let i = 2; i <= 5; i++) {
      const res = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
        clientReportId: crypto.randomUUID(),
        appVersion: "1.4.5",
        fileSizeBytes: 100,
        fileSha256: validSha,
      });
      assert.equal(res.status, 200);
    }
    const rateLimitRes = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
      clientReportId: crypto.randomUUID(),
      appVersion: "1.4.5",
      fileSizeBytes: 100,
      fileSha256: validSha,
    });
    assert.equal(rateLimitRes.status, 429);

    // 7. Register User 2 (not affected by User 1 rate limit)
    const regUser2 = await httpRequest("POST", "/api/auth/register", {}, {
      phone: "13888889999",
      password: "UserPassword123!",
      nickname: "UserTwo",
    });
    const tokenUser2 = regUser2.body.data.token;
    const user2ReportUuid = crypto.randomUUID();
    const user2Create = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser2 }, {
      clientReportId: user2ReportUuid,
      appVersion: "1.4.5",
      fileSizeBytes: fakeZip.length,
      fileSha256: validSha,
    });
    assert.equal(user2Create.status, 200);
    const user2ReportId = user2Create.body.data.reportId;

    // 8. Cross user upload reject (HTTP 403)
    const crossUpload = await httpRequest("POST", `/api/diagnostics/reports/${reportId1}/upload`, {
      satoken: tokenUser2,
      "Content-Type": "application/zip",
    }, fakeZip);
    assert.equal(crossUpload.status, 403);

    // 9. Bad magic upload (HTTP 400)
    const badMagic = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    const badMagicUpload = await httpRequest("POST", `/api/diagnostics/reports/${reportId1}/upload`, {
      satoken: tokenUser1,
      "Content-Type": "application/zip",
    }, badMagic);
    assert.equal(badMagicUpload.status, 400);

    // 10. Bad SHA upload (HTTP 400 + report marked 'failed')
    const badShaZip = Buffer.concat([fakeZipHeader, Buffer.from("mismatched content")]);
    const badShaUpload = await httpRequest("POST", `/api/diagnostics/reports/${reportId1}/upload`, {
      satoken: tokenUser1,
      "Content-Type": "application/zip",
    }, badShaZip);
    assert.equal(badShaUpload.status, 400);
    const failedReport = await database.get("SELECT status FROM diagnostic_reports WHERE id = ?", [reportId1]);
    assert.equal(failedReport.status, "failed");
    assert.equal(fs.existsSync(path.join(diagDir, `${reportId1}.uploading`)), false);

    // 11. Streaming Upload success with User 2
    const validUpload = await httpRequest("POST", `/api/diagnostics/reports/${user2ReportId}/upload`, {
      satoken: tokenUser2,
      "Content-Type": "application/zip",
      "X-Magiorix-File-Sha256": validSha,
    }, fakeZip);
    assert.equal(validUpload.status, 200);
    assert.equal(validUpload.body.data.status, "uploaded");
    assert.ok(fs.existsSync(path.join(diagDir, `${user2ReportId}.zip`)));

    // 12. Admin API Authentication: non-admin gets HTTP 401
    const nonAdminRes = await httpRequest("GET", "/api/admin/diagnostics", { Authorization: `Bearer ${tokenUser1}` });
    assert.equal(nonAdminRes.status, 401);

    // Admin login
    const adminLogin = await httpRequest("POST", "/api/admin/login", {}, {
      username: "admin",
      password: "AdminPassword123!",
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.data.token;

    // Admin Download
    const downloadRes = await httpRequest("GET", `/api/admin/diagnostics/${user2ReportId}/download`, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers["content-type"], "application/zip");
    const dlSha = crypto.createHash("sha256").update(downloadRes.raw).digest("hex");
    assert.equal(dlSha, validSha);

    // 13. Test Account Deletion cleans up user 2 files
    const deleteRes = await httpRequest("POST", "/api/auth/delete-account", { satoken: tokenUser2 });
    assert.equal(deleteRes.status, 200);
    assert.equal(fs.existsSync(path.join(diagDir, `${user2ReportId}.zip`)), false);
    const dbCheck = await database.get("SELECT * FROM diagnostic_reports WHERE id = ?", [user2ReportId]);
    assert.equal(dbCheck, undefined);

    // 14. Test Orphan ZIP Cleaner (purges files older than 1h not in DB)
    const orphanZipId = "MGR-20260101-ORPHAN";
    const orphanZipPath = path.join(diagDir, `${orphanZipId}.zip`);
    fs.writeFileSync(orphanZipPath, fakeZip);
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    fs.utimesSync(orphanZipPath, twoHoursAgo, twoHoursAgo);
    assert.ok(fs.existsSync(orphanZipPath));

    await cleanupExpiredDiagnostics(database);
    assert.equal(fs.existsSync(orphanZipPath), false, "Orphan zip older than grace period must be purged");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
