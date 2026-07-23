const appState = {
  config: window.AGENTPAY_CONFIG || {},
  mandates: [],
  services: [],
  proof: null,
  selectedId: null,
  wallet: null,
  activeSection: "mandates",
  executions: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const elements = {
  walletButton: $("#wallet-button"),
  syncState: $("#sync-state"),
  mandateList: $("#mandate-list"),
  mandateSearch: $("#mandate-search"),
  objectList: $(".object-list"),
  workspace: $("#workspace"),
  emptyWorkspace: $("#empty-workspace"),
  mandateWorkspace: $("#mandate-workspace"),
  createDrawer: $("#create-drawer"),
  createBackdrop: $("#create-backdrop"),
  createFeedback: $("#create-feedback"),
  walletRequirement: $("#wallet-requirement"),
  mandateForm: $("#mandate-form"),
  actionDialog: $("#action-dialog"),
  actionForm: $("#action-form"),
  toast: $("#toast")
};

document.addEventListener("DOMContentLoaded", boot);

async function boot() {
  window.lucide?.createIcons();
  bindEvents();
  bindCsprClick();
  await refreshProductState();
}

function bindEvents() {
  elements.walletButton.addEventListener("click", connectWallet);
  $("#new-mandate").addEventListener("click", openCreateDrawer);
  $("#back-to-mandates").addEventListener("click", showMandateList);
  $$('[data-open-create]').forEach((button) => button.addEventListener("click", openCreateDrawer));
  $("#close-create").addEventListener("click", closeCreateDrawer);
  elements.createBackdrop.addEventListener("click", closeCreateDrawer);
  elements.mandateForm.addEventListener("submit", compileMandate);
  $("#manual-draft").addEventListener("click", createManualMandate);
  elements.mandateSearch.addEventListener("input", renderMandateList);
  $("#activate-mandate").addEventListener("click", activateSelectedMandate);
  $("#revoke-mandate").addEventListener("click", () => showToast("Revocation transaction support is pending the MandateGuard Testnet deployment."));
  $("#run-policy-check").addEventListener("click", openActionDialog);
  $("#close-action").addEventListener("click", closeActionDialog);
  $("#cancel-action").addEventListener("click", closeActionDialog);
  elements.actionDialog.addEventListener("click", (event) => {
    if (event.target === elements.actionDialog) closeActionDialog();
  });
  elements.actionForm.addEventListener("submit", evaluateAction);
  $("#copy-policy").addEventListener("click", copyPolicy);
  $("#refresh-status").addEventListener("click", refreshProductState);
  $$(".workspace-tab").forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));
  $$('[data-tab-target]').forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.tabTarget)));
  $$(".rail-link").forEach((button) => button.addEventListener("click", () => selectProductSection(button.dataset.section)));
}

function bindCsprClick() {
  window.addEventListener("csprclick:loaded", async () => {
    for (const eventName of ["csprclick:signed_in", "csprclick:switched_account"]) {
      window.csprclick.on(eventName, updateActiveWallet);
    }
    for (const eventName of ["csprclick:signed_out", "csprclick:disconnected"]) {
      window.csprclick.on(eventName, clearWallet);
    }
    await updateActiveWallet();
  });
}

async function connectWallet() {
  if (appState.wallet) {
    window.csprclick?.switchAccount();
    return;
  }
  const localDevelopment = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!appState.config.csprClickAppId && !localDevelopment) {
    showToast("CSPR.click is installed but the deployed app ID is not configured yet.");
    return;
  }
  if (!window.csprclick) {
    showToast("CSPR.click is still loading. Try again in a moment.");
    return;
  }
  window.csprclick.signIn();
}

async function updateActiveWallet() {
  const account = await window.csprclick?.getActiveAccountAsync({ withBalance: true });
  if (!account?.public_key) return;
  appState.wallet = account;
  elements.walletButton.classList.remove("secondary");
  elements.walletButton.querySelector("span").textContent = shortHash(account.public_key);
  elements.walletRequirement.classList.add("connected");
  elements.walletRequirement.querySelector("strong").textContent = "Owner wallet connected";
  elements.walletRequirement.querySelector("span").textContent = shortHash(account.public_key);
  renderSelectedMandate();
}

