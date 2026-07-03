import { mkdir, writeFile } from "node:fs/promises";
import { applyAllowedAction, createDemoState, evaluatePolicy } from "../packages/policy-engine/index.js";

const state = createDemoState(new Date());
const allowedAction = {
  agentId: "agent-rwa-001",
  serviceId: "svc-rwa-risk",
  actionType: "rwa_report_purchase",
  amount: 10,
  idempotencyKey: "proof-demo-allowed"
};
const blockedAction = {
  ...allowedAction,
  amount: 100,
  idempotencyKey: "proof-demo-blocked"
};

const allowed = applyAllowedAction(state, allowedAction, "hash-rwa-report-low-risk");
const blocked = evaluatePolicy(state, blockedAction);

const proof = {
  status: "local-demo-proof-not-testnet",
  generatedAt: new Date().toISOString(),
  warning: "This proves local policy and receipt behavior only. Replace with Casper Testnet hashes before submission.",
  allowed,
  blocked
};

await mkdir("proof", { recursive: true });
await writeFile("proof/demo-proof.json", `${JSON.stringify(proof, null, 2)}\n`);
console.log("wrote proof/demo-proof.json");
