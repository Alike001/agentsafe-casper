# Contributing

Thanks for reviewing or contributing to AgentPay Casper.

## Local Setup

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For the full local gate:

```bash
npm run green-light
```

## Pull Request Expectations

- Keep changes scoped.
- Preserve Testnet-only and unaudited disclosures.
- Add or update tests for policy, MCP, API, or contract behavior changes.
- Do not commit private keys, wallet secrets, API keys, or generated local proof
  files that are not intended for review.

## Project Boundaries

AgentPay Casper is a hackathon MVP for Casper Testnet. Production signing,
mainnet settlement, external audits, and full x402 facilitator settlement are
roadmap items, not current claims.
