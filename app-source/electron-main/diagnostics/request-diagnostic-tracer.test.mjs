import test from "node:test";
import assert from "node:assert/strict";
import { RequestDiagnosticTracer } from "./request-diagnostic-tracer.mjs";

test("RequestDiagnosticTracer: request_start, request_success, effective failure classification & auth_expired", () => {
  const traces = [];
  const mockTraceStore = {
    record: (item) => traces.push(item),
  };
  const networkRecords = [];
  const mockNetCollector = {
    recordRequest: (item) => networkRecords.push(item),
  };

  const tracer = new RequestDiagnosticTracer(mockTraceStore, mockNetCollector);

  // Case 1: Normal success (HTTP 200 + body.code 200)
  const ctx1 = tracer.startRequest({ method: "GET", endpoint: "/api/user/info?token=secret", taskId: "task_101" });
  assert.equal(traces.length, 1);
  assert.equal(traces[0].event, "request_start");
  assert.equal(traces[0].taskId, "task_101");
  assert.equal(traces[0].endpoint, "/api/user/info"); // query stripped
  assert.ok(ctx1.requestId.startsWith("req_"));

  const res1 = tracer.completeRequest(ctx1, { httpStatus: 200, parsedBody: { code: 200, data: {} } });
  assert.equal(res1.effectiveFailure, false);
  assert.equal(traces.length, 2);
  assert.equal(traces[1].event, "request_success");
  assert.equal(traces[1].taskId, "task_101");
  assert.equal(traces[1].requestId, ctx1.requestId);

  // Case 2: HTTP 200 with Business failure (body.code 403)
  const ctx2 = tracer.startRequest({ method: "POST", endpoint: "/api/task/run", taskId: "task_102" });
  const res2 = tracer.completeRequest(ctx2, { httpStatus: 200, parsedBody: { code: 403, message: "forbidden" } });
  assert.equal(res2.effectiveFailure, true);
  assert.equal(traces.length, 4);
  assert.equal(traces[3].event, "request_failed");
  assert.equal(traces[3].errorCode, "BUSINESS_403");
  assert.equal(traces[3].taskId, "task_102");

  // Case 3: HTTP 200 with 401 code -> emits auth_expired and request_failed
  const ctx3 = tracer.startRequest({ method: "POST", endpoint: "/api/auth/refresh", taskId: "task_103" });
  const res3 = tracer.completeRequest(ctx3, { httpStatus: 200, parsedBody: { code: 401, message: "token expired" } });
  assert.equal(res3.effectiveFailure, true);
  assert.equal(res3.isAuthExpired, true);
  // Should emit both auth_expired and request_failed
  const authExp = traces.find((t) => t.event === "auth_expired" && t.taskId === "task_103");
  assert.ok(authExp);
  assert.equal(authExp.errorCode, "AUTH_EXPIRED");

  // Case 4: Network timeout
  const ctx4 = tracer.startRequest({ method: "POST", endpoint: "/api/shumiao/consume", taskId: "task_104" });
  const res4 = tracer.completeRequest(ctx4, { isTimeout: true });
  assert.equal(res4.effectiveFailure, true);
  const timeoutTrace = traces.find((t) => t.event === "request_timeout" && t.taskId === "task_104");
  assert.ok(timeoutTrace);
  assert.equal(timeoutTrace.errorCode, "NETWORK_TIMEOUT");
});
