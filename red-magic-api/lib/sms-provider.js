const Core = require("@alicloud/pop-core");

const SMS_SIGN_NAME = process.env.ALIYUN_SMS_SIGN_NAME || "北京易美广告";
const SMS_TEMPLATE_CODE = process.env.ALIYUN_SMS_TEMPLATE_CODE || "SMS_499290595";

function loadCredentials() {
  return {
    accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || "",
  };
}

async function sendVerificationCode({ phone, code }) {
  if (process.env.NODE_ENV === "test" && process.env.SMS_TEST_MODE === "1") {
    return { requestId: "test-request" };
  }

  const credentials = loadCredentials();
  if (!credentials.accessKeyId || !credentials.accessKeySecret) {
    throw new Error("短信服务未配置");
  }

  const client = new Core({
    ...credentials,
    endpoint: process.env.ALIYUN_SMS_ENDPOINT || "https://dysmsapi.aliyuncs.com",
    apiVersion: "2017-05-25",
    regionId: process.env.ALIYUN_SMS_REGION_ID || "cn-beijing",
  });
  const response = await client.request("SendSms", {
    PhoneNumbers: phone,
    SignName: SMS_SIGN_NAME,
    TemplateCode: SMS_TEMPLATE_CODE,
    TemplateParam: JSON.stringify({ code }),
  }, { method: "POST" });

  if (!response || response.Code !== "OK") {
    const error = new Error("验证码发送失败，请稍后重试");
    error.providerCode = response && response.Code;
    throw error;
  }
  return { requestId: String(response.RequestId || "") };
}

module.exports = {
  SMS_SIGN_NAME,
  SMS_TEMPLATE_CODE,
  sendVerificationCode,
};
