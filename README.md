# AgentPay Casper

AI-agent API payments on Casper, with policy controls and on-chain receipts.

AgentPay Casper is a hackathon prototype for the Casper Agentic Buildathon 2026. It demonstrates an x402-style payment gateway for agent commerce: a merchant exposes a paid RWA Risk Report API, a buyer agent requests it through MCP-compatible tools, AgentPay checks spending policy before payment, and approved API purchases are tied to Casper Testnet receipt proof.

## Live Demo

- Landing page: https://agentsafe-casper.onrender.com/
- Working console: https://agentsafe-casper.onrender.com/dashboard
- Health check: https://agentsafe-casper.onrender.com/healthz
- GitHub repo: https://github.com/Alike001/agentpay-casper
- Casper Testnet proof: deployed `ReceiptLedger` contract + receipt write transaction

## Demo Routes

- Landing page: `npm run dev`, then open `http://localhost:4173`
- Working console: `http://localhost:4173/dashboard`
- Demo video: https://youtu.be/Q91PSfwQnao

## What Works Now

- Separate landing page and product console.
- Checkout launchpad for configuring the service name, price, per-request cap, and daily budget in the console.
- Node API for state, simulation, payment-flow runs, and reset.
- MCP-compatible JSON-RPC endpoint with policy and receipt tools.
- Visible agent trace showing intent, MCP tool call, policy decision, payment route, and proof.
- Merchant services catalog endpoint for API sellers.
- Real paid RWA API endpoint that returns HTTP `402 Payment Required` until AgentPay receipt proof is supplied.
- x402-style paid API flow for the RWA report merchant endpoint.
- Deterministic policy engine with reason codes.
- Rust contract-logic scaffold and tests for agent, policy, service, and receipt state.
- Odra `ReceiptLedger` contract module with passing Odra test and Casper Testnet deployment.
- Proof readiness and local demo proof scripts.

## Built with Casper AI Toolkit

| Casper primitive | How AgentPay uses it | Current status |
|---|---|---|
| Casper Testnet | Public receipt deployment and receipt write proof | Live |
| Odra | `ReceiptLedger` smart contract and tests | Live |
| MCP | Buyer-agent policy, service, execution, and receipt tools | Live project gateway |
| x402 | HTTP payment-required flow for paid API checkout | x402-style prototype |
| CSPR.cloud / CSPR.live | Verifiable deploy and receipt links | Explorer live, CSPR.cloud final-round |
| CSPR.click | Client-side signing path for production buyer-agent payments | Final-round roadmap |

## Casper Testnet Proof

The qualification prototype has a transaction-producing Casper Testnet component. `ReceiptLedger` records the approved buyer-agent API purchase receipt for the RWA Risk Report flow.

| Evidence | Link |
|---|---|
| Live landing page | https://agentsafe-casper.onrender.com/ |
| Live console | https://agentsafe-casper.onrender.com/dashboard |
| GitHub repo | https://github.com/Alike001/agentpay-casper |
| ReceiptLedger package | `hash-aa362adaa1dbb9e67491e25206592104739e760ef754c8314d1b56bdda347833` |
| ReceiptLedger deploy tx | https://testnet.cspr.live/transaction/cd352660b8e2d1de2df2a52a1e043774be139467f0c0ba57b7fc2e9e88b2c411 |
| Receipt write tx | https://testnet.cspr.live/transaction/3116400a1250d9bdfd76f7c80a07ec5474f4c48c219c710794cb2f304b79bd86 |
| Receipt count | `1` |
| Last receipt ID | `receipt-latest` |
| Last agent ID | `agentsafe-demo-agent` |

Odra readiness:

```bash
npm run contracts:odra:test
```

Current Testnet deployment status:

- CLI account is funded and deployed to `casper-test`.
- A first deploy attempt failed because Casper rejected bulk-memory WASM.
- The successful deploy used `nightly-2025-02-17` to build WASM without bulk-memory instructions, then `wasm-opt --signext-lowering` and `wasm-strip`.
- Public proof is stored in `proof/testnet-proof.json`.

## Quickstart

```bash
npm run green-light
npm run proof:demo
npm run dev
```

## Qualification Review Steps