function clearWallet() {
  appState.wallet = null;
  elements.walletButton.classList.add("secondary");
  elements.walletButton.querySelector("span").textContent = "Connect wallet";
  elements.walletRequirement.classList.remove("connected");
  elements.walletRequirement.querySelector("strong").textContent = "Owner wallet";
  elements.walletRequirement.querySelector("span").textContent = "Connect CSPR.click before compiling authority.";
}

async function refreshProductState() {
  setSyncState("Refreshing...");
  try {
    const [config, mandateData, catalog, legacyState] = await Promise.all([
      getJson("/api/config"),
      getJson("/api/mandates"),
      getJson("/api/merchant/services"),
      getJson("/api/state")
    ]);
    appState.config = config;
    appState.mandates = mandateData.mandates || [];
    appState.services = catalog.services || [];
    appState.proof = legacyState.testnetProof || null;
    if (appState.selectedId && !appState.mandates.some((item) => item.mandate.id === appState.selectedId)) {
      appState.selectedId = null;
    }
    renderIntegrationStatus();
    renderMandateList();
    renderSelectedMandate();
    setSyncState("Workbench ready");
  } catch (error) {
    setSyncState("Connection error");
    showToast(error.message);
  }
}

function renderIntegrationStatus() {
  const integrations = Object.values(appState.config.integrations || {});
  $("#integration-list").innerHTML = integrations.map((item) => `
    <div class="integration-row ${item.configured ? "configured" : ""}">
      <span class="integration-dot"></span>
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.configured ? item.detail : `Not configured · ${item.detail}`)}</span></div>
    </div>
  `).join("");
}

function renderMandateList() {
  const query = elements.mandateSearch.value.trim().toLowerCase();
  const mandates = appState.mandates.filter(({ mandate }) => [mandate.name, mandate.agentName, mandate.agentId]
    .some((value) => String(value).toLowerCase().includes(query)));
  if (!mandates.length) {
    elements.mandateList.innerHTML = `<div class="mandate-list-empty">${query ? "No matching mandates." : "No mandates yet. Create the first wallet-owned authority."}</div>`;
    return;
  }
  elements.mandateList.innerHTML = mandates.map(({ mandate }) => {
    const remaining = BigInt(mandate.dailyBudgetMotes) - BigInt(mandate.spentTodayMotes);
    return `
      <button class="mandate-row ${mandate.id === appState.selectedId ? "selected" : ""}" data-mandate-id="${escapeAttribute(mandate.id)}" type="button">
        <span class="mandate-row-head"><strong>${escapeHtml(mandate.name)}</strong><span class="status-mini ${escapeAttribute(mandate.status)}">${escapeHtml(mandate.status)}</span></span>
        <code>${escapeHtml(mandate.agentName)}</code>
        <span class="mandate-row-meta"><span>${escapeHtml(formatWCSPR(remaining))} left</span><span>${escapeHtml(formatDate(mandate.expiresAt))}</span></span>
      </button>
    `;
  }).join("");
  $$(".mandate-row").forEach((row) => row.addEventListener("click", () => selectMandate(row.dataset.mandateId)));
}

async function selectMandate(id) {
  appState.selectedId = id;
  appState.activeSection = "mandates";
  appState.executions = (await getJson(`/api/mandates/${encodeURIComponent(id)}/executions`)).executions || [];
  renderMandateList();
  renderSelectedMandate();
  selectTab("overview");
}

function showMandateList() {
  appState.selectedId = null;
  appState.executions = [];
  renderMandateList();
  renderSelectedMandate();
}

