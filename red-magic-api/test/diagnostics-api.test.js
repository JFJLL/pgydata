const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");

test("Diagnostics Real HTTP Server E2E: Register, Auth, RateLimit, Idempotency, SHA Verification, Admin APIs & Account Deletion", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiorix-http-e2e-"));
  const dbPath = path.join(tempDir, "e2e.sqlite");
  const diagDir = path.join(tempDir, "diagnostics");
  fs.mkdirSync(diagDir, { recursive: true });

  process.env.DB_PATH = dbPath;
  process.env.DIAGNOSTICS_DIR = diagDir;
  process.env.DIAGNOSTICS_RATE_LIMIT_PER_HOUR = "5";
  process.env.DIAGNOSTICS_MAX_BYTES = "20971520";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "AdminPassword123!";
  process.env.NODE_ENV = "test";

  // Require server instance which exports app and database
  const { app, database, initDb } = require("../server");
  await initDb();

  // Start real HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper to make HTTP requests
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
    assert.ok(tokenUser1, "Token must be returned");

    // 2. Test Request ID Middleware on standard API
    const customReqId = "req_custom_1234567890abcdef";
    const infoRes = await httpRequest("GET", "/api/auth/info", {
      satoken: tokenUser1,
      "X-Magiorix-Request-Id": customReqId,
    });
    assert.equal(infoRes.status, 200);
    assert.equal(infoRes.headers["x-magiorix-request-id"], customReqId, "Server must preserve valid client request id");

    // 3. Test Unauthorized access to diagnostic report creation
    const unauthRes = await httpRequest("POST", "/api/diagnostics/reports", {}, { clientReportId: "c1" });
    assert.equal(unauthRes.status, 401);

    // 4. Test Valid diagnostic report creation & Idempotency
    const clientReportId = crypto.randomUUID();
    const fakeZipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const fakeZip = Buffer.concat([fakeZipHeader, Buffer.from("test diagnostic zip content")]);
    const validSha = crypto.createHash("sha256").update(fakeZip).digest("hex");

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

    // Same clientReportId -> Returns identical reportId (Idempotent)
    const createRes2 = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
      clientReportId,
      appVersion: "1.4.5",
      fileSizeBytes: fakeZip.length,
      fileSha256: validSha,
    });
    assert.equal(createRes2.status, 200);
    assert.equal(createRes2.body.data.reportId, reportId1, "Duplicate clientReportId must return same reportId");

    // 5. Test Rate Limiter (5 per hour per user)
    for (let i = 2; i <= 5; i++) {
      const res = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
        clientReportId: crypto.randomUUID(),
        appVersion: "1.4.5",
        fileSizeBytes: 100,
        fileSha256: validSha,
      });
      assert.equal(res.status, 200);
    }
    // 6th report should return HTTP 429
    const rateLimitRes = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser1 }, {
      clientReportId: crypto.randomUUID(),
      appVersion: "1.4.5",
      fileSizeBytes: 100,
      fileSha256: validSha,
    });
    assert.equal(rateLimitRes.status, 429, "6th report in 1h must trigger HTTP 429");

    // 6. Test User 2 does not get affected by User 1 rate limit
    const regUser2 = await httpRequest("POST", "/api/auth/register", {}, {
      phone: "13888889999",
      password: "UserPassword123!",
      nickname: "UserTwo",
    });
    const tokenUser2 = regUser2.body.data.token;
    const user2Create = await httpRequest("POST", "/api/diagnostics/reports", { satoken: tokenUser2 }, {
      clientReportId: crypto.randomUUID(),
      appVersion: "1.4.5",
      fileSizeBytes: fakeZip.length,
      fileSha256: validSha,
    });
    assert.equal(user2Create.status, 200, "User 2 must succeed despite User 1 limit");

    // 7. Test Upload Authorization & Cross-user Isolation
    // User 2 attempts to upload file to User 1's reportId1 -> Should be 403
    const crossUpload = await httpRequest("POST", `/api/diagnostics/reports/${reportId1}/upload`, {
      satoken: tokenUser2,
      "Content-Type": "application/zip",
    }, fakeZip);
    assert.equal(crossUpload.status, 403, "User 2 cannot upload to User 1's report");

    // 8. Test Invalid ZIP Magic Header
    const badMagic = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    const badMagicUpload = await httpRequest("POST", `/api/diagnostics/reports/${reportId1}/upload`, {
      satoken: tokenUser1,
      "Content-Type": "application/zip",
    }, badMagic);
    assert.equal(badMagicUpload.status, 400, "Non-zip magic bytes must be rejected");

    // 9. Test SHA256 Mismatch Handling
    const badShaZip = Buffer.concat([fakeZipHeader, Buffer.from("mismatched content")]);
    const badShaUpload = await httpRequest("POST", `/api/diagnostics/reports/${reportId1}/upload`, {
      satoken: tokenUser1,
      "Content-Type": "application/zip",
    }, badShaZip);
    assert.equal(badShaUpload.status, 400, "SHA mismatch must fail");

    // Check that status was marked 'failed' and temp uploading file was removed
    const failedReport = await database.get("SELECT status FROM diagnostic_reports WHERE id = ?", [reportId1]);
    assert.equal(failedReport.status, "failed");
    assert.equal(fs.existsSync(path.join(diagDir, `${reportId1}.uploading`)), false);

    // 10. Test Successful Upload on User 2's report
    const user2ReportId = user2Create.body.data.reportId;
    const validUpload = await httpRequest("POST", `/api/diagnostics/reports/${user2ReportId}/upload`, {
      satoken: tokenUser2,
      "Content-Type": "application/zip",
      "X-Magiorix-File-Sha256": validSha,
    }, fakeZip);
    assert.equal(validUpload.status, 200);
    assert.equal(validUpload.body.data.status, "uploaded");
    assert.ok(fs.existsSync(path.join(diagDir, `${user2ReportId}.zip`)), "Zip file must exist on disk");

    // 11. Test Admin Authentication & Diagnostics Inspection
    // Non-admin token accessing admin API -> 401
    const nonAdminRes = await httpRequest("GET", "/api/admin/diagnostics", { Authorization: `Bearer ${tokenUser1}` });
    assert.equal(nonAdminRes.status, 401);

    // Admin Login
    const adminLogin = await httpRequest("POST", "/api/admin/login", {}, {
      username: "admin",
      password: "AdminPassword123!",
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.data.token;
    assert.ok(adminToken, "Admin token received");

    // Admin List
    const adminList = await httpRequest("GET", "/api/admin/diagnostics?pageSize=10", {
      Authorization: `Bearer ${adminToken}`,
    });
    assert.equal(adminList.status, 200);
    assert.ok(adminList.body.data.total >= 6);

    // Admin Detail
    const adminDetail = await httpRequest("GET", `/api/admin/diagnostics/${user2ReportId}`, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert.equal(adminDetail.status, 200);
    assert.equal(adminDetail.body.data.id, user2ReportId);
    assert.equal(adminDetail.body.data.integrityVerified, true);

    // 12. Test Admin Download with Authorization: Bearer
    const downloadRes = await httpRequest("GET", `/api/admin/diagnostics/${user2ReportId}/download`, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers["content-type"], "application/zip");
    const downloadedSha = crypto.createHash("sha256").update(downloadRes.raw).digest("hex");
    assert.equal(downloadedSha, validSha, "Downloaded ZIP SHA256 must match original ZIP");

    // 13. Test Account Deletion cleans up diagnostic files & database metadata
    const deleteRes = await httpRequest("POST", "/api/auth/delete-account", { satoken: tokenUser2 });
    assert.equal(deleteRes.status, 200);
    // ZIP file on disk must be removed
    assert.equal(fs.existsSync(path.join(diagDir, `${user2ReportId}.zip`)), false, "Disk zip must be deleted");
    // Database metadata for user 2 must be deleted
    const dbCheck = await database.get("SELECT * FROM diagnostic_reports WHERE id = ?", [user2ReportId]);
    assert.equal(dbCheck, undefined, "Diagnostic report database record must be cleared");

    // 14. Test Orphan ZIP Cleaner (scan disk and delete if not in DB after grace period)
    const orphanZipId = "MGR-20260101-ORPHAN";
    const orphanZipPath = path.join(diagDir, `${orphanZipId}.zip`);
    fs.writeFileSync(orphanZipPath, fakeZip);
    // Set mtime to 2 hours ago (past 1 hour grace period)
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    fs.utimesSync(orphanZipPath, twoHoursAgo, twoHoursAgo);
    assert.ok(fs.existsSync(orphanZipPath));

    const { cleanupExpiredDiagnostics } = require("../server");
    await cleanupExpiredDiagnostics(database);
    assert.equal(fs.existsSync(orphanZipPath), false, "Orphan zip older than grace period must be purged");

    // 15. Test Server Log RequestId correlation
    const loggedReqId = "req_log_test_" + Date.now().toString(36);
    await httpRequest("GET", "/api/non-existent-route-for-log-test", {
      "X-Magiorix-Request-Id": loggedReqId,
    });
    // Read today's server log
    const todayDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const logFile = path.join(__dirname, "..", "logs", `access-${todayDate}.log`);
    if (fs.existsSync(logFile)) {
      const logContent = fs.readFileSync(logFile, "utf8");
      assert.ok(logContent.includes(loggedReqId), "Server log must record request ID");
    }

  } finally {
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