1. Open the landing page: https://agentsafe-casper.onrender.com/
2. Open the console: https://agentsafe-casper.onrender.com/dashboard
3. Review the buyer agent policy: 25 CSPR per-request cap and 50 CSPR daily budget.
4. Review the merchant API panel for the RWA Risk Report service at 10 CSPR/request.
5. Open the unpaid merchant endpoint and confirm it returns HTTP `402 Payment Required`:

```bash
curl -i https://agentsafe-casper.onrender.com/api/rwa-risk-report
```

6. Run the allowed 10 CSPR API purchase in the console and confirm receipt proof appears.
7. Run the 100 CSPR attempt and confirm it is blocked before signing/payment.
8. Review the Casper Testnet proof links in the console or in this README.

## Public Deployment

Recommended path for DoraHacks: deploy the Node web service from this GitHub repo on Render.

- Build command: `npm run build`
- Start command: `npm start`
- Health check path: `/healthz`
- Landing route: `/`
- Console route: `/dashboard`
- Fallback landing route: `/landing`
- Fallback dashboard route: `/console`

This repo includes `render.yaml` and `Dockerfile` for repeatable deployment.

## Proof Workflow

```bash
npm run proof:readiness
npm run proof:demo
```

`proof/demo-proof.json` is local-only evidence. `proof/testnet-proof.json` contains the real Casper Testnet deployment and receipt transaction proof.

## Product Flow

1. Merchant publishes `RWA Risk Report API` at `10 CSPR/request`.
2. Buyer agent requests `GET /api/rwa-risk-report`.
3. Merchant responds with real HTTP `402 Payment Required`.
4. AgentPay checks service allowlist, per-request cap, daily budget, approval threshold, and idempotency.
5. Allowed purchase creates a session receipt and maps to permanent Casper Testnet proof.
6. Over-budget purchase is blocked before signing/payment.

## API

- `GET /api/state`
- `GET /api/merchant/services`
- `GET /api/rwa-risk-report`
- `POST /api/simulate`
- `POST /api/run-demo`
- `POST /api/reset`
- `POST /mcp`

Merchant service catalog:

```bash
curl https://agentsafe-casper.onrender.com/api/merchant/services
```

The merchant API endpoint returns a real payment challenge before receipt proof:

```bash
curl -i https://agentsafe-casper.onrender.com/api/rwa-risk-report
```

Expected status:

```text
HTTP/2 402
x-payment-required: true
x-payment-amount: 10
x-payment-currency: CSPR
```

Demo receipt-proof access:

```bash
curl -H "x-agentpay-receipt: agentpay-demo-approved" https://agentsafe-casper.onrender.com/api/rwa-risk-report
```

## Merchant Integration

An API seller can expose paid services through AgentPay by publishing service metadata and returning an HTTP payment challenge for unpaid requests.

```text
GET /api/merchant/services
  -> service id, endpoint, price, currency, required receipt header

GET /api/rwa-risk-report
  -> 402 Payment Required
  -> x-payment-amount: 10
  -> x-payment-currency: CSPR

GET /api/rwa-risk-report
x-agentpay-receipt: <approved receipt>
  -> paid RWA report
```

Example MCP-style request:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "casper_simulate_action",
    "arguments": {
      "agentId": "agent-rwa-001",
      "serviceId": "svc-rwa-risk",
      "amount": 10,
      "actionType": "rwa_report_purchase",
      "idempotencyKey": "demo-1"
    }
  }
}
```

## Security and Limitations

- Testnet prototype only.
- ReceiptLedger is deployed on Casper Testnet; the broader AgentRegistry, PolicyVault, and ServiceRegistry contracts are roadmap/final-round scope.
- Console button actions update session state; the permanent on-chain evidence is the recorded ReceiptLedger deploy and receipt write in `proof/testnet-proof.json`.
- Full production x402 settlement is roadmap; the current build demonstrates the x402-style request/payment/policy/receipt flow.
- Contracts are unaudited.
- The LLM must not hold keys or sign transactions.
- Policy decisions are deterministic and must happen before execution.

## Structure

```text
apps/api/          Node API and static server
apps/mcp-server/   MCP-compatible tool surface
apps/web/          Static dashboard
contracts/         Rust contract-logic scaffold
packages/          Shared policy engine and types
tests/             Node test runner tests
docs/              Research, architecture, demo, and submission docs
```