function renderSelectedMandate() {
  const record = selectedRecord();
  const hasSelection = Boolean(record);
  elements.emptyWorkspace.hidden = hasSelection;
  elements.mandateWorkspace.hidden = !hasSelection;
  elements.objectList.classList.toggle("has-selection", hasSelection);
  elements.workspace.classList.toggle("has-selection", hasSelection);
  if (!record) return;

  const { mandate, validation, canonicalPolicy } = record;
  $("#mandate-status").textContent = mandate.status.toUpperCase();
  $("#mandate-status").className = `status-indicator ${mandate.status}`;
  $("#mandate-name").textContent = mandate.name;
  $("#mandate-agent").textContent = `${mandate.agentName} · ${mandate.agentId}`;
  $("#mandate-network").textContent = mandate.network;
  $("#owner-key").textContent = mandate.ownerPublicKey;
  $("#owner-key").title = mandate.ownerPublicKey;
  $("#agent-account").textContent = mandate.agentAccountHash;
  $("#agent-account").title = mandate.agentAccountHash;
  $("#action-limit").textContent = formatWCSPR(mandate.maxAmountPerActionMotes);
  $("#approval-limit").textContent = formatWCSPR(mandate.approvalThresholdMotes);
  $("#mandate-expiry").textContent = formatDateTime(mandate.expiresAt);
  $("#mandate-intent").textContent = mandate.intent;
  $("#policy-hash").textContent = mandate.policyHash;
  $("#policy-json").textContent = JSON.stringify(canonicalPolicy || mandate, null, 2);

  const spent = BigInt(mandate.spentTodayMotes);
  const budget = BigInt(mandate.dailyBudgetMotes);
  const remaining = budget > spent ? budget - spent : 0n;
  const progress = budget ? Number((spent * 10000n) / budget) / 100 : 0;
  $("#budget-remaining").textContent = `${formatWCSPR(remaining)} remaining`;
  $("#budget-spent").textContent = `${formatWCSPR(spent)} spent`;
  $("#budget-total").textContent = `${formatWCSPR(budget)} total`;
  $("#budget-progress").style.width = `${Math.min(progress, 100)}%`;

  $("#validation-summary").textContent = validation.valid ? "All checks passed" : `${validation.checks.filter((check) => !check.passed).length} checks need attention`;
  $("#validation-summary").className = `validation-summary ${validation.valid ? "valid" : "invalid"}`;
  $("#validation-checks").innerHTML = validation.checks.map((check) => `
    <div class="check-row ${check.passed ? "" : "failed"}">
      <i data-lucide="${check.passed ? "circle-check" : "circle-x"}"></i>
      <div><strong>${escapeHtml(check.code)}</strong><span>${escapeHtml(check.message)}</span></div>
    </div>
  `).join("");

  $("#approved-services").innerHTML = mandate.allowedServiceIds.map((id) => {
    const service = appState.services.find((item) => item.id === id);
    return `<div class="service-row"><div><strong>${escapeHtml(service?.name || id)}</strong><span>${escapeHtml(service?.description || "Mandate-approved paid service")}</span></div><code>${escapeHtml(id)}</code><strong>${escapeHtml(service ? `${service.price} WCSPR` : "Allowed")}</strong></div>`;
  }).join("");

  const guardConfigured = Boolean(appState.config.mandateGuardPackageHash);
  $("#guard-state").textContent = guardConfigured ? "Configured" : "Deployment required";
  $("#guard-state").className = `integration-state ${guardConfigured ? "live" : ""}`;
  $("#guard-package").textContent = appState.config.mandateGuardPackageHash || "Not deployed";
  $("#activation-transaction").innerHTML = transactionEvidence(mandate.activation);
  $("#activate-mandate").disabled = mandate.status !== "draft" || !validation.valid || !guardConfigured;
  $("#activate-mandate").title = guardConfigured ? "Sign the MandateGuard transaction with CSPR.click" : "MandateGuard Testnet deployment is required";
  renderReceiptProof();
  renderExecutions();
  renderLatestExecution();
  window.lucide?.createIcons();
}

