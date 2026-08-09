const test = require("node:test");
const assert = require("node:assert/strict");
const { authHeaders, makeTempContext, requestJson, startServer, withServer } = require("./api-test-helpers");

async function stopServerProcess(server) {
  if (!server || server.child.exitCode !== null) return;
  server.child.kill();
  await new Promise((resolve) => server.child.once("exit", resolve));
}

async function sendCode(baseUrl, phone, purpose = "register") {
  const response = await requestJson(baseUrl, "/api/auth/sms/send", {
    method: "POST",
    body: { phone, purpose },
  });
  assert.equal(response.body.code, 200, JSON.stringify(response.body));
  assert.match(response.body.data?.debugCode || "", /^\d{4}$/);
  return response.body.data.debugCode;
}

async function register(context, phone, password = "password123") {
  const code = await sendCode(context.baseUrl, phone);
  const result = await requestJson(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: { phone, code, password },
  });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}

test("SMS registration and reset stay unavailable until the SMS switch is enabled", async () => {
  await withServer({}, { SMS_TEST_MODE: "0" }, async (context) => {
    const send = await requestJson(context.baseUrl, "/api/auth/sms/send", {
      method: "POST",
      body: { phone: "13800000000", purpose: "register" },
    });
    assert.equal(send.response.status, 503);
    assert.equal(send.body.code, 503);
    const registerResult = await requestJson(context.baseUrl, "/api/auth/register", {
      method: "POST",
      body: { phone: "13800000000", code: "0000", password: "password123" },
    });
    assert.equal(registerResult.response.status, 503);
    assert.equal(registerResult.body.code, 503);
  });
});

test("registration requires a provider-backed four-digit code and grants exactly 100 points", async () => {
  await withServer({}, { DEFAULT_GIFT_BALANCE: "999" }, async (context) => {
    const missing = await requestJson(context.baseUrl, "/api/auth/register", {
      method: "POST",
      body: { phone: "13800000001", password: "password123" },
    });
    assert.equal(missing.body.code, 400);

    const data = await register(context, "13800000001");
    assert.equal(data.userInfo.balance, 100);
    const balance = await requestJson(context.baseUrl, "/api/shumiao/balance", {
      headers: authHeaders(data.token),
    });
    assert.equal(balance.body.data.balance, 100);
  });
});

test("SMS sends are atomically rate-limited, wrong codes lock, and provider failure is explicit", async () => {
  await withServer({}, { SMS_TEST_PROVIDER_FAIL: "0" }, async (context) => {
    const first = await requestJson(context.baseUrl, "/api/auth/sms/send", {
      method: "POST",
      body: { phone: "13800000002", purpose: "register" },
    });
    assert.equal(first.body.code, 200);
    assert.match(first.body.data.debugCode, /^\d{4}$/);
    const concurrent = await Promise.all(Array.from({ length: 2 }, () => requestJson(context.baseUrl, "/api/auth/sms/send", {
      method: "POST",
      body: { phone: "13800000002", purpose: "register" },
    })));
    assert.equal(concurrent.filter((item) => item.body.code === 200).length, 0);

    const wrongCode = first.body.data.debugCode === "0000" ? "9999" : "0000";
    for (let i = 0; i < 5; i += 1) {
      const wrong = await requestJson(context.baseUrl, "/api/auth/register", {
        method: "POST",
        body: { phone: "13800000002", code: wrongCode, password: "password123" },
      });
      assert.equal(wrong.body.code, 400);
    }
    const locked = await requestJson(context.baseUrl, "/api/auth/register", {
      method: "POST",
      body: { phone: "13800000002", code: first.body.data.debugCode, password: "password123" },
    });
    assert.equal(locked.body.code, 400);
  });

  const context = makeTempContext();
  const phone = "13800000003";
  let firstServer;
  try {
    firstServer = await startServer(context, { SMS_PHONE_COOLDOWN_MS: "0" });
    const first = await requestJson(context.baseUrl, "/api/auth/sms/send", {
      method: "POST",
      body: { phone, purpose: "register" },
    });
    assert.equal(first.body.code, 200);
    assert.match(first.body.data.debugCode, /^\d{4}$/);
    await stopServerProcess(firstServer);
    firstServer = null;

    const secondServer = await startServer(context, {
      SMS_PHONE_COOLDOWN_MS: "0",
      SMS_TEST_PROVIDER_FAIL_PHONE: phone,
    });
    try {
      const failed = await requestJson(context.baseUrl, "/api/auth/sms/send", {
        method: "POST",
        body: { phone, purpose: "register" },
      });
      assert.equal(failed.response.status, 503);
      assert.equal(failed.body.code, 503);
      const oldCodeInvalid = await requestJson(context.baseUrl, "/api/auth/register", {
        method: "POST",
        body: { phone, code: first.body.data.debugCode, password: "password123" },
      });
      assert.equal(oldCodeInvalid.body.code, 400);
    } finally {
      await secondServer.close();
    }
  } finally {
    if (firstServer) await stopServerProcess(firstServer);
  }
});

