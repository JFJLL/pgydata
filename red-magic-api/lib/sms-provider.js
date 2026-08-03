const crypto = require("crypto");

const SMS_PURPOSES = new Set(["register", "reset_password"]);

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function providerFailureForPhone(phone) {
  const configured = String(process.env.SMS_TEST_PROVIDER_FAIL_PHONE || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return process.env.SMS_TEST_PROVIDER_FAIL === "1" || configured.includes(phone);
}

function loadPopCore() {
  try {
    return require("@alicloud/pop-core");
  } catch {
    throw new Error("阿里云短信 SDK 未安装");
  }
}

function createPopCoreClient() {
  const accessKeyId = String(process.env.ALIYUN_SMS_ACCESS_KEY_ID || "").trim();
  const accessKeySecret = String(process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || "").trim();
  const signName = String(process.env.ALIYUN_SMS_SIGN_NAME || "").trim();
  const templateCode = String(process.env.ALIYUN_SMS_TEMPLATE_CODE || "").trim();
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error("阿里云短信服务未完整配置");
  }
  const Core = loadPopCore();
  return {
    signName,
    templateCode,
    client: new Core({
      accessKeyId,
      accessKeySecret,
      endpoint: process.env.ALIYUN_SMS_ENDPOINT || "https://dysmsapi.aliyuncs.com",
      apiVersion: "2017-05-25",
      regionId: process.env.ALIYUN_SMS_REGION_ID || "cn-beijing",
    }),
  };
}

async function sendVerificationCode({ phone, code, purpose, client } = {}) {
  const normalizedPhone = normalizePhone(phone);
  if (!SMS_PURPOSES.has(String(purpose || ""))) {
    throw new Error("短信用途不合法");
  }
  if (process.env.NODE_ENV === "test" && process.env.SMS_TEST_MODE === "1") {
    if (providerFailureForPhone(normalizedPhone)) {
      const error = new Error("短信服务暂时不可用");
      error.providerCode = "TEST_PROVIDER_FAILURE";
      throw error;
    }
    return {
      requestId: `test-${crypto.randomUUID()}`,
      debugCode: code,
    };
  }

  const provider = client || createPopCoreClient();
  const response = await provider.client.request("SendSms", {
    PhoneNumbers: normalizedPhone,
    SignName: provider.signName,
    TemplateCode: provider.templateCode,
    TemplateParam: JSON.stringify({ code }),
  }, { method: "POST" });
  if (!response || response.Code !== "OK") {
    const error = new Error("验证码发送失败");
    error.providerCode = String(response?.Code || "UNKNOWN").slice(0, 64);
    throw error;
  }
  return { requestId: String(response.RequestId || "") };
}

module.exports = {
  SMS_PURPOSES,
  createPopCoreClient,
  normalizePhone,
  sendVerificationCode,
};
