import { promises as fs } from "node:fs";
import path from "node:path";
import { redactText } from "./diagnostic-redactor.mjs";

const MAX_LOG_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function collectMainLogs(options = {}) {
  const logsDir = options.logsDir || path.join(process.cwd(), "userData", "logs");
  const maxFileSize = Number(options.maxFileSize) || MAX_LOG_FILE_SIZE_BYTES;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const targetNames = [
    { alias: "main-current.log", filename: `magiorix-main-${today}.log` },
    { alias: "main-previous.log", filename: `magiorix-main-${yesterday}.log` },
  ];

  const collectedLogs = [];

  for (const target of targetNames) {
    const filePath = path.join(logsDir, target.filename);
    try {
      const stat = await fs.stat(filePath);
      let content = "";
      let truncated = false;
      const originalSize = stat.size;

      if (stat.size <= maxFileSize) {
        content = await fs.readFile(filePath, "utf8");
      } else {
        // Read tail portion of the file
        truncated = true;
        const handle = await fs.open(filePath, "r");
        const buffer = Buffer.alloc(maxFileSize);
        const position = stat.size - maxFileSize;
        await handle.read(buffer, 0, maxFileSize, position);
        await handle.close();
        content = buffer.toString("utf8");
        // Find first newline to avoid half-line at beginning of chunk
        const firstNl = content.indexOf("\n");
        if (firstNl !== -1) {
          content = content.slice(firstNl + 1);
        }
      }

      const redactedContent = redactText(content);
      collectedLogs.push({
        alias: target.alias,
        filename: target.filename,
        originalSize,
        includedSize: Buffer.byteLength(redactedContent, "utf8"),
        truncated,
        content: redactedContent,
      });
    } catch {
      // If file does not exist or cannot be read, record placeholder or skip
    }
  }

  return collectedLogs;
}
