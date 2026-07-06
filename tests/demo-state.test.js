import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentTrace,
  handleRwaRiskReport,
  merchantPaymentChallenge,
  merchantServicesCatalog,
  x402Flow
} from "../apps/api/server.js";

test("builds a visible allowed agent trace", () => {
  const trace = buildAgentTrace(
    { amount: 10 },
    { verdict: "allow", reasonCode: "ALLOWED" },
    { txHash: "testnet-demo-transaction" }
  );

  assert.equal(trace.some((step) => step.label === "MCP tool call"), true);
  assert.equal(trace.find((step) => step.label === "Policy decision").status, "complete");
  assert.equal(trace.find((step) => step.label === "Casper proof").value, "testnet-demo-transaction");
});

test("builds a blocked trace without transaction proof", () => {
  const trace = buildAgentTrace(
    { amount: 100 },
    { verdict: "block", reasonCode: "AMOUNT_OVER_LIMIT" },
    null
  );

  assert.equal(trace.find((step) => step.label === "Policy decision").status, "blocked");
  assert.equal(trace.find((step) => step.label === "Casper proof").value, "No transaction signed");
});

test("documents the x402-style paid API flow", () => {
  const flow = x402Flow();

  assert.equal(flow.length, 4);
  assert.equal(flow.some((step) => step.value.includes("402 Payment Required")), true);
  assert.equal(flow.some((step) => step.label.includes("Merchant")), true);
});

test("builds a merchant payment challenge for the paid RWA API", () => {
  const challenge = merchantPaymentChallenge();

  assert.equal(challenge.status, 402);
  assert.equal(challenge.serviceId, "svc-rwa-risk");
  assert.equal(challenge.amount, 10);
  assert.equal(challenge.currency, "CSPR");
  assert.equal(challenge.requiredHeader, "x-agentpay-receipt");
});

test("exposes a merchant services catalog", () => {
  const catalog = merchantServicesCatalog();

  assert.equal(catalog.merchantId, "merchant-rwa-labs");
  assert.equal(catalog.services.length, 1);
  assert.equal(catalog.services[0].endpoint, "GET /api/rwa-risk-report");
  assert.equal(catalog.services[0].price, 10);
  assert.equal(catalog.services[0].currency, "CSPR");
});

test("merchant RWA API returns HTTP 402 until receipt proof is supplied", async () => {
  const challengeResponse = createMockResponse();
  handleRwaRiskReport({ headers: {} }, challengeResponse);
  const challenge = JSON.parse(challengeResponse.body);
  assert.equal(challengeResponse.status, 402);
  assert.equal(challenge.error, "PAYMENT_REQUIRED");
  assert.equal(challenge.serviceId, "svc-rwa-risk");

  const paidResponse = createMockResponse();
  handleRwaRiskReport({ headers: { "x-agentpay-receipt": "agentpay-demo-approved" } }, paidResponse);
  const report = JSON.parse(paidResponse.body);
  assert.equal(paidResponse.status, 200);
  assert.equal(report.rating, "LOW_RISK");
});

function createMockResponse() {
  return {
    status: 200,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };
}
