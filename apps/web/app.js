const stateUrl = "/api/state";

const elements = {
  cap: document.querySelector("#cap"),
  budget: document.querySelector("#budget"),
  spent: document.querySelector("#spent"),
  rules: document.querySelector("#rules"),
  timeline: document.querySelector("#timeline"),
  checkoutCards: document.querySelector("#checkout-card-list"),
  testnetProof: document.querySelector("#testnet-proof"),
  agentTrace: document.querySelector("#agent-trace-list"),
  x402List: document.querySelector("#x402-list"),
  merchantStatus: document.querySelector("#merchant-status"),
  merchantChallenge: document.querySelector("#merchant-challenge"),
  merchantIntegration: document.querySelector("#merchant-integration-list"),
  autonomousRun: document.querySelector("#autonomous-run-list"),
  lastReason: document.querySelector("#last-reason"),
  runAllowed: document.querySelector("#run-allowed"),
  runBlocked: document.querySelector("#run-blocked"),
  resetDemo: document.querySelector("#reset-demo"),
  navLinks: document.querySelectorAll("[data-nav-link]")
};

elements.runAllowed.addEventListener("click", () => runDemo("allowed"));
elements.runBlocked.addEventListener("click", () => runDemo("blocked"));
elements.resetDemo.addEventListener("click", resetDemo);
elements.navLinks.forEach((link) => {
  link.addEventListener("click", () => setActiveNav(link));
});

await refresh();

async function refresh() {
  const state = await getJson(stateUrl);
  const policy = state.policies[0];
  const spent = state.spentByAgent[policy.agentId] || 0;

  elements.cap.textContent = `${policy.maxAmountPerAction} CSPR`;
  elements.budget.textContent = `${policy.dailyBudget} CSPR`;
  elements.spent.textContent = `${spent} CSPR`;

  elements.rules.innerHTML = [
    `Allowed service: ${policy.allowedServiceIds.join(", ")}`,
    `Approval threshold: ${policy.approvalThreshold} CSPR`,
    `Policy hash: ${policy.policyHash}`,
    `Expires: ${new Date(policy.expiresAt).toLocaleDateString()}`
  ].map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");

  renderTimeline(state.receipts);
  renderCheckoutCards(state);
  renderProof(state.testnetProof);
  renderAgentTrace(state.agentTrace);
  renderAutonomousRun(state.autonomousRun);
  renderX402Flow(state.x402Flow);
  await renderMerchantChallenge();
  await renderMerchantIntegration();
}

async function runDemo(variant) {
  setReason("Running", "neutral");
  const result = await postJson("/api/run-demo", { variant });
  const outcome = result.outcome;
  const status = outcome.verdict === "allow" ? "success" : "destructive";
  setReason(outcome.reasonCode, status);

  await refresh();
}

async function resetDemo() {
  setReason("Resetting", "neutral");
  await postJson("/api/reset", {});
  setReason("Waiting", "neutral");
  await refresh();
}

function renderTimeline(receipts) {
  if (receipts.length === 0) {
    elements.timeline.innerHTML = `<div class="timeline-item"><strong>No purchases yet</strong><span>Run the allowed API payment to create an AgentPay receipt.</span></div>`;
    return;
  }
  elements.timeline.innerHTML = receipts.map(renderTimelineItem).join("");
}

function renderTimelineItem(item) {
  const title = item.status === "blocked" ? "Payment blocked before signing" : "API purchase recorded";
  const amount = item.currency ? `${item.amount} ${item.currency}` : `${item.amount} CSPR`;
  const proofLink = item.explorerUrl
    ? `<a href="${escapeAttribute(item.explorerUrl)}" target="_blank" rel="noreferrer">View on CSPR.live</a>`
    : "";
  return `
    <div class="timeline-item">
      <strong>${escapeHtml(title)} <span>${escapeHtml(amount)}</span></strong>
      <span>${escapeHtml(item.actionType)} · ${escapeHtml(new Date(item.createdAt).toLocaleTimeString())}</span>
      <code>${escapeHtml(item.txHash)}</code>
      ${proofLink}
    </div>
  `;
}

function renderCheckoutCards(state) {
  const lastEvent = state.receipts[0] || {};
  const decisionStep = state.agentTrace.find((step) => step.label === "Policy decision") || {};
  const proofStep = state.agentTrace.find((step) => step.label === "Casper proof") || {};
  const isBlocked = lastEvent.status === "blocked" || decisionStep.status === "blocked";
  const isComplete = decisionStep.status === "complete";
  const decisionStatus = isBlocked ? "destructive" : isComplete ? "success" : "neutral";
  const decisionTitle = isBlocked || isComplete ? decisionStep.value : "Ready for policy check";
  const decisionReason = isBlocked || isComplete ? decisionStep.value : "Waiting for agent action";
  const receiptValue = isBlocked ? "No transaction signed" : proofStep.value || "Waiting for proof";

  const cards = [
    {
      kind: "payment",
      eyebrow: "HTTP payment request",
      title: "402 Payment Required",
      status: "10 CSPR",
      rows: [
        ["Endpoint", "GET /rwa-risk-report"],
        ["Merchant", "RWA Risk Report API"],
        ["Buyer", "RWA Procurement Agent"]
      ]
    },
    {
      kind: decisionStatus,
      eyebrow: "Policy decision",
      title: decisionTitle,
      status: isBlocked ? "Blocked" : isComplete ? "Allowed" : "Ready",
      rows: [
        ["Per-request cap", elements.cap.textContent],
        ["Daily budget", elements.budget.textContent],
        ["Reason", decisionReason]
      ]
    },
    {
      kind: isBlocked ? "destructive" : "proof",
      eyebrow: "Casper receipt",
      title: isBlocked ? "Stopped before signing" : "Receipt proof",
      status: isBlocked ? "No tx" : "Testnet",
      rows: [
        ["Receipt", receiptValue],
        ["Ledger", "Odra ReceiptLedger"],
        ["Network", state.testnetProof?.network || "casper-test"]
      ]
    }
  ];

  elements.checkoutCards.innerHTML = cards.map(renderCheckoutCard).join("");
}