function renderExecutions() {
  const rows = appState.executions;
  $("#execution-empty").hidden = rows.length > 0;
  $(".table-wrap").hidden = rows.length === 0;
  $("#execution-table").innerHTML = rows.map((item) => `
    <tr>
      <td><span class="decision-code ${escapeAttribute(item.verdict)}">${escapeHtml(item.verdict.toUpperCase())}</span></td>
      <td>${escapeHtml(item.serviceId)}</td>
      <td>${escapeHtml(formatWCSPR(item.amountMotes))}</td>
      <td><code>${escapeHtml(item.reasonCode)}</code></td>
      <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
    </tr>
  `).join("");
}

function renderLatestExecution() {
  const latest = appState.executions[0];
  if (!latest) {
    $("#latest-execution").className = "timeline-empty";
    $("#latest-execution").textContent = "No action has been evaluated against this mandate.";
    return;
  }
  $("#latest-execution").className = `execution-summary ${latest.verdict}`;
  $("#latest-execution").innerHTML = `
    <span class="execution-icon"><i data-lucide="${latest.verdict === "allow" ? "check" : "x"}"></i></span>
    <div><strong>${escapeHtml(latest.reasonCode)}</strong><span>${escapeHtml(latest.message)}</span></div>
    <code>${escapeHtml(formatWCSPR(latest.amountMotes))}</code>
  `;
}

function renderReceiptProof() {
  const proof = appState.proof;
  if (!proof) {
    $("#receipt-proof").innerHTML = "<div><dt>Status</dt><dd>Proof file unavailable</dd></div>";
    return;
  }
  const contract = proof.contracts.receiptLedger;
  const receipt = proof.transactions.receiptWritten;
  $("#receipt-proof").innerHTML = [
    factRow("Package", contract.packageHash),
    factLink("Deploy tx", contract.explorerUrl, contract.deployHash),
    factLink("Receipt tx", receipt.explorerUrl, receipt.hash),
    factRow("Receipt count", proof.stateProof.receiptCount)
  ].join("");
}

