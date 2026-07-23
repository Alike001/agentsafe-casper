import { createHash } from "node:crypto";

export const CSPR_MOTES = 1_000_000_000n;
export const CASPER_TESTNET_CAIP2 = "casper:casper-test";

export const MandateStatus = Object.freeze({
  DRAFT: "draft",
  PENDING: "pending",
  ACTIVE: "active",
  EXHAUSTED: "exhausted",
  EXPIRED: "expired",
  REVOKED: "revoked"
});

export const MandateReasonCode = Object.freeze({
  ALLOWED: "ALLOWED",
  MANDATE_INVALID: "MANDATE_INVALID",
  MANDATE_DISABLED: "MANDATE_DISABLED",
  MANDATE_EXPIRED: "MANDATE_EXPIRED",
  MANDATE_NOT_ACTIVE: "MANDATE_NOT_ACTIVE",
  SERVICE_NOT_ALLOWED: "SERVICE_NOT_ALLOWED",
  AMOUNT_OVER_LIMIT: "AMOUNT_OVER_LIMIT",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  DUPLICATE_ACTION: "DUPLICATE_ACTION"
});

export function createMandateDraft(input = {}, options = {}) {
  const now = asDate(options.now || new Date());
  const expiresAt = input.expiresAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const mandate = {
    id: String(input.id || "mandate-rwa-procurement"),
    name: String(input.name || "RWA data procurement"),
    ownerPublicKey: String(input.ownerPublicKey || "wallet-not-connected"),
    agentId: String(input.agentId || "agent-rwa-001"),
    agentName: String(input.agentName || "RWA Procurement Agent"),
    agentAccountHash: String(input.agentAccountHash || "agent-account-not-set"),
    network: String(input.network || CASPER_TESTNET_CAIP2),
    currency: String(input.currency || "WCSPR"),
    allowedServiceIds: uniqueSorted(input.allowedServiceIds || ["svc-rwa-risk"]),
    maxAmountPerActionMotes: toBaseUnits(input.maxAmountPerActionMotes ?? 25n * CSPR_MOTES),
    dailyBudgetMotes: toBaseUnits(input.dailyBudgetMotes ?? 50n * CSPR_MOTES),
    approvalThresholdMotes: toBaseUnits(input.approvalThresholdMotes ?? 20n * CSPR_MOTES),
    spentTodayMotes: toBaseUnits(input.spentTodayMotes ?? 0),
    validFrom: String(input.validFrom || now.toISOString()),
    expiresAt: String(expiresAt),
    status: String(input.status || MandateStatus.DRAFT),
    intent: String(input.intent || "Allow the RWA Procurement Agent to buy approved risk reports within a daily budget."),
    createdAt: String(input.createdAt || now.toISOString()),
    updatedAt: String(input.updatedAt || now.toISOString())
  };

  return { ...mandate, policyHash: policyHash(mandate) };
}

