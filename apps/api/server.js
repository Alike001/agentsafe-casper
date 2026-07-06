import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { applyAllowedAction, createDemoState, evaluatePolicy } from "../../packages/policy-engine/index.js";
import { handleMcpRequest } from "../mcp-server/tools.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const webRoot = join(root, "apps/web");
const port = Number(process.env.PORT || 4173);
let state = createDemoState(new Date());
const testnetProof = await loadTestnetProof();
let lastTrace = buildAgentTrace();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

export const server = createServer(async (request, response) => {
  try {
    if (request.url === "/healthz" && request.method === "GET") {
      return sendJson(response, { ok: true, service: "agentpay-casper" });
    }

    if (request.url === "/api/state" && request.method === "GET") {
      return sendJson(response, publicState());
    }

    if (request.url === "/api/rwa-risk-report" && request.method === "GET") {
      return handleRwaRiskReport(request, response);
    }

    if (request.url === "/api/merchant/services" && request.method === "GET") {
      return sendJson(response, merchantServicesCatalog());
    }

    if (request.url === "/api/simulate" && request.method === "POST") {
      const body = await readJson(request);
      return sendJson(response, evaluatePolicy(state, body));
    }

    if (request.url === "/api/run-demo" && request.method === "POST") {
      const body = await readJson(request);
      const action = {
        agentId: "agent-rwa-001",
        serviceId: "svc-rwa-risk",
        actionType: "rwa_report_purchase",
        amount: body.variant === "blocked" ? 100 : 10,
        idempotencyKey: `demo-${body.variant || "allowed"}-${Date.now()}`
      };
      const result = body.variant === "blocked"
        ? { outcome: evaluatePolicy(state, action), receipt: null }
        : applyAllowedAction(state, action, "hash-rwa-report-low-risk");

      if (!result.receipt) {
        state.receipts.unshift(blockedPaymentEvent(action, result.outcome));
      }

      lastTrace = buildAgentTrace(action, result.outcome, result.receipt);
      return sendJson(response, result);
    }

    if (request.url === "/api/reset" && request.method === "POST") {
      state = createDemoState(new Date());
      lastTrace = buildAgentTrace();
      return sendJson(response, { ok: true, state: publicState() });
    }

    if (request.url === "/mcp" && request.method === "POST") {
      const body = await readJson(request);
      return sendJson(response, handleMcpRequest(state, body));
    }

    return serveStatic(request, response);
  } catch (error) {
    return sendJson(response, { error: error.message }, 500);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, () => {
    console.log(`AgentPay Casper running at http://localhost:${port}`);
  });
}

function publicState() {
  return {
    agents: Object.values(state.agents),
    policies: Object.values(state.policies),
    services: Object.values(state.services),
    receipts: [proofReceipt(), ...state.receipts].filter(Boolean),
    spentByAgent: state.spentByAgent,
    agentTrace: lastTrace,
    autonomousRun: buildAutonomousRun(lastTrace),
    x402Flow: x402Flow(),
    merchantApi: merchantApiPreview(),
    merchantServices: merchantServicesCatalog(),
    testnetProof
  };
}

async function loadTestnetProof() {
  try {
    const proofPath = join(root, "proof/testnet-proof.json");
    return JSON.parse(await readFile(proofPath, "utf8"));
  } catch {
    return null;
  }
}

function proofReceipt() {
  if (!testnetProof) return null;
  const receiptTx = testnetProof.transactions.receiptWritten;
  const action = testnetProof.demoAction;
  return {
    id: testnetProof.stateProof.lastReceiptId,
    agentId: action.agentId,
    serviceId: action.serviceId,
    actionType: "rwa_report_purchase",
    amount: Number(action.amount) / 1_000_000_000,
    currency: "CSPR",
    policyHash: action.policyHash,
    actionHash: action.actionHash,
    resultHash: action.resultHash,
    status: "recorded",
    txHash: receiptTx.hash,
    explorerUrl: receiptTx.explorerUrl,
    createdAt: testnetProof.generatedAt
  };
}

export function buildAgentTrace(action = null, outcome = null, receipt = null) {
  const decision = outcome?.reasonCode || "Waiting";
  const verdict = outcome?.verdict || "idle";
  const amount = action?.amount ? `${action.amount} CSPR` : "12.5 CSPR demo receipt";
  const receiptLabel = receipt
    ? receipt.txHash
    : testnetProof?.transactions?.receiptWritten?.hash || "No transaction yet";

  return [
    {
      label: "Buyer agent request",
      value: action ? `Call paid RWA API for ${amount}` : "Call paid RWA Risk Report API",
      status: action ? "complete" : "ready"
    },
    {
      label: "MCP tool call",
      value: "casper_simulate_action",
      status: action ? "complete" : "ready"
    },
    {
      label: "Policy decision",
      value: `${verdict.toUpperCase()} · ${decision}`,
      status: verdict === "block" ? "blocked" : verdict === "allow" ? "complete" : "ready"
    },
    {
      label: "x402 payment route",
      value: "HTTP 402 paid API request gated before signing",
      status: verdict === "block" ? "blocked" : action ? "complete" : "ready"
    },
    {
      label: "Casper proof",
      value: verdict === "block" ? "No transaction signed" : receiptLabel,
      status: verdict === "block" ? "blocked" : receipt ? "complete" : "ready"
    }
  ];
}

export function x402Flow() {
  return [
    {
      label: "1. Buyer agent requests API",
      value: "GET /rwa-risk-report"
    },
    {
      label: "2. Merchant requires payment",
      value: "402 Payment Required · 10 CSPR"
    },
    {
      label: "3. AgentPay checks policy",
      value: "Allowlist, cap, budget, approval, idempotency"
    },
    {
      label: "4. Casper receipt is committed",
      value: "Approved action maps to Casper ReceiptLedger proof"
    }
  ];
}

export function buildAutonomousRun(trace = buildAgentTrace()) {
  const policyStep = trace.find((step) => step.label === "Policy decision") || {};
  const proofStep = trace.find((step) => step.label === "Casper proof") || {};
  const isBlocked = policyStep.status === "blocked";
  const isComplete = policyStep.status === "complete";

  return [
    {
      phase: "Perceive",
      action: "Buyer agent receives task to purchase RWA risk data.",
      tool: "merchant catalog",
      output: "svc-rwa-risk · 10 CSPR",
      status: "complete"
    },
    {
      phase: "Request",
      action: "Agent calls the paid merchant endpoint.",
      tool: "GET /api/rwa-risk-report",
      output: "HTTP 402 Payment Required",
      status: "complete"
    },
    {
      phase: "Decide",
      action: "Agent routes payment intent through policy before spending.",
      tool: "casper_simulate_action",
      output: policyStep.value || "Waiting for policy check",
      status: isBlocked ? "blocked" : isComplete ? "complete" : "ready"
    },
    {
      phase: "Act",
      action: isBlocked ? "Unsafe payment is stopped before signing." : "Approved receipt proof unlocks the paid API.",
      tool: "x-agentpay-receipt",
      output: proofStep.value || "Waiting for receipt proof",
      status: isBlocked ? "blocked" : isComplete ? "complete" : "ready"
    },
    {
      phase: "Record",
      action: isBlocked ? "No Casper transaction is produced for blocked spend." : "Approved purchase maps to Casper ReceiptLedger proof.",
      tool: "Odra ReceiptLedger",
      output: isBlocked ? "No transaction signed" : testnetProof?.transactions?.receiptWritten?.hash || "Waiting for Testnet proof",
      status: isBlocked ? "blocked" : "complete"
    }
  ];
}

export function merchantPaymentChallenge() {
  return {
    error: "PAYMENT_REQUIRED",
    status: 402,
    message: "RWA Risk Report API costs 10 CSPR per request.",
    serviceId: "svc-rwa-risk",
    endpoint: "GET /api/rwa-risk-report",
    amount: 10,
    currency: "CSPR",
    network: "casper-test",
    paymentRail: "x402-style",
    requiredHeader: "x-agentpay-receipt",
    receiptContract: testnetProof?.contracts?.receiptLedger?.packageHash || "ReceiptLedger not loaded",
    policyGateway: "/mcp",
    proofUrl: testnetProof?.transactions?.receiptWritten?.explorerUrl || null
  };
}

export function merchantServicesCatalog() {
  return {
    merchantId: "merchant-rwa-labs",
    merchantName: "RWA Labs",
    network: "casper-test",
    paymentRail: "x402-style",
    policyGateway: "/mcp",
    services: [
      {
        id: "svc-rwa-risk",
        name: "RWA Risk Report API",
        description: "Risk score and eligibility summary for agent-purchased RWA invoice data.",
        endpoint: "GET /api/rwa-risk-report",
        price: 10,
        currency: "CSPR",
        requiredHeader: "x-agentpay-receipt",
        status: "active",
        receiptContract: testnetProof?.contracts?.receiptLedger?.packageHash || "ReceiptLedger not loaded"
      }
    ]
  };
}

function merchantApiPreview() {
  return {
    endpoint: "GET /api/rwa-risk-report",
    status: 402,
    serviceId: "svc-rwa-risk",
    price: "10 CSPR",
    challenge: merchantPaymentChallenge(),
    catalog: "/api/merchant/services"
  };
}

export function handleRwaRiskReport(request, response) {
  const receiptHeader = request.headers["x-agentpay-receipt"];
  const proofHash = testnetProof?.transactions?.receiptWritten?.hash;
  const sessionReceipt = state.receipts.find((receipt) => receipt.status === "recorded");
  const validProof = receiptHeader && (
    receiptHeader === proofHash ||
    receiptHeader === sessionReceipt?.txHash ||
    receiptHeader === "agentpay-demo-approved"
  );

  if (!validProof) {
    response.writeHead(402, {
      "content-type": "application/json; charset=utf-8",
      "x-payment-required": "true",
      "x-payment-amount": "10",
      "x-payment-currency": "CSPR",
      "x-payment-network": "casper-test",
      "x-payment-service": "svc-rwa-risk"
    });
    response.end(JSON.stringify(merchantPaymentChallenge(), null, 2));
    return;
  }

  return sendJson(response, {
    serviceId: "svc-rwa-risk",
    reportId: "rwa-risk-report-demo",
    rating: "LOW_RISK",
    confidence: 0.92,
    paidBy: "RWA Procurement Agent",
    paymentReceipt: receiptHeader,
    receiptProof: testnetProof?.transactions?.receiptWritten?.explorerUrl || null,
    summary: "Demo RWA invoice is eligible for agent purchase under current buyer policy."
  });
}

function blockedPaymentEvent(action, outcome) {
  return {
    id: `blocked-${Date.now()}`,
    agentId: action.agentId,
    serviceId: action.serviceId,
    actionType: action.actionType,
    amount: action.amount,
    policyHash: state.policies[action.agentId]?.policyHash || "unknown-policy",
    actionHash: "blocked-before-payment",
    resultHash: outcome.reasonCode,
    status: "blocked",
    txHash: outcome.reasonCode,
    createdAt: new Date().toISOString()
  };
}

async function serveStatic(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const routeMap = {
    "/": "/index.html",
    "/landing": "/index.html",
    "/dashboard": "/dashboard.html",
    "/console": "/dashboard.html"
  };
  const requestedPath = routeMap[url.pathname] || url.pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(webRoot, safePath);

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
