# AgentPay Casper

**Wallet-owned spending mandates for AI agents on Casper.**

AgentPay lets a wallet owner define which paid services an AI agent may use, its per-action and daily limits, when approval is required, and when authority expires. AI can translate human intent into a draft, but deterministic policy checks make authorization decisions and only the owner wallet can activate authority on Casper.

## Links

- Product: https://agentsafe-casper.onrender.com/
- Mandate Workbench: https://agentsafe-casper.onrender.com/dashboard
- Demo video: https://youtu.be/Q91PSfwQnao
- Repository: https://github.com/Alike001/agentpay-casper
- Existing Testnet receipt: https://testnet.cspr.live/transaction/3116400a1250d9bdfd76f7c80a07ec5474f4c48c219c710794cb2f304b79bd86

## Product Flow

1. Connect an owner wallet through CSPR.click.
2. Describe the purchasing authority for an agent or enter constraints manually.
3. OpenAI produces a structured **draft only**.
4. The deterministic mandate engine validates services, limits, budget, approval threshold, expiry, network, and canonical policy hash.
5. The owner reviews and signs an unsigned `MandateGuard::create_mandate` transaction client-side.
6. Agent actions are evaluated against the active mandate before signing or settlement.
7. Approved x402 service calls and Casper receipts remain attached to the mandate as evidence.

The backend never receives a wallet private key. An LLM cannot sign, activate a mandate, or override an allow/block decision.

## Current Final-Round Status

| Capability | Implementation | Status |
|---|---|---|
| Spending mandates | Persistent draft, validation, policy hash, limits, expiry, evaluation, and reason codes | Working |
| AI policy compilation | OpenAI Responses API with strict structured output; deterministic revalidation | Working; provider credits required |
| MCP | Official MCP SDK and stateless Streamable HTTP transport at `POST /mcp` | Working |
| Wallet signing | CSPR.click v2 client integration and unsigned Casper transaction builder | Code ready; production app ID required |
| Odra authority | `MandateGuard` contract with owner, delegate, limits, service, expiry, revocation, and consumption checks | Contract and tests ready; Testnet deployment pending |
| Casper x402 | Official `@make-software/casper-x402` exact CEP-18 middleware | Code ready; facilitator and WCSPR configuration required |
| CSPR.cloud | Runtime capability reporting and planned confirmation adapter | API key/integration pending |
| Testnet evidence | Deployed Odra `ReceiptLedger` and transaction-producing receipt write | Live |

The interface reports unconfigured integrations honestly. It does not present a draft as active or a submitted transaction as confirmed.

## Existing Casper Testnet Proof

The qualification build deployed `ReceiptLedger` with Odra and wrote a receipt on Casper Testnet. This historical proof is preserved while `MandateGuard` is added for the final round.

| Evidence | Value |
|---|---|
| Package hash | `hash-aa362adaa1dbb9e67491e25206592104739e760ef754c8314d1b56bdda347833` |
| Deploy transaction | https://testnet.cspr.live/transaction/cd352660b8e2d1de2df2a52a1e043774be139467f0c0ba57b7fc2e9e88b2c411 |
| Receipt transaction | https://testnet.cspr.live/transaction/3116400a1250d9bdfd76f7c80a07ec5474f4c48c219c710794cb2f304b79bd86 |
| Network | `casper-test` |

Machine-readable evidence is stored in [`proof/testnet-proof.json`](proof/testnet-proof.json).

## Casper-Native Architecture

```text
Human intent
    |
    v
OpenAI draft ------> deterministic mandate validation
                              |
Owner wallet <--- CSPR.click review and signing
    |                         |
    +---- Casper Testnet MandateGuard (Odra)
                              |
Agent -> MCP tools -> policy decision -> Casper x402 paid API
                              |
                     execution + receipt evidence
```

- **Odra:** `MandateGuard` is the authority boundary; `ReceiptLedger` preserves qualification evidence.
- **Casper x402:** exact CEP-18 settlement adapter for agent-purchased APIs.
- **CSPR.click:** owner-controlled account selection and client-side signing.
- **MCP:** typed read and simulation tools; no signing or settlement tool is exposed to the LLM.
- **CSPR.cloud:** intended for transaction confirmation and indexed receipt reads after credentials are configured.

Casper is fundamental to the product: owner and delegate are Casper identities, activation and revocation are Casper transactions, and public authority/receipt evidence is anchored on Casper Testnet.

## Quickstart

Requirements: Node.js 20+, npm, Rust, and the Odra toolchain for contract tests.

```bash
npm install
cp .env.example .env.local
npm run green-light
npm run dev
```

Open http://localhost:4173 and http://localhost:4173/dashboard.

The manual mandate path works without an AI provider. Wallet activation and x402 settlement remain disabled until their required Testnet configuration is supplied.

## Configuration

Never commit `.env.local` or private keys. Important variables are documented in [`.env.example`](.env.example).

Minimum integration variables:

```text
OPENAI_API_KEY
CSPR_CLICK_APP_ID
MANDATE_GUARD_PACKAGE_HASH
X402_FACILITATOR_URL
X402_PAYEE_ADDRESS
X402_ASSET_PACKAGE
X402_ASSET_NAME
CSPR_CLOUD_API_KEY
```

## API Surface

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/healthz` | Service and persistence readiness |
| `GET` | `/api/config` | Public capability status, without secrets |
| `GET/POST` | `/api/mandates` | List or create mandate drafts |
| `POST` | `/api/mandates/compile` | Compile human intent into an AI draft |
| `POST` | `/api/mandates/:id/evaluate` | Deterministically evaluate an agent action |
| `POST` | `/api/mandates/:id/transactions/activate` | Build an unsigned Casper transaction |
| `POST` | `/api/mandates/:id/activation-submissions` | Record a submitted transaction as pending |
| `GET` | `/api/mandates/:id/executions` | Read mandate decisions and evidence |
| `POST` | `/mcp` | Official MCP Streamable HTTP endpoint |
| `GET` | `/api/x402/rwa-risk-report` | Official Casper x402 protected resource |
| `GET` | `/api/rwa-risk-report` | Preserved qualification-round HTTP 402 route |

## Repository Structure

```text
apps/api/                    Express API, persistence, and static delivery
apps/mcp-server/             Official MCP server and typed tools
apps/web/                    Product landing page and Mandate Workbench
contracts/agent-safe-odra/   Odra ReceiptLedger and MandateGuard
packages/ai-policy-compiler/ OpenAI structured policy drafting
packages/casper-transactions/Unsigned Casper transaction construction
packages/casper-x402/        Official Casper x402 middleware adapter
packages/mandate-engine/     Canonical policy and deterministic decisions
packages/mandate-store/      Atomic JSON persistence
tests/                       Node unit and integration tests
proof/                       Public Casper Testnet evidence
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run contracts:odra:test
npm run green-light
```

## Security

- The LLM is untrusted and receives no private keys.
- Final authorization is deterministic and returns explicit reason codes.
- Wallet signing occurs client-side.
- Idempotency keys and action hashes protect against replay.
- Raw prompts, private service responses, secrets, and PII are not stored on-chain.
- Contract ownership checks protect activation, revocation, and budget consumption.

See [`SECURITY.md`](SECURITY.md) for the full threat model.

## Testnet Disclosure

AgentPay is a final-round Testnet build. Contracts are unaudited and the product is not suitable for custody or mainnet funds. Casper x402 support is experimental until the facilitator and asset configuration are verified end to end.

## License

[MIT](LICENSE)
