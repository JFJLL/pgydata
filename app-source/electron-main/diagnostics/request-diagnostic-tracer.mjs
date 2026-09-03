import crypto from "node:crypto";
import { redactUrl, redactText } from "./diagnostic-redactor.mjs";

/**
 * Helper to trace HTTP request lifecycle and classify effective failures
 * (including HTTP 200 with error body.code).
 */
export class RequestDiagnosticTracer {
  constructor(traceStore = null, networkCollector = null) {
    this.traceStore = traceStore;
    this.networkCollector = networkCollector;
  }

  startRequest({ method = "GET", endpoint = "/", taskId = null, requestId = null, host = "magiorix.red-magic.cn" }) {
    const reqId = requestId || `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
    const sanitizedEndpoint = redactUrl(String(endpoint).split("?")[0]);
    const startedAt = Date.now();

    if (this.traceStore && typeof this.traceStore.record === "function") {
      this.traceStore.record({
        time: new Date().toISOString(),
        level: "info",
        module: "network",
        event: "request_start",
        taskId: taskId ? String(taskId).slice(0, 128) : null,
        requestId: reqId,
        httpMethod: String(method).toUpperCase(),
        endpoint: sanitizedEndpoint,
      });
    }

    return {
      requestId: reqId,
      startedAt,
      method: String(method).toUpperCase(),
      endpoint: sanitizedEndpoint,
      taskId,
      host,
    };
  }

  completeRequest(context, { httpStatus = 200, parsedBody = null, error = null, isTimeout = false }) {
    const durationMs = Date.now() - (context.startedAt || Date.now());
    const taskId = context.taskId || null;
    const requestId = context.requestId || null;
    const method = context.method || "GET";
    const endpoint = context.endpoint || "/";
    const host = context.host || "magiorix.red-magic.cn";

    // 1. Classify effective failure
    let effectiveFailure = false;
    let isAuthExpired = false;
    let errorCode = null;
    let errorMessage = null;

    if (isTimeout) {
      effectiveFailure = true;
      errorCode = "NETWORK_TIMEOUT";
      errorMessage = "request timeout";
    } else if (error) {
      effectiveFailure = true;
      errorCode = error.code || "NETWORK_ERROR";
      errorMessage = error.message || String(error);
    } else if (httpStatus >= 400) {
      effectiveFailure = true;
      errorCode = `HTTP_${httpStatus}`;
      if (httpStatus === 401) isAuthExpired = true;
      errorMessage = parsedBody?.message || `HTTP ${httpStatus}`;
    } else if (parsedBody && typeof parsedBody === "object") {
      const bodyCode = Number(parsedBody.code);
      if (Number.isFinite(bodyCode) && bodyCode >= 400) {
        effectiveFailure = true;
        errorCode = `BUSINESS_${bodyCode}`;
        if (bodyCode === 401) isAuthExpired = true;
        errorMessage = parsedBody.message || `Business error code ${bodyCode}`;
      }
    }

    // 2. Record to NetworkDiagnosticCollector summary
    if (this.networkCollector && typeof this.networkCollector.recordRequest === "function") {
      this.networkCollector.recordRequest({
        httpMethod: method,
        endpoint,
        host,
        httpStatus: Number(httpStatus) || (effectiveFailure ? (isTimeout ? 0 : 500) : 200),
        durationMs,
        requestId,
        errorCode: errorCode || undefined,
        error: errorMessage || undefined,
        isTimeout,
      });
    }

    // 3. Record event to DiagnosticTraceStore
    if (this.traceStore && typeof this.traceStore.record === "function") {
      if (isAuthExpired) {
        this.traceStore.record({
          time: new Date().toISOString(),
          level: "error",
          module: "auth",
          event: "auth_expired",
          taskId,
          requestId,
          endpoint,
          httpStatus: Number(httpStatus) || 401,
          errorCode: "AUTH_EXPIRED",
          message: "authentication expired or token revoked",
        });
      }

      const eventName = isTimeout
        ? "request_timeout"
        : effectiveFailure
          ? "request_failed"
          : "request_success";

      this.traceStore.record({
        time: new Date().toISOString(),
        level: effectiveFailure ? "error" : "info",
        module: "network",
        event: eventName,
        taskId,
        requestId,
        httpMethod: method,
        endpoint,
        durationMs,
        httpStatus: Number(httpStatus) || null,
        errorCode: errorCode || null,
        message: errorMessage ? redactText(String(errorMessage).slice(0, 500)) : null,
      });
    }

    return {
      effectiveFailure,
      isAuthExpired,
      errorCode,
      errorMessage,
      durationMs,
    };
  }
}
