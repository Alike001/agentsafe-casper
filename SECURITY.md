# Security Policy

## Scope

AgentPay Casper is a hackathon prototype deployed for Casper Testnet review.

In scope:

- Node API and static web console.
- MCP-compatible JSON-RPC tool gateway.
- Deterministic policy engine.
- Odra `ReceiptLedger` contract and Testnet receipt proof.

Out of scope:

- Mainnet custody.
- Production x402 settlement.
- Production wallet signing infrastructure.
- Third-party API seller security.

## Core Security Model

AgentPay does not make the AI agent trusted. It makes agent actions bounded,
inspectable, and revocable.

- The LLM must not hold private keys.
- The LLM must not sign transactions.
- The LLM must not make the final allow/block decision.
- Policy checks happen before payment execution.
- On-chain receipts should commit to hashes and payment facts, not raw prompts,
  secrets, PII, or private API responses.

## Reporting a Vulnerability

Open a GitHub issue with the `security` label if the issue is safe to disclose.
For sensitive reports, contact the repository owner privately through GitHub.

Please include:

- Affected route, package, or contract.
- Reproduction steps.
- Expected vs actual behavior.
- Severity estimate.

## Known Limitations

- Testnet prototype only.
- Contracts are unaudited.
- Not suitable for custody or mainnet funds.
- The current x402 flow is an x402-style prototype for hackathon review.
