const test = require("node:test");
const assert = require("node:assert/strict");
const { authHeaders, requestJson, withServer } = require("./api-test-helpers");

async function register(context, phone) {
  const sms = await requestJson(context.baseUrl, "/api/auth/sms/send", { method: "POST", body: { phone, purpose: "register" } });
  const result = await requestJson(context.baseUrl, "/api/auth/register", { method: "POST", body: { phone, code: sms.body.data.debugCode, password: "password123" } });
  assert.equal(result.body.code, 200, JSON.stringify(result.body));
  return result.body.data;
}

test("deterministic ordinary lifecycle event id is idempotent across repeated delivery", async () => {
  await withServer({}, {}, async (context) => {
    const user = await register(context, "13800000821");
    const event = {
      eventId: "task-start:resume-safe-0001",
      eventName: "task_start",
      appVersion: "1.4.2",
      module: "collection",
      pluginId: "pgy",
      taskType: "blogger",
      taskId: "resume-safe-0001",
      inputType: "xlsx",
      itemCount: 5,
    };
    const first = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers: authHeaders(user.token), body: { events: [event] } });
    const second = await requestJson(context.baseUrl, "/api/analytics/events", { method: "POST", headers: authHeaders(user.token), body: { events: [event] } });
    assert.equal(first.body.code, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.inserted, 1);
    assert.equal(first.body.data.duplicated, 0);
    assert.equal(second.body.code, 200, JSON.stringify(second.body));
    assert.equal(second.body.data.inserted, 0);
    assert.equal(second.body.data.duplicated, 1);
  });
});