function selectTab(name) {
  $$(".workspace-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  $$(".tab-panel").forEach((panel) => {
    const active = panel.id === `tab-${name}`;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
}

async function selectProductSection(section) {
  appState.activeSection = section;
  $$(".rail-link").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
  if (section === "mandates") {
    $("#collection-workspace")?.remove();
    renderSelectedMandate();
    return;
  }
  elements.emptyWorkspace.hidden = true;
  elements.mandateWorkspace.hidden = true;
  let collection = $("#collection-workspace");
  if (!collection) {
    collection = document.createElement("section");
    collection.id = "collection-workspace";
    collection.className = "mandate-workspace";
    elements.workspace.append(collection);
  }
  collection.innerHTML = collectionView(section);
  window.lucide?.createIcons();
}

function collectionView(section) {
  if (section === "services") {
    return collectionShell("Services", "Paid APIs available to spending mandates.", appState.services.map((service) => `
      <div class="service-row"><div><strong>${escapeHtml(service.name)}</strong><span>${escapeHtml(service.description)}</span></div><code>${escapeHtml(service.id)}</code><strong>${escapeHtml(`${service.price} WCSPR`)}</strong></div>
    `).join(""));
  }
  if (section === "agents") {
    const agents = uniqueBy(appState.mandates.map(({ mandate }) => mandate), "agentId");
    return collectionShell("Agents", "Casper accounts receiving bounded purchasing authority.", agents.length ? agents.map((agent) => `
      <div class="service-row"><div><strong>${escapeHtml(agent.agentName)}</strong><span>${escapeHtml(agent.agentAccountHash)}</span></div><code>${escapeHtml(agent.agentId)}</code><strong>${escapeHtml(agent.status)}</strong></div>
    `).join("") : emptyCollection("No delegated agents yet."));
  }
  if (section === "executions") {
    const executions = appState.executions;
    return collectionShell("Executions", "Deterministic allow, block, and approval decisions.", executions.length ? executions.map((item) => `
      <div class="service-row"><div><strong>${escapeHtml(item.reasonCode)}</strong><span>${escapeHtml(item.message)}</span></div><code>${escapeHtml(item.serviceId)}</code><strong>${escapeHtml(formatWCSPR(item.amountMotes))}</strong></div>
    `).join("") : emptyCollection("Select a mandate and run a policy check."));
  }
  return collectionShell("Receipts", "Casper evidence attached to settled agent commerce.", `
    <div class="service-row"><div><strong>Qualification receipt</strong><span>Odra ReceiptLedger · Casper Testnet</span></div><code>3116400a...4b79bd86</code><a href="https://testnet.cspr.live/transaction/3116400a1250d9bdfd76f7c80a07ec5474f4c48c219c710794cb2f304b79bd86" target="_blank" rel="noreferrer">Inspect</a></div>
  `);
}

function collectionShell(title, subtitle, rows) {
  return `<header class="mandate-heading"><div class="heading-main"><div class="status-line"><span>PRODUCT INDEX</span></div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div></header><section class="workspace-section"><div class="service-rows">${rows}</div></section>`;
}

function emptyCollection(message) {
  return `<div class="timeline-empty">${escapeHtml(message)}</div>`;
}

function openCreateDrawer() {
  elements.createBackdrop.hidden = false;
  elements.createDrawer.classList.add("open");
  elements.createDrawer.setAttribute("aria-hidden", "false");
  $("#intent-input").focus();
}

function closeCreateDrawer() {
  elements.createDrawer.classList.remove("open");
  elements.createDrawer.setAttribute("aria-hidden", "true");
  window.setTimeout(() => { elements.createBackdrop.hidden = true; }, 200);
}

async function compileMandate(event) {
  event.preventDefault();
  if (!requireWallet()) return;
  setCreateFeedback("Compiling a conservative draft with OpenAI...", "");
  setCreateBusy(true);
  try {
    const result = await postJson("/api/mandates/compile", {
      intent: $("#intent-input").value,
      ownerPublicKey: appState.wallet.public_key,
      agentAccountHash: $("#agent-account-input").value
    });
    await finishCreatedMandate(result.mandate.id, "AI draft compiled. Deterministic checks passed; wallet approval is still required.");
  } catch (error) {
    setCreateFeedback(`AI provider error: ${error.message}. The manual deterministic path remains available.`, "error");
  } finally {
    setCreateBusy(false);
  }
}

async function createManualMandate() {
  if (!requireWallet()) return;
  setCreateFeedback("Creating deterministic mandate draft...", "");
  setCreateBusy(true);
  try {
    const duration = Number($("#duration-input").value);
    const result = await postJson("/api/mandates", {
      name: "RWA data procurement",
      intent: $("#intent-input").value,
      ownerPublicKey: appState.wallet.public_key,
      agentId: "agent-rwa-001",
      agentName: "RWA Procurement Agent",
      agentAccountHash: $("#agent-account-input").value,
      allowedServiceIds: ["svc-rwa-risk"],
      maxAmountPerActionCSPR: $("#per-action-input").value,
      dailyBudgetCSPR: $("#daily-budget-input").value,
      approvalThresholdCSPR: $("#approval-input").value,
      expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000).toISOString()
    });
    await finishCreatedMandate(result.mandate.id, "Manual draft created. Review validation before wallet approval.");
  } catch (error) {
    setCreateFeedback(error.message, "error");
  } finally {
    setCreateBusy(false);
  }
}

async function finishCreatedMandate(id, message) {
  setCreateFeedback(message, "success");
  appState.selectedId = id;
  await refreshProductState();
  await selectMandate(id);
  window.setTimeout(closeCreateDrawer, 500);
}

