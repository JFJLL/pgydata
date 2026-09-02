import { redactObject, redactText } from "./diagnostic-redactor.mjs";

const MAX_ERROR_HISTORY = 100;

export class ErrorCollector {
  constructor(traceStore = null) {
    this.traceStore = traceStore;
    this.errors = [];
  }

  recordError(source, errorOrDetails = {}) {
    try {
      const time = new Date().toISOString();
      let name = "Error";
      let message = "";
      let stack = "";
      let code = null;
      let route = null;
      let extra = {};

      if (errorOrDetails instanceof Error) {
        name = errorOrDetails.name || "Error";
        message = errorOrDetails.message || "";
        stack = errorOrDetails.stack || "";
        code = errorOrDetails.code || null;
      } else if (typeof errorOrDetails === "object" && errorOrDetails !== null) {
        name = errorOrDetails.name || "Error";
        message = errorOrDetails.message || String(errorOrDetails);
        stack = errorOrDetails.stack || "";
        code = errorOrDetails.code || null;
        route = errorOrDetails.route ? redactText(String(errorOrDetails.route).replace(/\?.*$/, "")) : null;
        if (errorOrDetails.reason) extra.reason = String(errorOrDetails.reason);
        if (errorOrDetails.exitCode !== undefined) extra.exitCode = errorOrDetails.exitCode;
      } else {
        message = String(errorOrDetails);
      }

      const item = redactObject({
        time,
        source: String(source || "main"),
        name: String(name).slice(0, 64),
        message: redactText(String(message).slice(0, 1000)),
        stack: stack ? redactText(String(stack).slice(0, 4000)) : undefined,
        code: code ? String(code).slice(0, 32) : undefined,
        route: route || undefined,
        ...extra,
      });

      if (this.errors.length >= MAX_ERROR_HISTORY) {
        this.errors.shift();
      }
      this.errors.push(item);

      // Also record to TraceStore if available
      if (this.traceStore && typeof this.traceStore.record === "function") {
        this.traceStore.record({
          time,
          level: "error",
          module: `error:${source}`,
          event: "error_captured",
          errorCode: code || name,
          message,
        });
      }
    } catch {}
  }

  getRecentErrors() {
    return [...this.errors];
  }
}
