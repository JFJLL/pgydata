import test from "node:test";
import assert from "node:assert/strict";
import { redactText, redactObject, redactUserHomePath, redactUrl, redactPhone, redactEmail, scanForSensitiveData } from "./diagnostic-redactor.mjs";

test("DiagnosticRedactor: redacts Bearer and satoken tokens in strings", () => {
  const input = "User Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and satoken: secret_token_123456;";
  const output = redactText(input);
  assert.ok(!output.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "Bearer token should be redacted");
  assert.ok(!output.includes("secret_token_123456"), "satoken should be redacted");
  assert.ok(output.includes("<REDACTED>"));
});

test("DiagnosticRedactor: redacts cookies and set-cookie headers", () => {
  const input = "Cookie: a1=1890abcde123456; web_session=010101019999; sid=sess_abc123";
  const output = redactText(input);
  assert.ok(!output.includes("1890abcde123456"), "a1 cookie value should be redacted");
  assert.ok(!output.includes("010101019999"), "web_session value should be redacted");
  assert.ok(!output.includes("sess_abc123"), "sid value should be redacted");
});

test("DiagnosticRedactor: redacts passwords, sms codes, and api keys in text", () => {
  const input = JSON.stringify({ password: "mySecretPwd123", smsCode: "654321", apiKey: "ak_live_abcdef123456" });
  const output = redactText(input);
  assert.ok(!output.includes("mySecretPwd123"));
  assert.ok(!output.includes("654321"));
  assert.ok(!output.includes("ak_live_abcdef123456"));
});

test("DiagnosticRedactor: redacts phone numbers and emails", () => {
  const phoneInput = "Contact phone: 13812345678 or 18698765432.";
  const phoneOutput = redactPhone(phoneInput);
  assert.equal(phoneOutput, "Contact phone: 138****5678 or 138****5432.");

  const emailInput = "Email zhangsan@example.com and admin@company.org";
  const emailOutput = redactEmail(emailInput);
  assert.equal(emailOutput, "Email z***@example.com and a***@company.org");
});

test("DiagnosticRedactor: redacts Windows and macOS user home paths", () => {
  const winPath = "C:\\Users\\zhangsan\\AppData\\Roaming\\magiorix-desktop\\logs\\app.log";
  const winOutput = redactUserHomePath(winPath);
  assert.ok(!winOutput.includes("zhangsan"), "Windows username should be redacted");
  assert.ok(winOutput.includes("<USER_HOME>"));

  const macPath = "/Users/lisi/Library/Application Support/magiorix-desktop/data.json";
  const macOutput = redactUserHomePath(macPath);
  assert.ok(!macOutput.includes("lisi"), "macOS username should be redacted");
  assert.ok(macOutput.includes("<USER_HOME>"));
});

test("DiagnosticRedactor: strips sensitive URL queries and tokens", () => {
  const url1 = "https://example.com/api/v1/user?token=xyz123&phone=13812345678#section1";
  const res1 = redactUrl(url1);
  assert.equal(res1, "https://example.com/api/v1/user");
  assert.ok(!res1.includes("xyz123"));
  assert.ok(!res1.includes("13812345678"));
});

test("DiagnosticRedactor: redacts nested objects, maps, errors, and handles circular references", () => {
  const obj = {
    user: {
      name: "Tester",
      password: "secret_password",
      satoken: "satoken_12345",
      phone: "13900001111",
    },
    headers: {
      Authorization: "Bearer secret-jwt-token",
      Cookie: "session=abc",
    },
    err: new Error("Failed at C:\\Users\\tester\\project\\file.js:10"),
    items: ["13888889999", { secret: "my-secret-value" }],
  };
  // Add circular reference
  obj.self = obj;

  const redacted = redactObject(obj);
  assert.equal(redacted.user.name, "Tester");
  assert.equal(redacted.user.password, "<REDACTED>");
  assert.equal(redacted.user.satoken, "<REDACTED>");
  assert.equal(redacted.user.phone, "138****1111");
  assert.equal(redacted.headers.Authorization, "<REDACTED>");
  assert.equal(redacted.headers.Cookie, "<REDACTED>");
  assert.equal(redacted.items[0], "138****9999");
  assert.equal(redacted.items[1].secret, "<REDACTED>");
  assert.equal(redacted.self, "[Circular]");
  assert.ok(!redacted.err.message.includes("tester"));
});

test("DiagnosticRedactor: scanForSensitiveData detects unredacted secrets and passes clean objects", () => {
  const dirty = { auth: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", cookie: "a1=1890abcde123456" };
  const dirtyScan = scanForSensitiveData(dirty);
  assert.equal(dirtyScan.clean, false);
  assert.ok(dirtyScan.findings.length > 0);

  const clean = redactObject(dirty);
  const cleanScan = scanForSensitiveData(clean);
  assert.equal(cleanScan.clean, true);
  assert.equal(cleanScan.findings.length, 0);
});
