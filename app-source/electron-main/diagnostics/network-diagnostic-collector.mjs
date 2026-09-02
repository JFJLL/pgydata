import { redactUrl, redactText } from "./diagnostic-redactor.mjs";

export class NetworkDiagnosticCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalTimeouts = 0;
    this.totalDurationMs = 0;
    this.failuresByHost = {};
    this.failuresByStatus = {};
    this.recentRequests = []; // max 50 recent sanitized metadata items
  }

  recordRequest(info = {}) {
    try {
      this.totalRequests++;
      const durationMs = Number(info.durationMs) || 0;
      this.totalDurationMs += durationMs;

      const httpStatus = Number(info.httpStatus) || 0;
      const isTimeout = !!info.isTimeout || info.errorCode === "NETWORK_TIMEOUT" || info.errorCode === "TIMEOUT";
      const isFailure = isTimeout || httpStatus >= 400 || httpStatus === 0 || !!info.error;

      if (isTimeout) this.totalTimeouts++;
      if (isFailure) {
        this.totalFailures++;
        const host = info.host ? String(info.host).toLowerCase() : "unknown";
        this.failuresByHost[host] = (this.failuresByHost[host] || 0) + 1;
        const statusKey = String(httpStatus || (isTimeout ? "TIMEOUT" : "NET_ERR"));
        this.failuresByStatus[statusKey] = (this.failuresByStatus[statusKey] || 0) + 1;
      }

      // Keep limited sanitized recent requests
      if (this.recentRequests.length >= 50) {
        this.recentRequests.shift();
      }

      this.recentRequests.push({
        time: new Date().toISOString(),
        method: info.httpMethod ? String(info.httpMethod).toUpperCase() : "GET",
        endpoint: info.endpoint ? redactUrl(String(info.endpoint).slice(0, 128)) : "/",
        host: info.host ? String(info.host).slice(0, 64) : null,
        httpStatus: httpStatus || null,
        durationMs,
        errorCode: info.errorCode ? String(info.errorCode).slice(0, 64) : null,
        requestId: info.requestId ? String(info.requestId).slice(0, 128) : null,
      });
    } catch {}
  }

  getSummary() {
    const avgDuration = this.totalRequests > 0 ? Math.round(this.totalDurationMs / this.totalRequests) : 0;
    return {
      requests: this.totalRequests,
      failures: this.totalFailures,
      timeouts: this.totalTimeouts,
      averageDurationMs: avgDuration,
      failuresByHost: { ...this.failuresByHost },
      failuresByStatus: { ...this.failuresByStatus },
      recentRequests: [...this.recentRequests],
      generatedAt: new Date().toISOString(),
    };
  }
}
