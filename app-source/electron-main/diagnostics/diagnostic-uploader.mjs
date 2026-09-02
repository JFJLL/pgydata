import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export class DiagnosticUploader {
  constructor(options = {}) {
    this.getApiClient = options.getApiClient || (() => null);
  }

  /**
   * Uploads diagnostic package using the existing authenticated API client
   */
  async uploadPackage(packagerResult, userOptions = {}) {
    const apiClient = this.getApiClient();
    if (!apiClient || !apiClient.baseUrl || !apiClient.token) {
      throw new Error("用户未登录或网络服务未就绪，无法直接上传");
    }

    const { clientReportId, zipBuffer, fileSizeBytes, sha256, manifest, summary } = packagerResult;

    // Step 1: Create report metadata
    const createPayload = {
      clientReportId,
      appVersion: manifest.appVersion,
      assetsVersion: manifest.assetsVersion,
      platform: manifest.platform,
      arch: manifest.arch,
      installId: manifest.installId,
      sessionId: manifest.sessionId,
      relatedTaskId: userOptions.relatedTaskId || manifest.relatedTaskId || null,
      issueOccurredAt: userOptions.issueOccurredAt || manifest.issueOccurredAt || null,
      userNote: userOptions.userNote || manifest.userNote || null,
      fileSizeBytes,
      fileSha256: sha256,
      summary,
    };

    const createRes = await apiClient.request("POST", "/api/diagnostics/reports", createPayload);
    if (!createRes || !createRes.data || !createRes.data.reportId) {
      throw new Error(createRes?.message || "创建诊断报告失败");
    }

    const reportId = createRes.data.reportId;
    const uploadPath = createRes.data.uploadUrl || `/api/diagnostics/reports/${encodeURIComponent(reportId)}/upload`;

    // Step 2: Upload raw binary ZIP file
    const fullUploadUrl = new URL(uploadPath, apiClient.baseUrl);
    await this.uploadBinary(fullUploadUrl, zipBuffer, apiClient.token, sha256);

    return {
      success: true,
      reportId,
      clientReportId,
      fileSizeBytes,
      sha256,
    };
  }

  uploadBinary(url, buffer, token, sha256) {
    return new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const req = transport.request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": buffer.length,
          "satoken": token,
          "X-Magiorix-File-Sha256": sha256,
        },
        timeout: 60000,
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              if (parsed.code === 200) {
                resolve(parsed);
              } else {
                reject(new Error(parsed.message || `上传失败: HTTP ${res.statusCode}`));
              }
            } catch {
              resolve({ code: 200 });
            }
          } else {
            reject(new Error(`上传失败: HTTP ${res.statusCode} ${body || ""}`));
          }
        });
      });

      req.on("error", (err) => reject(err));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("上传诊断包超时"));
      });

      req.write(buffer);
      req.end();
    });
  }
}