async function activateSelectedMandate() {
  const record = selectedRecord();
  if (!record || !requireWallet()) return;
  if (!appState.config.mandateGuardPackageHash) {
    showToast("MandateGuard must be deployed on Casper Testnet before wallet activation can run.");
    return;
  }
  if (appState.wallet.public_key !== record.mandate.ownerPublicKey) {
    showToast("Switch to the wallet that owns this mandate draft.");
    return;
  }
  setSyncState("Building transaction...");
  try {
    const built = await postJson(`/api/mandates/${encodeURIComponent(record.mandate.id)}/transactions/activate`, {
      ownerPublicKey: appState.wallet.public_key
    });
    const result = await window.csprclick.send(built.transaction, built.signingPublicKey, (status) => setSyncState(`Casper: ${status}`));
    if (!result || result.cancelled || result.error) throw new Error(result?.error || "Wallet approval was cancelled.");
    const transactionHash = result.deployHash || result.transactionHash;
    if (!transactionHash) throw new Error("CSPR.click did not return a transaction hash.");
    await postJson(`/api/mandates/${encodeURIComponent(record.mandate.id)}/activation-submissions`, {
      transactionHash,
      ownerPublicKey: appState.wallet.public_key
    });
    await refreshProductState();
    showToast("Activation submitted to Casper. AgentPay is waiting for verified confirmation.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setSyncState("Workbench ready");
  }
}

function openActionDialog() {
  elements.actionDialog.hidden = false;
  $("#action-amount").focus();
}

function closeActionDialog() {
  elements.actionDialog.hidden = true;
}

async function evaluateAction(event) {
  event.preventDefault();
  const record = selectedRecord();
  if (!record) return;
  try {
    const response = await fetch(`/api/mandates/${encodeURIComponent(record.mandate.id)}/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceId: $("#action-service").value,
        amountCSPR: $("#action-amount").value,
        idempotencyKey: `workbench-${crypto.randomUUID()}`
      })
    });
    const payload = await response.json();
    if (!payload.decision) throw new Error(payload.message || "Policy evaluation failed.");
    appState.executions = (await getJson(`/api/mandates/${encodeURIComponent(record.mandate.id)}/executions`)).executions || [];
    renderExecutions();
    renderLatestExecution();
    closeActionDialog();
    selectTab("executions");
    showToast(`${payload.decision.reasonCode}: ${payload.decision.message}`);
    window.lucide?.createIcons();
  } catch (error) {
    showToast(error.message);
  }
}

async function copyPolicy() {
  await navigator.clipboard.writeText($("#policy-json").textContent);
  showToast("Canonical policy copied.");
}

function requireWallet() {
  if (appState.wallet?.public_key) return true;
  showToast("Connect the owner wallet with CSPR.click first.");
  return false;
}

function selectedRecord() {
  return appState.mandates.find(({ mandate }) => mandate.id === appState.selectedId) || null;
}

function setCreateFeedback(message, status) {
  elements.createFeedback.textContent = message;
  elements.createFeedback.className = `create-feedback ${status}`;
}

function setCreateBusy(busy) {
  $("#compile-draft").disabled = busy;
  $("#manual-draft").disabled = busy;
}

function setSyncState(message) {
  elements.syncState.textContent = message;
}

let toastTimer;
function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 4200);
}

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status}).`);
  return payload;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status}).`);
  return payload;
}

function formatWCSPR(motes) {
  const value = BigInt(motes || 0);
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} WCSPR`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function shortHash(value) {
  if (!value || value.length < 18) return value || "-";
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function transactionEvidence(activation) {
  if (!activation?.transactionHash) return "Not submitted";
  const hash = activation.transactionHash;
  return `<a href="https://testnet.cspr.live/transaction/${escapeAttribute(hash)}" target="_blank" rel="noreferrer">${escapeHtml(shortHash(hash))}</a> <small>${escapeHtml(activation.status)}</small>`;
}

function factRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(String(value))}</code></dd></div>`;
}

function factLink(label, href, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd><a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${escapeHtml(shortHash(value))}</a></dd></div>`;
}

function uniqueBy(items, key) {
  return [...new Map(items.map((item) => [item[key], item])).values()];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
