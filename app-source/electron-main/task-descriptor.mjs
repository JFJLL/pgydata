import crypto from "crypto";
import { canonicalJson } from "./manifest-crypto.mjs";

export function hashSha256(content) {
  return crypto.createHash("sha256").update(String(content), "utf8").digest("hex");
}

export function computeInputMerkleRoot(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return hashSha256("");
  }
  let currentLevel = inputs.map((item) => hashSha256(typeof item === "string" ? item.trim() : canonicalJson(item)));
  if (currentLevel.length === 1) {
    return currentLevel[0];
  }
  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        nextLevel.push(hashSha256(currentLevel[i] + currentLevel[i + 1]));
      } else {
        nextLevel.push(hashSha256(currentLevel[i] + currentLevel[i]));
      }
    }
    currentLevel = nextLevel;
  }
  return currentLevel[0];
}

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
}) {
  if (!pluginId || !taskType || !clientTaskId) {
    throw new Error("Missing required task descriptor parameters (pluginId, taskType, clientTaskId)");
  }
  const count = Number.isInteger(itemCount) && itemCount > 0
    ? itemCount
    : Array.isArray(inputs) && inputs.length > 0
      ? inputs.length
      : Number.isInteger(maxCount) && maxCount > 0
        ? maxCount
        : 1;

  const sortedFields = Array.isArray(selectedFields)
    ? Array.from(new Set(selectedFields.map((f) => String(f).trim()).filter(Boolean))).sort()
    : [];

  const normalizedFilter = filterState && typeof filterState === "object" && !Array.isArray(filterState)
    ? filterState
    : {};

  const merkleRoot = computeInputMerkleRoot(inputs);

  return {
    pluginId: String(pluginId).trim(),
    taskType: String(taskType).trim(),
    clientTaskId: String(clientTaskId).trim(),
    itemCount: count,
    inputMerkleRoot: merkleRoot,
    selectedFields: sortedFields,
    filterState: normalizedFilter,
    maxCount: Number.isInteger(maxCount) && maxCount > 0 ? maxCount : null,
    accountSource: String(accountSource || "default").trim(),
    pacePolicyId: String(pacePolicyId || "default").trim(),
    pricingPolicy: {
      pointsPerItem: Number(pricingPolicy?.pointsPerItem || 1),
    },
  };
}

export function computeTaskDigest(taskDescriptor) {
  const canonical = canonicalJson(taskDescriptor);
  return hashSha256(canonical);
}

