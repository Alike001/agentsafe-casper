import assert from "node:assert/strict";
import test from "node:test";
import { compileMandateIntent, csprToMotes } from "../packages/ai-policy-compiler/index.js";

const OWNER = "020390e3201006b059e559fcb2282b277c510259285dcabf2eb6b3f3a77f602ee99d";
const AGENT_ACCOUNT = "account-hash-3975323bebe4fc7eed16f29262ff7756fb745a00aa3a08f5c36a945bf924b2cb";

test("converts decimal WCSPR values to exact base units", () => {
  assert.equal(csprToMotes("10"), "10000000000");
  assert.equal(csprToMotes("0.000000001"), "1");
  assert.throws(() => csprToMotes("0.0000000001"));
});

test("AI compilation remains a draft until deterministic validation and wallet approval", async () => {
  const client = {
    responses: {
      async create() {
        return {
          id: "resp-test",
          model: "test-model",
          output_text: JSON.stringify({
            name: "RWA report purchasing",
            agentName: "RWA Procurement Agent",
            agentId: "agent-rwa-001",
            allowedServiceIds: ["svc-rwa-risk"],
            maxAmountPerActionCSPR: 10,
            dailyBudgetCSPR: 50,
            approvalThresholdCSPR: 10,
            durationHours: 168,
            explanation: "Allows one approved risk-report service within bounded limits.",
            assumptions: []
          })
        };
      }
    }
  };

  const result = await compileMandateIntent({
    intent: "Allow my procurement agent to buy approved RWA risk reports for one week.",
    ownerPublicKey: OWNER,
    agentAccountHash: AGENT_ACCOUNT
  }, { client, now: "2026-07-21T12:00:00.000Z" });

  assert.equal(result.validation.valid, true);
  assert.equal(result.mandate.status, "draft");
  assert.equal(result.provenance.authority, "draft_only");
  assert.equal(result.mandate.agentAccountHash, AGENT_ACCOUNT);
});
