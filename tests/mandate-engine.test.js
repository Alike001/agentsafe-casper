import assert from "node:assert/strict";
import test from "node:test";
import {
  activateMandate,
  canonicalJson,
  consumeMandate,
  createMandateDraft,
  CSPR_MOTES,
  evaluateMandate,
  MandateReasonCode,
  MandateStatus,
  policyHash,
  validateMandate
} from "../packages/mandate-engine/index.js";

const NOW = "2026-07-21T12:00:00.000Z";
const OWNER = "020390e3201006b059e559fcb2282b277c510259285dcabf2eb6b3f3a77f602ee99d";
const AGENT_ACCOUNT = "account-hash-3975323bebe4fc7eed16f29262ff7756fb745a00aa3a08f5c36a945bf924b2cb";

test("canonical JSON and policy hash are stable across key order", () => {
  assert.equal(canonicalJson({ z: 1, a: [2, 3] }), '{"a":[2,3],"z":1}');
  const first = activeMandate();
  const second = { ...first, allowedServiceIds: [...first.allowedServiceIds].reverse() };
  assert.equal(policyHash(first), policyHash(second));
  assert.match(first.policyHash, /^sha256:[a-f0-9]{64}$/);
});

test("wallet-owned Casper Testnet mandate passes deterministic validation", () => {
  const validation = validateMandate(activeMandate(), { now: NOW });
  assert.equal(validation.valid, true);
  assert.equal(validation.checks.every((check) => check.passed), true);
});

test("draft without a connected wallet cannot be activated implicitly", () => {
  const draft = createMandateDraft({}, { now: NOW });
  const validation = validateMandate(draft, { now: NOW });
  assert.equal(validation.valid, false);
  assert.equal(validation.checks.find((check) => check.code === "OWNER_PRESENT").passed, false);
});

test("allows and consumes an in-mandate paid service action", () => {
  const seen = new Set();
  const action = paidAction({ idempotencyKey: "run-1" });
  const result = consumeMandate(activeMandate(), action, { now: NOW, seenIdempotencyKeys: seen });
  assert.equal(result.outcome.reasonCode, MandateReasonCode.ALLOWED);
  assert.equal(result.mandate.spentTodayMotes, (10n * CSPR_MOTES).toString());
  assert.equal(seen.has("run-1"), true);
});

test("blocks service, amount, budget, duplicate, and revoked violations deterministically", () => {
  const mandate = activeMandate();
  assert.equal(evaluateMandate(mandate, paidAction({ serviceId: "svc-unknown" }), { now: NOW }).reasonCode, MandateReasonCode.SERVICE_NOT_ALLOWED);
  assert.equal(evaluateMandate(mandate, paidAction({ amountMotes: 100n * CSPR_MOTES }), { now: NOW }).reasonCode, MandateReasonCode.AMOUNT_OVER_LIMIT);
  assert.equal(evaluateMandate({ ...mandate, spentTodayMotes: (45n * CSPR_MOTES).toString() }, paidAction(), { now: NOW }).reasonCode, MandateReasonCode.BUDGET_EXCEEDED);
  assert.equal(evaluateMandate(mandate, paidAction({ idempotencyKey: "seen" }), { now: NOW, seenIdempotencyKeys: new Set(["seen"]) }).reasonCode, MandateReasonCode.DUPLICATE_ACTION);
  assert.equal(evaluateMandate({ ...mandate, status: MandateStatus.REVOKED }, paidAction(), { now: NOW }).reasonCode, MandateReasonCode.MANDATE_DISABLED);
});

test("requires explicit approval above the configured threshold", () => {
  const mandate = activeMandate();
  const action = paidAction({ amountMotes: 22n * CSPR_MOTES });
  assert.equal(evaluateMandate(mandate, action, { now: NOW }).reasonCode, MandateReasonCode.APPROVAL_REQUIRED);
  assert.equal(evaluateMandate(mandate, { ...action, approvalId: "wallet-approval-1" }, { now: NOW }).reasonCode, MandateReasonCode.ALLOWED);
});

function activeMandate() {
  const draft = createMandateDraft({
    expiresAt: "2026-07-28T12:00:00.000Z",
    agentAccountHash: AGENT_ACCOUNT,
    allowedServiceIds: ["svc-rwa-risk", "svc-rwa-risk"]
  }, { now: NOW });
  return activateMandate(draft, OWNER, { now: NOW });
}

function paidAction(overrides = {}) {
  return {
    agentId: "agent-rwa-001",
    serviceId: "svc-rwa-risk",
    actionType: "rwa_report_purchase",
    amountMotes: 10n * CSPR_MOTES,
    idempotencyKey: "action-1",
    ...overrides
  };
}
