/**
 * 通用 PGY GET/POST JSON 请求层（蒲公英“找博主”底座第一阶段）。
 *
 * 职责：组装请求头（含 referer / Sec-Fetch-Mode / 可选签名头 X-s、X-t）、
 * 序列化 body、调用注入的 transport、按 HTTP 状态与业务 code 分类错误并脱敏。
 *
 * 纯 ESM，仅依赖 Node 内置能力，不直接发起网络请求：
 * - transport 由 Electron 端注入（现有 net.request 封装）；
 * - getHeaders 由生产注入蒲公英已捕获请求头；
 * - sign 由生产注入现有 X-s/X-t 签名实现。
 */

export const PGY_ORIGIN = "https://pgy.xiaohongshu.com";
export const PGY_AUTH_EXPIRED_CODES = new Set([401, -100, 902]);
export const PGY_RISK_CODES = new Set([461]);
export const PGY_HTTP_AUTH_STATUSES = new Set([401, 461]);

const DEFAULT_REFERER = `${PGY_ORIGIN}/solar/pre-trade/note/kol`;
const MAX_MESSAGE_LENGTH = 800;
const SENSITIVE_HEADER_KEY = /cookie|authorization|token|x-s|x-t|password|secret|session/i;
// Phase 5：搜索关键词同样属于用户输入敏感值（任务规格：关键词不得写入普通日志或错误详情）。
const SENSITIVE_VALUE_KEY_PATTERN =
  "cookie|authorization|token|password|secret|session|x-s|x-t|keyword";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function redactText(text) {
  const input = typeof text === "string" ? text : String(text ?? "");
  const redacted = input
    // 整段请求头形态：Cookie/Authorization 是「整行即敏感值」的头，一旦出现，
    // 把其后直到行尾的全部内容脱敏，
    // 覆盖多段 Cookie（`;` 分隔）中键名不敏感的后续分段。
    .replace(
      /(cookie|authorization)\s*[:=]\s*([^\r\n]*)/gi,
      (match, key) => `${key}: [redacted]`
    )
    // JSON 形态："key":"value" / 'key':'value'
    .replace(
      /(["'])(cookie|authorization|token|password|secret|session|x-s|x-t|keyword)\1\s*:\s*(["'])((?:\\.|[^"'])*?)\3/gi,
      (match, keyQuote, key, valueQuote) =>
        `${keyQuote}${key}${keyQuote}: ${valueQuote}[redacted]${valueQuote}`
    )
    // 键=值 形态：key=value。值允许 `;` 分段（防 `session=SECRET; tail` 只脱敏第一段），
    // 但停在下一个“键=值/键: 值”形态分段前，非敏感赋值分段（如 keep=1）保留。
    .replace(
      new RegExp(
        `(${SENSITIVE_VALUE_KEY_PATTERN})\\s*=\\s*((?:.)(?:(?!;\\s*[A-Za-z0-9_-]+\\s*[:=]).)*)`,
        "gi",
      ),
      (match, key) => `${key}=[redacted]`
    )
    // 键: 值 形态：key: value。同上吞掉后续 `;` 分段；`,}` 停界保留（JSON 形态由上方规则处理）。
    .replace(
      new RegExp(
        `(${SENSITIVE_VALUE_KEY_PATTERN})\\s*:\\s*((?:[^,}\\n\\r])(?:(?!;\\s*[A-Za-z0-9_-]+\\s*[:=]|[,}\\n\\r]).)*)`,
        "gi",
      ),
      (match, key) => `${key}: [redacted]`
    );
  return redacted.length > MAX_MESSAGE_LENGTH ? redacted.slice(0, MAX_MESSAGE_LENGTH) : redacted;
}

