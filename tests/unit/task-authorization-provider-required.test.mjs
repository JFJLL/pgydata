import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationGate } from "../../app-source/electron-main/authorization-gate.mjs";
import { TaskAuthorizationProvider } from "../../app-source/electron-main/task-authorization-provider.mjs";
import { computeTaskDigest } from "../../app-source/electron-main/task-descriptor.mjs";

function makeGate() {
  const deviceKeyManager = {
    initialized: true,
    getDeviceKeyId: () => "device-1",
    getPublicKeyPem: () => "test-public-key",
  };
  const gate = new AuthorizationGate({ deviceKeyManager, apiClient: null, authMode: "required", logger: {} });
  const state = { registered: 0, acquired: 0, started: 0, cancelled: 0, requested: 0 };
  gate.registerNativeDeviceIdentity = async ({ identity }) => {
    state.registered += 1;
    assert.equal(identity.deviceKeyId, "device-1");
    assert.equal(Buffer.from(identity.encryptionPublicKeyB64, "base64").length, 32);
    assert.equal(typeof identity.signingPublicKey, "string");
  };
  gate.acquireTaskAuthorization = async ({ nativeTicketRequired, deferStart, clientTaskId, taskType, requestedItems }) => {
    state.acquired += 1;
    assert.equal(nativeTicketRequired, true);
    assert.equal(deferStart, true);
    return {
      authorized: true,
      authorizationId: "auth-1",
      ticketJti: "ticket-jti-1",
      deviceKeyId: "device-1",
      ticket: { jti: "ticket-jti-1" },
      ticketSignature: "a".repeat(128),
      ticketKeyId: "ticket-key-1",
      policyVersion: "1.0",
      taskType,
      requestedItems,
      mode: "required",
    };
  };
  gate.requestStrategyBundle = async (expected) => {
    state.requested += 1;
    return { authorizationId: expected.authorizationId, encryptedBundle: "opaque" };
  };
  gate.startTaskAuthorization = async (authorizationId) => {
    state.started += 1;
    assert.equal(authorizationId, "auth-1");
  };
  gate.cancelTask = async ({ clientTaskId, reason }) => {
    state.cancelled += 1;
    assert.equal(clientTaskId, "task-1");
    assert.equal(reason, "native-required-authorization-or-strategy-rejected");
  };
  return { gate, state };
}

function makeNativeClient({ rejectStrategy = false } = {}) {
  return {
    async request(command, payload) {
      if (command === "task.digest") return { taskDigest: computeTaskDigest(payload) };
      if (command === "device.ensure") {
        return {
          deviceKeyId: "device-1",
          signingPublicKey: Buffer.alloc(32, 3).toString("base64"),
          encryptionAlgorithm: "HPKE-X25519-HKDF-SHA256-AES-256-GCM",
          encryptionPublicKeyB64: Buffer.alloc(32, 7).toString("base64"),
        };
      }
      if (command === "ticket.verify") {
        assert.equal(payload.expected.deviceKeyId, "device-1");
        assert.equal(payload.expected.clientTaskId, "task-1");
        return { handle: "native-handle-1", authorization_id: "auth-1" };
      }
      if (command === "receipt.begin") {
        assert.deepEqual(Object.keys(payload).sort(), ["authorizationHandle"]);
        assert.equal(payload.authorizationHandle.handle, "native-handle-1");
        return { started: true };
      }
      if (command === "strategy.decrypt") {
        if (rejectStrategy) throw new Error("strategy signature mismatch");
        assert.equal(payload.expected.authorizationId, "auth-1");
        assert.deepEqual(Object.keys(payload).sort(), ["bundle", "expected"]);
        return {
          authorizationId: "auth-1",
          taskDigest: payload.expected.taskDigest,
          taskType: payload.expected.taskType,
          maxItems: 2,
        };
      }
      throw new Error(`unexpected native command: ${command}`);
    },
  };
}

test("required mode obtains native Ticket and strategy decisions before cloud start", async () => {
  const { gate, state } = makeGate();
  const provider = new TaskAuthorizationProvider({
    authorizationGate: gate,
    getCurrentUser: async () => ({ id: 7 }),
    nativeCoreClient: makeNativeClient(),
    authMode: "required",
  });

  const result = await provider.authorizeTask({
    clientTaskId: "task-1",
    pluginId: "pgy-kol",
    taskType: "pgy-kol.search",
    inputs: [{ id: "a" }, { id: "b" }],
    requestedItems: 2,
  });

  assert.equal(result.authorizationId, "auth-1");
  assert.equal(result.nativeAuthorizationHandle, "native-handle-1");
  assert.equal(state.registered, 1);
  assert.equal(state.acquired, 1);
  assert.equal(state.requested, 1);
  assert.equal(state.started, 1);
  assert.equal(state.cancelled, 0);
});

test("required mode cancels the pending authorization when native strategy validation rejects", async () => {
  const { gate, state } = makeGate();
  const provider = new TaskAuthorizationProvider({
    authorizationGate: gate,
    getCurrentUser: async () => ({ id: 7 }),
    nativeCoreClient: makeNativeClient({ rejectStrategy: true }),
    authMode: "required",
  });

  await assert.rejects(
    provider.authorizeTask({
      clientTaskId: "task-1",
      pluginId: "pgy-kol",
      taskType: "pgy-kol.search",
      inputs: [{ id: "a" }, { id: "b" }],
      requestedItems: 2,
    }),
    /Native required authorization rejected/,
  );
  assert.equal(state.started, 0);
  assert.equal(state.cancelled, 1);
});
