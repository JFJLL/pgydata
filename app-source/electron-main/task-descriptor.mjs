import crypto from "crypto";
import { canonicalJson } from "./manifest-crypto.mjs";

export function hashSha256(content) {
  return crypto.createHash("sha256").update(String(content), "utf8").digest("hex");
}

/** Normalize a collection URL before it participates in the authorization digest. */
export function normalizeTaskInput(input) {
  if (typeof input !== "string") return input;
  const value = input.trim();
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm$|from$|share_|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value;
  }
}

export function normalizeTaskInputs(inputs = []) {
  if (!Array.isArray(inputs)) throw new TypeError("Task inputs must be an array");
  return inputs.map(normalizeTaskInput);
}

export function computeInputMerkleRoot(inputs) {
  const normalized = normalizeTaskInputs(inputs);
  if (normalized.length === 0) return hashSha256("");
  let currentLevel = normalized.map((item) => hashSha256(typeof item === "string" ? item : canonicalJson(item)));
  if (currentLevel.length === 1) return currentLevel[0];
  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(hashSha256(currentLevel[i] + (currentLevel[i + 1] || currentLevel[i])));
    }
    currentLevel = nextLevel;
  }
  return currentLevel[0];
}

/**
 * Authoritative paid-task descriptor. Every execution/price-affecting choice is
 * canonicalized here so the cloud Ticket and native core bind the same task.
 */
export function buildTaskDescriptor({
  pluginId,
  taskType,
  clientTaskId,
  inputs = [],
  itemCount = null,
  selectedFields = [],
  filterState = {},
  maxCount = null,
  accountSource = "default",
  pacePolicyId = "default",
  pricingPolicy = { pointsPerItem: 1 },
  executionOptions = {},
}) {
  if (!pluginId || !taskType || !clientTaskId) {
    throw new Error("Missing required task descriptor parameters (pluginId, taskType, clientTaskId)");
  }
  const normalizedInputs = normalizeTaskInputs(inputs);
  const explicitCount = Number.isInteger(itemCount) && itemCount > 0 ? itemCount : null;
  const normalizedMaxCount = Number.isInteger(maxCount) && maxCount > 0 ? maxCount : null;
  const isUnboundedKol = String(pluginId) === "pgy-kol" && normalizedInputs.length === 0;
  if (isUnboundedKol && !normalizedMaxCount) {
    throw new Error("pgy-kol requires an explicit maxCount before paid authorization");
  }
  const count = explicitCount || normalizedInputs.length || normalizedMaxCount;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("A positive task item count is required");
  }
  if (normalizedMaxCount && count > normalizedMaxCount) {
    throw new Error("Task item count exceeds declared maxCount");
  }

  const sortedFields = Array.isArray(selectedFields)
    ? Array.from(new Set(selectedFields.map((f) => String(f).trim()).filter(Boolean))).sort()
    : [];
  const normalizedFilter = filterState && typeof filterState === "object" && !Array.isArray(filterState)
    ? JSON.parse(canonicalJson(filterState))
    : {};
  const normalizedOptions = executionOptions && typeof executionOptions === "object" && !Array.isArray(executionOptions)
    ? JSON.parse(canonicalJson(executionOptions))
    : {};
  const pointsPerItem = Number(pricingPolicy?.pointsPerItem);
  if (!Number.isFinite(pointsPerItem) || pointsPerItem <= 0) throw new Error("Pricing policy is invalid");

  return {
    pluginId: String(pluginId).trim(),
    taskType: String(taskType).trim(),
    clientTaskId: String(clientTaskId).trim(),
    itemCount: count,
    inputMerkleRoot: computeInputMerkleRoot(normalizedInputs),
    inputCount: normalizedInputs.length,
    selectedFields: sortedFields,
    filterState: normalizedFilter,
    maxCount: normalizedMaxCount,
    accountSource: String(accountSource || "default").trim(),
    pacePolicyId: String(pacePolicyId || "default").trim(),
    executionOptions: normalizedOptions,
    pricingPolicy: { pointsPerItem },
  };
}

export function computeTaskDigest(taskDescriptor) {
  return hashSha256(canonicalJson(taskDescriptor));
}