// 本地绝对路径脱敏：Windows 盘符路径与 UNC 路径替换为占位符。
// 用于磁盘/权限错误消息（fs 错误常携带绝对路径），防止本地敏感路径
// 泄漏进 IPC 错误详情、日志或任务元数据。
const LOCAL_WINDOWS_PATH_PATTERN =
  /(?:[A-Za-z]:[\\/][^\s'"<>|]*(?:[\\/][^\s'"<>|]*)*|\\\\(?:[^\\\s'"<>|]+)\\(?:[^\\\s'"<>|]*(?:\\[^\s'"<>|]*)*))/g;
export function redactLocalPathText(text) {
  const input = typeof text === "string" ? text : String(text ?? "");
  return input
    // 引号包裹的 Windows/UNC 绝对路径整体脱敏（可含空格，如 'C:\Users\my folder\...'；
    // fresh reviewer M1）。
    .replace(/(["'])((?:[A-Za-z]:[\\/]|\\\\)(?:[^"'])*?)\1/g, "$1[local-path-redacted]$1")
    // 未加引号的盘符/UNC 路径（不含空白，保持原语义）。
    .replace(LOCAL_WINDOWS_PATH_PATTERN, "[local-path-redacted]");
}

function redactDetails(value, key = "") {
  if (typeof value === "string") {
    return SENSITIVE_HEADER_KEY.test(key) ? "[redacted]" : redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactDetails(item, String(index)));
  }
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = redactDetails(childValue, childKey);
    }
    return out;
  }
  return value;
}

export class PgyRequestError extends Error {
  /**
   * @param {object} params
   * @param {"auth-expired"|"risk-control"|"api"|"http"|"invalid-json"|"invalid-response"|"transport"|"timeout"} params.kind
   * @param {string} params.message 已脱敏文本
   * @param {number|null} [params.httpStatusCode]
   * @param {number|null} [params.pgyCode]
   * @param {object} [params.details]
   */
  constructor({ kind, message, httpStatusCode = null, pgyCode = null, details } = {}) {
    super(redactText(message ?? ""));
    this.name = "PgyRequestError";
    this.kind = kind ?? "transport";
    this.httpStatusCode = httpStatusCode ?? null;
    this.pgyCode = pgyCode ?? null;
    this.details = details === undefined ? undefined : redactDetails(details);
  }
}

export class PgySessionRequest {
  /**
   * @param {object} params
   * @param {(opts: object) => Promise<{ statusCode: number, data: string }>} params.transport
   *   opts = { url, method, session, headers, body?, timeoutMs }；无 body 时 opts 不含 body 键。
   * @param {() => object} [params.getHeaders] 追加请求头。
   * @param {(path: string, body?: unknown) => { "X-s": string, "X-t": number }} [params.sign] 签名函数。
   * @param {number} [params.timeoutMs=30000]
   * @param {{ info?: Function, warn?: Function, error?: Function }} [params.logger]
   */
  constructor({ transport, getHeaders, sign, timeoutMs = 30000, logger } = {}) {
    if (typeof transport !== "function") {
      throw new TypeError("PgySessionRequest: transport 必须是函数");
    }
    this.transport = transport;
    this.getHeaders = typeof getHeaders === "function" ? getHeaders : undefined;
    this.sign = typeof sign === "function" ? sign : undefined;
    this.timeoutMs = timeoutMs;
    this.logger = isRecord(logger) ? logger : undefined;
  }

  static redactText(text) {
    return redactText(text);
  }

  static redactLocalPathText(text) {
    return redactLocalPathText(text);
  }

  static redactHeaders(headers) {
    // 公开工具：供日志脱敏、调试与后续扩展复用（Phase 1 生产路径统一走 redactText）。
    const out = {};
    if (!isRecord(headers)) {
      return out;
    }
    for (const [key, value] of Object.entries(headers)) {
      out[key] = SENSITIVE_HEADER_KEY.test(key) ? "[redacted]" : value;
    }
    return out;
  }

  _log(level, ...args) {
    const fn = this.logger && this.logger[level];
    if (typeof fn === "function") {
      try {
        fn(...args);
      } catch {
        // 日志失败不能影响请求主流程
      }
    }
  }

  /**
   * 发送 PGY JSON 请求。
   * 成功返回 { httpStatusCode, code, data, msg, raw }；失败抛 PgyRequestError。
   *
   * @param {object} params
   * @param {string} params.url 完整 URL（以 PGY_ORIGIN 开头）。
   * @param {string} [params.method="GET"]
   * @param {unknown} [params.body] 将被 JSON.stringify；undefined 表示无 body。
   * @param {unknown} [params.session] 原样透传给 transport。
   * @param {string} [params.referer] 显式传入则覆盖默认 referer。
   * @param {object} [params.headers] 追加请求头。
   * @param {number} [params.timeoutMs] 覆盖构造时的默认超时。
   */
  async requestJson({ url, method = "GET", body, session, referer, headers, timeoutMs } = {}) {
    const path = url.replace(PGY_ORIGIN, "");
    const bodyText = body === undefined ? undefined : JSON.stringify(body);
    let rawSigHeaders;
    let extraHeaders;
    try {
      rawSigHeaders = this.sign ? this.sign(path, body) : undefined;
      extraHeaders = this.getHeaders ? this.getHeaders() : {};
    } catch (err) {
      throw this._fail(
        "transport",
        `PGY request failed: 注入函数异常（${err instanceof Error ? err.message : String(err)}）`,
        null,
        null,
        "error",
      );
    }
    // Electron net.request 的 setHeader 只接受字符串；X-t 数值必须字符串化。
    const sigHeaders = rawSigHeaders
      ? {
          ...(rawSigHeaders["X-s"] === undefined ? {} : { "X-s": String(rawSigHeaders["X-s"]) }),
          ...(rawSigHeaders["X-t"] === undefined ? {} : { "X-t": String(rawSigHeaders["X-t"]) })
        }
      : undefined;

    const mergedHeaders = {
      ...(extraHeaders || {}),
      ...(isRecord(headers) ? headers : {}),
      referer: referer ?? DEFAULT_REFERER,
      "Sec-Fetch-Mode": "no-cors",
      ...(sigHeaders ? sigHeaders : {}),
    };
    const isPost = typeof method === "string" && method.toUpperCase() === "POST";
    if (isPost && bodyText !== undefined && !hasHeaderIgnoreCase(mergedHeaders, "Content-Type")) {
      mergedHeaders["Content-Type"] = "application/json;charset=UTF-8";
    }

    const opts = {
      url,
      method,
      session,
      headers: mergedHeaders,
      timeoutMs: timeoutMs ?? this.timeoutMs,
    };
    if (bodyText !== undefined) {
      opts.body = bodyText;
    }

    let response;
    try {
      response = await this.transport(opts);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const kind = /timeout/i.test(rawMessage) ? "timeout" : "transport";
      throw this._fail(kind, `PGY request failed (${kind}): ${rawMessage}`, null, null, "error");
    }

    const httpStatusCode =
      response && typeof response === "object" && typeof response.statusCode === "number"
        ? response.statusCode
        : null;

    if (httpStatusCode !== null && PGY_HTTP_AUTH_STATUSES.has(httpStatusCode)) {
      const kind = httpStatusCode === 401 ? "auth-expired" : "risk-control";
      throw this._fail(
        kind,
        `PGY request failed: HTTP ${httpStatusCode} (${kind})`,
        httpStatusCode,
        null,
        "warn"
      );
    }
    if (httpStatusCode !== null && (httpStatusCode < 200 || httpStatusCode >= 300)) {
      throw this._fail(
        "http",
        `PGY request failed: HTTP ${httpStatusCode}`,
        httpStatusCode,
        null,
        "warn"
      );
    }

    const responseData = response && typeof response === "object" ? response.data : undefined;
    let raw;
    try {
      raw = typeof responseData === "string" ? JSON.parse(responseData) : responseData;
    } catch {
      throw this._fail(
        "invalid-json",
        `PGY request failed: invalid JSON response (HTTP ${httpStatusCode ?? "n/a"})`,
        httpStatusCode,
        null,
        "warn"
      );
    }

    if (!isRecord(raw)) {
      throw this._fail(
        "invalid-response",
        `PGY request failed: invalid response structure (HTTP ${httpStatusCode ?? "n/a"})`,
        httpStatusCode,
        null,
        "warn"
      );
    }

    const code = raw.code;
    if (PGY_AUTH_EXPIRED_CODES.has(code)) {
      throw this._fail("auth-expired", `PGY auth expired (code ${code})`, httpStatusCode, code, "warn");
    }
    if (PGY_RISK_CODES.has(code)) {
      throw this._fail(
        "risk-control",
        `PGY risk control triggered (code ${code})`,
        httpStatusCode,
        code,
        "warn"
      );
    }
    if (code !== 0) {
      const codeText = code === undefined ? "undefined" : String(code);
      const msgSuffix = raw.msg === undefined ? "" : `: ${String(raw.msg)}`;
      throw this._fail(
        "api",
        `PGY API error (code ${codeText})${msgSuffix}`,
        httpStatusCode,
        typeof code === "number" ? code : null,
        "warn"
      );
    }

    return {
      httpStatusCode,
      code: raw.code,
      data: raw.data,
      msg: raw.msg,
      raw,
    };
  }

  _fail(kind, message, httpStatusCode, pgyCode, level) {
    const error = new PgyRequestError({ kind, message, httpStatusCode, pgyCode });
    this._log(level, error.message);
    return error;
  }
}

function hasHeaderIgnoreCase(headers, name) {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}