export function canonicalPolicy(mandate) {
  return {
    agentId: String(mandate.agentId),
    agentAccountHash: String(mandate.agentAccountHash),
    allowedServiceIds: uniqueSorted(mandate.allowedServiceIds),
    approvalThresholdMotes: toBaseUnits(mandate.approvalThresholdMotes),
    currency: String(mandate.currency),
    dailyBudgetMotes: toBaseUnits(mandate.dailyBudgetMotes),
    expiresAt: String(mandate.expiresAt),
    maxAmountPerActionMotes: toBaseUnits(mandate.maxAmountPerActionMotes),
    network: String(mandate.network),
    ownerPublicKey: String(mandate.ownerPublicKey),
    validFrom: String(mandate.validFrom)
  };
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function policyHash(mandate) {
  return `sha256:${createHash("sha256").update(canonicalJson(canonicalPolicy(mandate))).digest("hex")}`;
}

export function validateMandate(mandate, options = {}) {
  const now = asDate(options.now || new Date());
  const checks = [
    check("OWNER_PRESENT", mandate.ownerPublicKey && mandate.ownerPublicKey !== "wallet-not-connected", "A connected wallet must own the mandate."),
    check("AGENT_PRESENT", Boolean(mandate.agentId), "An agent identifier is required."),
    check("AGENT_ACCOUNT_PRESENT", /^account-hash-[a-f0-9]{64}$/.test(mandate.agentAccountHash), "A Casper account hash is required for delegated agent authority."),
    check("SERVICE_ALLOWLIST", Array.isArray(mandate.allowedServiceIds) && mandate.allowedServiceIds.length > 0, "At least one service must be allowed."),
    check("CASPER_TESTNET", mandate.network === CASPER_TESTNET_CAIP2, "The final-round mandate must target Casper Testnet."),
    check("WCSPR_ASSET", mandate.currency === "WCSPR", "Casper x402 currently settles a CEP-18 asset such as WCSPR."),
    check("ACTION_LIMIT_POSITIVE", toBigInt(mandate.maxAmountPerActionMotes) > 0n, "Per-action limit must be greater than zero."),
    check("BUDGET_COVERS_ACTION", toBigInt(mandate.dailyBudgetMotes) >= toBigInt(mandate.maxAmountPerActionMotes), "Daily budget must cover at least one maximum-size action."),
    check("APPROVAL_WITHIN_LIMIT", toBigInt(mandate.approvalThresholdMotes) <= toBigInt(mandate.maxAmountPerActionMotes), "Approval threshold cannot exceed the action limit."),
    check("VALID_TIME_WINDOW", asDate(mandate.validFrom) < asDate(mandate.expiresAt) && asDate(mandate.expiresAt) > now, "Mandate expiry must be after its start and in the future."),
    check("POLICY_HASH_MATCH", mandate.policyHash === policyHash(mandate), "Policy hash must match the canonical mandate.")
  ];

  return { valid: checks.every((item) => item.passed), checks };
}

export function evaluateMandate(mandate, actionInput, context = {}) {
  const now = asDate(context.now || new Date());
  const action = normalizeMandateAction(actionInput);
  const seenKeys = context.seenIdempotencyKeys || new Set();
  const validation = validateMandate(mandate, { now });

  if (!validation.valid) {
    return mandateDecision("block", MandateReasonCode.MANDATE_INVALID, "Mandate failed deterministic validation.", action, validation.checks);
  }
  if (mandate.status === MandateStatus.REVOKED || mandate.status === MandateStatus.EXHAUSTED) {
    return mandateDecision("block", MandateReasonCode.MANDATE_DISABLED, "Mandate is revoked or exhausted.", action);
  }
  if (mandate.status !== MandateStatus.ACTIVE) {
    return mandateDecision("block", MandateReasonCode.MANDATE_NOT_ACTIVE, "Mandate has not been activated by its owner wallet.", action);
  }
  if (asDate(mandate.expiresAt) <= now) {
    return mandateDecision("block", MandateReasonCode.MANDATE_EXPIRED, "Mandate has expired.", action);
  }
  if (!mandate.allowedServiceIds.includes(action.serviceId)) {
    return mandateDecision("block", MandateReasonCode.SERVICE_NOT_ALLOWED, "Service is not included in this mandate.", action);
  }
  if (!action.idempotencyKey || seenKeys.has(action.idempotencyKey)) {
    return mandateDecision("block", MandateReasonCode.DUPLICATE_ACTION, "Action key is missing or has already been consumed.", action);
  }
  if (toBigInt(action.amountMotes) > toBigInt(mandate.maxAmountPerActionMotes)) {
    return mandateDecision("block", MandateReasonCode.AMOUNT_OVER_LIMIT, "Action exceeds the mandate's per-request limit.", action);
  }
  if (toBigInt(mandate.spentTodayMotes) + toBigInt(action.amountMotes) > toBigInt(mandate.dailyBudgetMotes)) {
    return mandateDecision("block", MandateReasonCode.BUDGET_EXCEEDED, "Action would exceed the mandate's daily budget.", action);
  }
  if (toBigInt(action.amountMotes) > toBigInt(mandate.approvalThresholdMotes) && !action.approvalId) {
    return mandateDecision("needs_approval", MandateReasonCode.APPROVAL_REQUIRED, "Action requires an additional wallet approval.", action);
  }
  return mandateDecision("allow", MandateReasonCode.ALLOWED, "Action is inside the active mandate.", action);
}

export function consumeMandate(mandate, actionInput, context = {}) {
  const outcome = evaluateMandate(mandate, actionInput, context);
  if (outcome.verdict !== "allow") return { mandate, outcome };

  const spent = toBigInt(mandate.spentTodayMotes) + toBigInt(outcome.action.amountMotes);
  const exhausted = spent >= toBigInt(mandate.dailyBudgetMotes);
  const updated = {
    ...mandate,
    spentTodayMotes: spent.toString(),
    status: exhausted ? MandateStatus.EXHAUSTED : mandate.status,
    updatedAt: asDate(context.now || new Date()).toISOString()
  };
  context.seenIdempotencyKeys?.add(outcome.action.idempotencyKey);
  return { mandate: updated, outcome };
}

export function activateMandate(mandate, ownerPublicKey, options = {}) {
  const updated = createMandateDraft({
    ...mandate,
    ownerPublicKey,
    status: MandateStatus.ACTIVE,
    updatedAt: asDate(options.now || new Date()).toISOString()
  }, options);
  return { ...updated, policyHash: policyHash(updated) };
}

export function revokeMandate(mandate, options = {}) {
  return {
    ...mandate,
    status: MandateStatus.REVOKED,
    updatedAt: asDate(options.now || new Date()).toISOString()
  };
}

export function normalizeMandateAction(action = {}) {
  return {
    agentId: String(action.agentId || ""),
    serviceId: String(action.serviceId || ""),
    actionType: String(action.actionType || "paid_service_call"),
    amountMotes: toBaseUnits(action.amountMotes ?? 0),
    idempotencyKey: String(action.idempotencyKey || ""),
    approvalId: action.approvalId ? String(action.approvalId) : null
  };
}

export function formatCSPR(motes) {
  const value = toBigInt(motes);
  const whole = value / CSPR_MOTES;
  const fraction = (value % CSPR_MOTES).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} CSPR` : `${whole} CSPR`;
}

function mandateDecision(verdict, reasonCode, message, action, checks = []) {
  return { verdict, reasonCode, message, action, checks };
}

function check(code, passed, message) {
  return { code, passed: Boolean(passed), message };
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))].sort();
}

function toBaseUnits(value) {
  const amount = toBigInt(value);
  if (amount < 0n) throw new TypeError("Amount cannot be negative.");
  return amount.toString();
}

function toBigInt(value) {
  try {
    return BigInt(value);
  } catch {
    throw new TypeError(`Invalid base-unit amount: ${value}`);
  }
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date: ${value}`);
  return date;
}