function renderCheckoutCard(card) {
  return `
    <div class="checkout-card ${escapeAttribute(card.kind)}">
      <div class="checkout-card-header">
        <span>${escapeHtml(card.eyebrow)}</span>
        <strong>${escapeHtml(card.status)}</strong>
      </div>
      <h4>${escapeHtml(card.title)}</h4>
      <div class="checkout-card-rows">
        ${card.rows.map(([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <code>${escapeHtml(value)}</code>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderProof(proof) {
  if (!proof) {
    elements.testnetProof.innerHTML = `<div class="proof-row"><span>Status</span><strong>Local demo only</strong></div>`;
    return;
  }

  const receiptTx = proof.transactions.receiptWritten;
  const deploy = proof.contracts.receiptLedger;
  elements.testnetProof.innerHTML = [
    proofRow("Network", proof.network),
    proofRow("Package", proof.contracts.receiptLedger.packageHash),
    proofLinkRow("Deploy tx", deploy.explorerUrl, deploy.deployHash),
    proofLinkRow("Receipt tx", receiptTx.explorerUrl, receiptTx.hash),
    proofRow("Receipt count", proof.stateProof.receiptCount)
  ].join("");
}

function renderAgentTrace(trace) {
  elements.agentTrace.innerHTML = trace.map((step, index) => {
    const status = step.status === "blocked" ? "destructive" : step.status === "complete" ? "success" : "neutral";
    return `
      <div class="trace-step">
        <span class="trace-index">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <strong>${escapeHtml(step.label)}</strong>
          <code>${escapeHtml(step.value)}</code>
        </div>
        <span class="status ${status}">${escapeHtml(step.status)}</span>
      </div>
    `;
  }).join("");
}

function renderAutonomousRun(run) {
  elements.autonomousRun.innerHTML = run.map((step, index) => {
    const status = step.status === "blocked" ? "destructive" : step.status === "complete" ? "success" : "neutral";
    return `
      <div class="agent-run-step">
        <span class="trace-index">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <strong>${escapeHtml(step.phase)}</strong>
          <p>${escapeHtml(step.action)}</p>
          <code>${escapeHtml(step.tool)} -> ${escapeHtml(step.output)}</code>
        </div>
        <span class="status ${status}">${escapeHtml(step.status)}</span>
      </div>
    `;
  }).join("");
}

function renderX402Flow(flow) {
  elements.x402List.innerHTML = flow.map((step) => `
    <div class="protocol-step">
      <strong>${escapeHtml(step.label)}</strong>
      <span>${escapeHtml(step.value)}</span>
    </div>
  `).join("");
}

async function renderMerchantChallenge() {
  const response = await fetch("/api/rwa-risk-report");
  const payload = await response.json();
  elements.merchantStatus.textContent = String(response.status);
  elements.merchantStatus.className = response.status === 402 ? "status destructive" : "status success";
  elements.merchantChallenge.innerHTML = [
    ["HTTP status", `${response.status} ${response.statusText || "Payment Required"}`],
    ["Service", payload.serviceId || "svc-rwa-risk"],
    ["Amount", `${payload.amount || 10} ${payload.currency || "CSPR"}`],
    ["Payment rail", payload.paymentRail || "x402-style"],
    ["Required header", payload.requiredHeader || "x-agentpay-receipt"],
    ["Receipt contract", payload.receiptContract || "ReceiptLedger"]
  ].map(([label, value]) => `
    <span>${escapeHtml(label)}</span>
    <code>${escapeHtml(value)}</code>
  `).join("");
}

async function renderMerchantIntegration() {
  const catalog = await getJson("/api/merchant/services");
  const service = catalog.services[0];
  const snippets = [
    {
      label: "Catalog",
      value: "curl /api/merchant/services"
    },
    {
      label: "Unpaid request",
      value: "curl -i /api/rwa-risk-report"
    },
    {
      label: "Paid request",
      value: "curl -H \"x-agentpay-receipt: agentpay-demo-approved\" /api/rwa-risk-report"
    },
    {
      label: "Service metadata",
      value: `${service.id} · ${service.price} ${service.currency} · ${service.endpoint}`
    }
  ];

  elements.merchantIntegration.innerHTML = snippets.map((snippet) => `
    <div class="integration-card">
      <span>${escapeHtml(snippet.label)}</span>
      <code>${escapeHtml(snippet.value)}</code>
    </div>
  `).join("");
}

function proofRow(label, value) {
  return `<div class="proof-row"><span>${escapeHtml(label)}</span><code>${escapeHtml(String(value))}</code></div>`;
}

function proofLinkRow(label, href, value) {
  return `<div class="proof-row"><span>${escapeHtml(label)}</span><a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${escapeHtml(shortHash(value))}</a></div>`;
}

function shortHash(value) {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function setReason(text, status) {
  elements.lastReason.textContent = text;
  elements.lastReason.className = `status ${status}`;
}

function setActiveNav(activeLink) {
  elements.navLinks.forEach((link) => {
    link.classList.toggle("active", link === activeLink);
  });
}

async function getJson(url) {
  const response = await fetch(url);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[character];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
