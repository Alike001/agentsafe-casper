export const ReasonCode = Object.freeze({
  ALLOWED: "ALLOWED",
  AGENT_REVOKED: "AGENT_REVOKED",
  POLICY_EXPIRED: "POLICY_EXPIRED",
  POLICY_DISABLED: "POLICY_DISABLED",
  SERVICE_NOT_ALLOWED: "SERVICE_NOT_ALLOWED",
  AMOUNT_OVER_LIMIT: "AMOUNT_OVER_LIMIT",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  DUPLICATE_ACTION: "DUPLICATE_ACTION",
  INVALID_SERVICE: "INVALID_SERVICE"
});

export function createDemoState(now = new Date()) {
  return {
    agents: {
      "agent-rwa-001": {
        id: "agent-rwa-001",
        name: "RWA Procurement Agent",
        owner: "casper-test-wallet",
        status: "active",
        metadataHash: "hash-agent-rwa-buyer"
      }
    },
    policies: {
      "agent-rwa-001": {
        agentId: "agent-rwa-001",
        active: true,
        maxAmountPerAction: 25,
        dailyBudget: 50,
        usedBudget: 0,
        approvalThreshold: 20,
        allowedServiceIds: ["svc-rwa-risk"],
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        policyHash: "hash-policy-rwa-25"
      }
    },
    services: {
      "svc-rwa-risk": {
        id: "svc-rwa-risk",
        name: "RWA Risk Report",
        active: true,
        endpointHash: "hash-endpoint-rwa-risk",
        pricingHash: "hash-pricing-10-cspr",
        price: 10
      }
    },
    approvals: {},
    spentByAgent: {},
    seenIdempotencyKeys: new Set(),
    receipts: []
  };
}

export function normalizeAction(action) {
  return {
    agentId: String(action.agentId || ""),
    serviceId: String(action.serviceId || ""),
    actionType: String(action.actionType || "unknown"),
    amount: Number(action.amount || 0),
    idempotencyKey: String(action.idempotencyKey || ""),
    approvalId: action.approvalId ? String(action.approvalId) : null
  };
}

export function evaluatePolicy(state, actionInput, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const action = normalizeAction(actionInput);
  const agent = state.agents[action.agentId];
  const policy = state.policies[action.agentId];
  const service = state.services[action.serviceId];

  if (!agent || agent.status === "revoked") {
    return decision("block", ReasonCode.AGENT_REVOKED, "Agent is missing or revoked.", action);
  }

  if (!policy || policy.active === false) {
    return decision("block", ReasonCode.POLICY_DISABLED, "Policy is missing or disabled.", action);
  }

  if (policy.expiresAt && new Date(policy.expiresAt) < now) {
    return decision("block", ReasonCode.POLICY_EXPIRED, "Policy has expired.", action);
  }

  if (!service || service.active === false) {
    return decision("block", ReasonCode.INVALID_SERVICE, "Service is missing or inactive.", action);
  }

  if (!policy.allowedServiceIds.includes(action.serviceId)) {
    return decision("block", ReasonCode.SERVICE_NOT_ALLOWED, "Service is not in the policy allowlist.", action);
  }

  if (!action.idempotencyKey || state.seenIdempotencyKeys.has(action.idempotencyKey)) {
    return decision("block", ReasonCode.DUPLICATE_ACTION, "Action idempotency key is missing or already used.", action);
  }

  if (action.amount > policy.maxAmountPerAction) {
    return decision("block", ReasonCode.AMOUNT_OVER_LIMIT, "Action amount exceeds per-action limit.", action);
  }

  const spent = Number(state.spentByAgent[action.agentId] || policy.usedBudget || 0);
  if (spent + action.amount > policy.dailyBudget) {
    return decision("block", ReasonCode.BUDGET_EXCEEDED, "Action would exceed daily budget.", action);
  }

  if (action.amount > policy.approvalThreshold && !state.approvals[action.approvalId]) {
    return decision("needs_approval", ReasonCode.APPROVAL_REQUIRED, "Action exceeds approval threshold.", action);
  }

  return decision("allow", ReasonCode.ALLOWED, "Action is within active policy.", action);
}

export function applyAllowedAction(state, actionInput, resultHash = "hash-result-demo") {
  const action = normalizeAction(actionInput);
  const outcome = evaluatePolicy(state, actionInput, { now: new Date().toISOString() });

  if (outcome.verdict !== "allow") {
    return { outcome, receipt: null };
  }

  state.seenIdempotencyKeys.add(action.idempotencyKey);
  state.spentByAgent[action.agentId] = Number(state.spentByAgent[action.agentId] || 0) + action.amount;

  const receipt = {
    id: `rcpt-${String(state.receipts.length + 1).padStart(4, "0")}`,
    agentId: action.agentId,
    serviceId: action.serviceId,
    actionType: action.actionType,
    amount: action.amount,
    policyHash: state.policies[action.agentId].policyHash,
    actionHash: hashLike(`${action.agentId}:${action.serviceId}:${action.amount}:${action.idempotencyKey}`),
    resultHash,
    status: "recorded",
    txHash: `testnet-demo-${Date.now()}-${state.receipts.length + 1}`,
    createdAt: new Date().toISOString()
  };

  state.receipts.unshift(receipt);
  return { outcome, receipt };
}

function decision(verdict, reasonCode, message, action) {
  return { verdict, reasonCode, message, action };
}

export function hashLike(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `hash-${hash.toString(16).padStart(8, "0")}`;
}
