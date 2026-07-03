# AgentSafe Casper

Safe spending controls and receipt proofs for AI agents on Casper.

AgentSafe Casper is a hackathon prototype for the Casper Agentic Buildathon 2026. It demonstrates an AI-agent commerce firewall: an agent can buy a demo RWA risk report only if the proposed action fits the user's policy, and an over-budget action is blocked before signing.

## Demo

- Local app: `npm run dev`, then open `http://localhost:4173`
- Live app: TBD
- Demo video: TBD
- Casper Testnet proof: TBD

## What Works Now

- Static operational dashboard.
- Node API for state, simulation, and demo runs.
- MCP-compatible JSON-RPC endpoint with policy and receipt tools.
- Deterministic policy engine with reason codes.
- Rust contract-logic scaffold and tests for agent, policy, service, and receipt state.
- Proof readiness and local demo proof scripts.

## Casper Integration Plan

The current code is ready to connect to Casper Testnet, but it does not yet claim deployed contracts or real transaction hashes. The next build step is replacing the in-memory receipt writer with deployed Casper/Odra contracts and filling the proof table below.

| Evidence | Link |
|---|---|
| AgentRegistry contract | TBD |
| PolicyVault contract | TBD |
| ServiceRegistry contract | TBD |
| ReceiptLedger contract | TBD |
| Agent registration tx | TBD |
| Policy set tx | TBD |
| Receipt write tx | TBD |

## Quickstart

```bash
npm run green-light
npm run proof:demo
npm run dev
```

## Proof Workflow

```bash
npm run proof:readiness
npm run proof:demo
```

`proof/demo-proof.json` is local-only evidence. Real Casper Testnet hashes must be written to `proof/testnet-proof.json` before final submission.

## API

- `GET /api/state`
- `POST /api/simulate`
- `POST /api/run-demo`
- `POST /mcp`

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

- Testnet/demo prototype only.
- Contracts are not deployed yet.
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
