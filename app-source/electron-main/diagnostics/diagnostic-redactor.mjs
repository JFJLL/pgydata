import os from "node:os";

const SENSITIVE_KEY_PATTERN = /^(authorization|proxy-authorization|satoken|cookie|set-cookie|x-api-key|api-key|password|passwd|pwd|token|access_?token|refresh_?token|secret|api_?key|sms_?code|verification_?code|payment_?token|sec_?key|sign|signature|a1|web_session|session_?token|session_?cookie|sid)$/i;

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "satoken",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
]);

function getHomePathPatterns() {
  const patterns = [];
  try {
    const home = os.homedir();
    if (home && typeof home === "string" && home.length > 2) {
      const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push(new RegExp(escaped, "gi"));
      const forward = home.replace(/\\/g, "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (forward !== escaped) {
        patterns.push(new RegExp(forward, "gi"));
      }
    }
  } catch {}

  patterns.push(/([A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s"':]+)/gi);
  patterns.push(/(\/Users\/[^\/\s"':]+)/g);
  patterns.push(/(\/home\/[^\/\s"':]+)/g);
  return patterns;
}

const HOME_PATTERNS = getHomePathPatterns();

export function redactUserHomePath(str) {
  if (typeof str !== "string") return str;
  let result = str;
  for (const pattern of HOME_PATTERNS) {
    result = result.replace(pattern, "<USER_HOME>");
  }
  return result;
}

export function redactUrl(urlString) {
  if (typeof urlString !== "string") return urlString;
  // Strip query & fragment from relative endpoints (e.g., /api/kol/page?query=xxx -> /api/kol/page)
  let cleaned = urlString;
  if (cleaned.startsWith("/") && cleaned.includes("?")) {
    cleaned = cleaned.replace(/\?.*$/, "");
  }
  return cleaned.replace(/https?:\/\/[^\s"'>]+/g, (url) => {
    try {
      const parsed = new URL(url);
      return redactUserHomePath(parsed.origin + parsed.pathname);
    } catch {
      return redactUserHomePath(url.replace(/[?#].*$/, ""));
    }
  });
}

export function redactPhone(text) {
  if (typeof text !== "string") return text;
  return text.replace(/(?<!\d)(?:\+?86[- ]?)?(1[3-9]\d)(\d{4})(\d{4})(?!\d)/g, "$1****$3");
}

export function redactEmail(text) {
  if (typeof text !== "string") return text;
  return text.replace(/([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g, "$1***@$2");
}

export function redactText(text) {
  if (typeof text !== "string") return text;
  if (!text) return "";

  let res = text;

  res = res.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]{10,}(?:=*)/gi, "$1<REDACTED>");
  res = res.replace(/(satoken[=:\s"']+)[A-Za-z0-9._~+\/-]{6,}(["';&\s]?)/gi, "$1<REDACTED>$2");
  res = res.replace(/((?:authorization|proxy-authorization|x-api-key|api-key)\s*[:=]\s*)[^\r\n,;"']+/gi, "$1<REDACTED>");
  res = res.replace(/((?:set-cookie|cookie)\s*:\s*)[^\r\n]+/gi, "$1<REDACTED>");
  res = res.replace(/(?:^|[;&\s])(a1|web_session|session|sid|token|auth_token|jwt|pgy_session)=([^;&\s"']+)/gi, (match, key) => {
    return match.replace(/=[^;&\s"']+/, "=<REDACTED>");
  });
  res = res.replace(/([\"']?(?:password|passwd|pwd|token|accessToken|refreshToken|access_token|refresh_token|secret|apiKey|api_key|smsCode|sms_code|verificationCode|verification_code|paymentToken|payment_token|sec_key)[\"']?\s*[:=]\s*[\"']?)[^\r\n,;"'}\]]+/gi, "$1<REDACTED>");
  res = redactUrl(res);
  res = redactPhone(res);
  res = redactEmail(res);
  res = redactUserHomePath(res);

  return res;
}

export function redactObject(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (typeof value === "function") {
    return undefined;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => redactObject(item, seen));
    }

    if (value instanceof Error) {
      return {
        name: redactText(value.name || "Error"),
        message: redactText(value.message || ""),
        stack: value.stack ? redactText(value.stack) : undefined,
        code: value.code,
      };
    }

    if (value instanceof Map) {
      const copy = {};
      for (const [k, v] of value.entries()) {
        const keyStr = String(k);
        if (SENSITIVE_KEY_PATTERN.test(keyStr)) {
          copy[keyStr] = "<REDACTED>";
        } else {
          copy[keyStr] = redactObject(v, seen);
        }
      }
      return copy;
    }

    if (value instanceof Set) {
      return Array.from(value).map((item) => redactObject(item, seen));
    }

    const result = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_HEADER_NAMES.has(lowerKey) || SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "<REDACTED>";
      } else {
        result[key] = redactObject(val, seen);
      }
    }
    return result;
  }

  return redactText(String(value));
}

export function scanForSensitiveData(textOrObj) {
  const content = typeof textOrObj === "string" ? textOrObj : JSON.stringify(textOrObj);
  const findings = [];

  const checkPatterns = [
    { name: "Bearer Token", regex: /Bearer\s+[A-Za-z0-9._~+\/-]{16,}/i },
    { name: "Raw satoken", regex: /satoken[=:\s"']+[A-Za-z0-9._~+\/-]{16,}/i },
    { name: "Raw Cookie", regex: /(?:a1|web_session|sid)=[A-Za-z0-9._~+\/-]{12,}/i },
    { name: "Password field", regex: /"password"\s*:\s*"[^"<]{4,}"/i },
    { name: "Access Token field", regex: /"access_?token"\s*:\s*"[^"<]{10,}"/i },
    { name: "Refresh Token field", regex: /"refresh_?token"\s*:\s*"[^"<]{10,}"/i },
  ];

  for (const { name, regex } of checkPatterns) {
    if (regex.test(content)) {
      findings.push(name);
    }
  }

  return {
    clean: findings.length === 0,
    findings,
  };
}
