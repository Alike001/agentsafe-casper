import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentPayMcpServer } from "../apps/mcp-server/server.js";
import { activateMandate, createMandateDraft, CSPR_MOTES } from "../packages/mandate-engine/index.js";
import { MemoryMandateStore } from "../packages/mandate-store/index.js";

const NOW = "2026-07-21T12:00:00.000Z";

test("official MCP server exposes typed mandate tools", async () => {
  const store = new MemoryMandateStore();
  const draft = createMandateDraft({
    ownerPublicKey: "020390e3201006b059e559fcb2282b277c510259285dcabf2eb6b3f3a77f602ee99d",
    agentAccountHash: "account-hash-3975323bebe4fc7eed16f29262ff7756fb745a00aa3a08f5c36a945bf924b2cb",
    expiresAt: "2026-07-28T12:00:00.000Z"
  }, { now: NOW });
  await store.saveMandate(activateMandate(draft, draft.ownerPublicKey, { now: NOW }));

  const server = createAgentPayMcpServer({ store, services: [{ id: "svc-rwa-risk" }] });
  const client = new Client({ name: "agentpay-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const tools = await client.listTools();
  assert.equal(tools.tools.some((tool) => tool.name === "agentpay_simulate_action"), true);

  const result = await client.callTool({
    name: "agentpay_simulate_action",
    arguments: {
      mandateId: draft.id,
      serviceId: "svc-rwa-risk",
      amountMotes: (10n * CSPR_MOTES).toString(),
      idempotencyKey: "mcp-action-1"
    }
  });
  assert.equal(result.structuredContent.decision.reasonCode, "ALLOWED");

  await client.close();
  await server.close();
});
