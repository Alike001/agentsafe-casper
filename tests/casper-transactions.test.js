import assert from "node:assert/strict";
import test from "node:test";
import { buildCreateMandateTransaction } from "../packages/casper-transactions/index.js";
import { createMandateDraft } from "../packages/mandate-engine/index.js";

test("builds an unsigned Casper Testnet MandateGuard transaction from validated policy", () => {
  const now = "2026-07-21T12:00:00.000Z";
  const mandate = createMandateDraft({
    ownerPublicKey: "020390e3201006b059e559fcb2282b277c510259285dcabf2eb6b3f3a77f602ee99d",
    agentAccountHash: "account-hash-3975323bebe4fc7eed16f29262ff7756fb745a00aa3a08f5c36a945bf924b2cb",
    expiresAt: "2026-07-28T12:00:00.000Z"
  }, { now });
  const built = buildCreateMandateTransaction(mandate, {
    now,
    packageHash: "a".repeat(64)
  });

  assert.equal(built.entryPoint, "create_mandate");
  assert.equal(built.signingPublicKey, mandate.ownerPublicKey);
  assert.equal(built.network, "casper-test");
  assert.equal(typeof built.transaction, "object");
  assert.equal(built.transaction.payload.fields.entry_point.Custom, "create_mandate");
  assert.deepEqual(built.transaction.approvals, []);
});
