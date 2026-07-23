import { existsSync } from "node:fs";
import { join } from "node:path";

export function loadLocalEnvironment(workspaceRoot) {
  for (const filename of [".env.local", ".env"]) {
    const path = join(workspaceRoot, filename);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

export function integrationStatus(env = process.env) {
  const x402Fields = [
    "X402_FACILITATOR_URL",
    "X402_PAYEE_ADDRESS",
    "X402_ASSET_PACKAGE",
    "X402_ASSET_NAME"
  ];

  return {
    openai: capability(Boolean(env.OPENAI_API_KEY), "OpenAI Responses API", env.OPENAI_MODEL || "gpt-5-mini"),
    wallet: capability(Boolean(env.CSPR_CLICK_APP_ID), "CSPR.click", env.CSPR_CLICK_APP_ID ? "Casper Testnet" : "App ID required"),
    x402: capability(x402Fields.every((name) => Boolean(env[name])), "Casper x402", "CEP-18 exact settlement"),
    indexing: capability(Boolean(env.CSPR_CLOUD_API_KEY), "CSPR.cloud", env.CSPR_CLOUD_API_KEY ? "REST API" : "API key required"),
    mandateContract: capability(Boolean(env.MANDATE_GUARD_PACKAGE_HASH), "Odra MandateGuard", env.MANDATE_GUARD_PACKAGE_HASH || "Deployment required"),
    receiptContract: capability(Boolean(env.RECEIPT_LEDGER_PACKAGE_HASH), "Odra ReceiptLedger", env.RECEIPT_LEDGER_PACKAGE_HASH || "Historical proof loaded")
  };
}

export function publicRuntimeConfig(env = process.env) {
  return {
    network: "casper-test",
    caip2Network: "casper:casper-test",
    csprClickAppId: env.CSPR_CLICK_APP_ID || null,
    mandateGuardPackageHash: env.MANDATE_GUARD_PACKAGE_HASH || null,
    receiptLedgerPackageHash: env.RECEIPT_LEDGER_PACKAGE_HASH || null,
    integrations: integrationStatus(env)
  };
}

function capability(configured, name, detail) {
  return {
    name,
    state: configured ? "configured" : "unconfigured",
    configured,
    detail
  };
}
