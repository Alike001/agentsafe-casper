import assert from "node:assert/strict";
import test from "node:test";
import { CASPER_X402_NETWORK, casperX402Config, createCasperX402Middleware } from "../packages/casper-x402/index.js";

test("Casper x402 stays explicitly unavailable until every settlement field exists", () => {
  const result = createCasperX402Middleware({});
  assert.equal(result.configured, false);
  assert.equal(result.middleware, null);
  assert.equal(result.config.network, CASPER_X402_NETWORK);
});

test("Casper x402 config uses CEP-18 base units and CAIP-2 Testnet", () => {
  const config = casperX402Config({
    X402_FACILITATOR_URL: "https://facilitator.example",
    X402_PAYEE_ADDRESS: `00${"a".repeat(64)}`,
    X402_ASSET_PACKAGE: "b".repeat(64),
    X402_ASSET_NAME: "Wrapped CSPR"
  });
  assert.equal(config.configured, true);
  assert.equal(config.network, "casper:casper-test");
  assert.equal(config.amount, "10000000000");
});
