import test from "node:test";
import assert from "node:assert/strict";
import {
  computeInputMerkleRoot,
  buildTaskDescriptor,
  computeTaskDigest,
  hashSha256,
} from "../../app-source/electron-main/task-descriptor.mjs";

test("computeInputMerkleRoot produces deterministic hash tree", () => {
  const inputs = ["https://pgy.xiaohongshu.com/solar/user1", "https://pgy.xiaohongshu.com/solar/user2"];
  const root1 = computeInputMerkleRoot(inputs);
  const root2 = computeInputMerkleRoot(inputs);
  assert.equal(root1, root2);
  assert.equal(typeof root1, "string");
  assert.equal(root1.length, 64);

  // Changing order changes Merkle root
  const rootReversed = computeInputMerkleRoot([...inputs].reverse());
  assert.notEqual(root1, rootReversed);
});

test("buildTaskDescriptor sorts selectedFields and normalizes itemCount", () => {
  const desc1 = buildTaskDescriptor({
    pluginId: "pgy",
    taskType: "blogger",
    clientTaskId: "task-001",
    inputs: ["u1", "u2"],
    selectedFields: ["fansNum", "avatar", "nickname"],
  });

  assert.deepEqual(desc1.selectedFields, ["avatar", "fansNum", "nickname"]);
  assert.equal(desc1.itemCount, 2);

  const desc2 = buildTaskDescriptor({
    pluginId: "pgy",
    taskType: "blogger",
    clientTaskId: "task-001",
    inputs: ["u1", "u2"],
    selectedFields: ["nickname", "fansNum", "avatar"],
  });

  // Canonical descriptors must have identical taskDigest
  assert.equal(computeTaskDigest(desc1), computeTaskDigest(desc2));
});

test("computeTaskDigest changes whenever task parameters change", () => {
  const base = buildTaskDescriptor({
    pluginId: "pgy",
    taskType: "blogger",
    clientTaskId: "task-001",
    inputs: ["u1", "u2"],
    selectedFields: ["nickname"],
    maxCount: 20,
  });
  const baseDigest = computeTaskDigest(base);

  const diffCount = buildTaskDescriptor({ ...base, maxCount: 50 });
  assert.notEqual(baseDigest, computeTaskDigest(diffCount));

  const diffFields = buildTaskDescriptor({ ...base, selectedFields: ["nickname", "fansNum"] });
  assert.notEqual(baseDigest, computeTaskDigest(diffFields));

  const diffInputs = buildTaskDescriptor({ ...base, inputs: ["u1", "u3"] });
  assert.notEqual(baseDigest, computeTaskDigest(diffInputs));

  const diffTaskType = buildTaskDescriptor({ ...base, taskType: "note" });
  assert.notEqual(baseDigest, computeTaskDigest(diffTaskType));
});

