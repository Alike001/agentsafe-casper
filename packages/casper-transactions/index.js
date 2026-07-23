import casperSdk from "casper-js-sdk";
import { validateMandate } from "../mandate-engine/index.js";

const { Args, CLValue, ContractCallBuilder, Key, PublicKey } = casperSdk;

export function buildCreateMandateTransaction(mandate, options = {}) {
  const packageHash = normalizePackageHash(options.packageHash || process.env.MANDATE_GUARD_PACKAGE_HASH);
  const validation = validateMandate(mandate, { now: options.now || new Date() });
  if (!validation.valid) {
    const failed = validation.checks.filter((check) => !check.passed).map((check) => check.code);
    throw new TypeError(`Mandate is not contract-ready: ${failed.join(", ")}`);
  }
  if (mandate.allowedServiceIds.length !== 1) {
    throw new TypeError("The current contract transaction supports one initial service; add more services after activation.");
  }

  const runtimeArgs = Args.fromMap({
    mandate_id: CLValue.newCLString(mandate.id),
    agent: CLValue.newCLKey(Key.newKey(mandate.agentAccountHash)),
    agent_id: CLValue.newCLString(mandate.agentId),
    policy_hash: CLValue.newCLString(mandate.policyHash),
    allowed_service_id: CLValue.newCLString(mandate.allowedServiceIds[0]),
    max_amount_per_action: CLValue.newCLUint64(mandate.maxAmountPerActionMotes),
    daily_budget: CLValue.newCLUint64(mandate.dailyBudgetMotes),
    approval_threshold: CLValue.newCLUint64(mandate.approvalThresholdMotes),
    valid_from: CLValue.newCLUint64(new Date(mandate.validFrom).getTime()),
    expires_at: CLValue.newCLUint64(new Date(mandate.expiresAt).getTime())
  });

  const transaction = new ContractCallBuilder()
    .from(PublicKey.fromHex(mandate.ownerPublicKey))
    .byPackageHash(packageHash)
    .entryPoint("create_mandate")
    .runtimeArgs(runtimeArgs)
    .chainName("casper-test")
    .payment(Number(options.paymentMotes || process.env.MANDATE_CALL_PAYMENT_MOTES || 5_000_000_000))
    .build();

  return {
    transaction: transaction.toJSON(),
    signingPublicKey: mandate.ownerPublicKey,
    network: "casper-test",
    contractPackageHash: `hash-${packageHash}`,
    entryPoint: "create_mandate",
    policyHash: mandate.policyHash
  };
}

function normalizePackageHash(value) {
  const hash = String(value || "").replace(/^(hash-|contract-package-)/, "");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError("MANDATE_GUARD_PACKAGE_HASH must be a 64-character Casper package hash.");
  return hash;
}