test("reset is non-enumerating for unknown phones and provider failure is not reported as sent", async () => {
  const context = makeTempContext();
  let firstServer;
  const phone = "13800000004";
  try {
    firstServer = await startServer(context, { SMS_PHONE_COOLDOWN_MS: "0" });
    const unknown = await requestJson(context.baseUrl, "/api/auth/sms/send", {
      method: "POST",
      body: { phone: "13800000999", purpose: "reset_password" },
    });
    assert.equal(unknown.response.status, 200);
    assert.equal(unknown.body.code, 200);
    assert.equal(unknown.body.data.debugCode, undefined);

    const user = await register(context, phone);
    assert.ok(user.token);
    const resetCode = await sendCode(context.baseUrl, phone, "reset_password");
    await stopServerProcess(firstServer);
    firstServer = null;

    const secondServer = await startServer(context, {
      SMS_PHONE_COOLDOWN_MS: "0",
      SMS_TEST_PROVIDER_FAIL_PHONE: phone,
    });
    try {
      const failed = await requestJson(context.baseUrl, "/api/auth/sms/send", {
        method: "POST",
        body: { phone, purpose: "reset_password" },
      });
      assert.equal(failed.response.status, 503);
      assert.equal(failed.body.code, 503);
      const oldCodeInvalid = await requestJson(context.baseUrl, "/api/auth/password/reset", {
        method: "POST",
        body: { phone, code: resetCode, newPassword: "password456" },
      });
      assert.equal(oldCodeInvalid.body.code, 400);
    } finally {
      await secondServer.close();
    }
  } finally {
    if (firstServer) await stopServerProcess(firstServer);
  }
});

test("password reset revokes old tokens, consumes the code once, and legacy sms/login never creates a user", async () => {
  await withServer({}, { SMS_PHONE_COOLDOWN_MS: "0" }, async (context) => {
    const smsLogin = await requestJson(context.baseUrl, "/api/auth/sms/login", {
      method: "POST",
      body: { phone: "13800000005", password: "password123" },
    });
    assert.equal(smsLogin.body.code, 400);
    assert.equal(smsLogin.body.message, "手机号或密码错误");

    const registered = await register(context, "13800000005");
    const duplicateRegistration = await requestJson(context.baseUrl, "/api/auth/sms/send", {
      method: "POST",
      body: { phone: "13800000005", purpose: "register" },
    });
    assert.equal(duplicateRegistration.body.code, 400);
    assert.equal(duplicateRegistration.body.message, "注册信息不可用");
    const oldToken = registered.token;
    const resetCode = await sendCode(context.baseUrl, "13800000005", "reset_password");
    const reset = await requestJson(context.baseUrl, "/api/auth/password/reset", {
      method: "POST",
      body: { phone: "13800000005", code: resetCode, newPassword: "password456" },
    });
    assert.equal(reset.body.code, 200);

    const reused = await requestJson(context.baseUrl, "/api/auth/password/reset", {
      method: "POST",
      body: { phone: "13800000005", code: resetCode, newPassword: "password789" },
    });
    assert.equal(reused.body.code, 400);
    const revoked = await requestJson(context.baseUrl, "/api/auth/info", { headers: authHeaders(oldToken) });
    assert.equal(revoked.body.code, 401);
    const oldPassword = await requestJson(context.baseUrl, "/api/auth/login", {
      method: "POST",
      body: { phone: "13800000005", password: "password123" },
    });
    assert.equal(oldPassword.body.code, 400);
    const newPassword = await requestJson(context.baseUrl, "/api/auth/login", {
      method: "POST",
      body: { phone: "13800000005", password: "password456" },
    });
    assert.equal(newPassword.body.code, 200);

    const invalidPurpose = await requestJson(context.baseUrl, "/api/auth/sms/send", {
      method: "POST",
      body: { phone: "13800000005", purpose: "reset" },
    });
    assert.equal(invalidPurpose.body.code, 400);
  });
});

test("expired SMS codes cannot register", async () => {
  await withServer({}, { SMS_CODE_TTL_MS: "1", SMS_PHONE_COOLDOWN_MS: "0" }, async (context) => {
    const code = await sendCode(context.baseUrl, "13800000006");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const result = await requestJson(context.baseUrl, "/api/auth/register", {
      method: "POST",
      body: { phone: "13800000006", code, password: "password123" },
    });
    assert.equal(result.body.code, 400);
  });
});
