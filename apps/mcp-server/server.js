import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { evaluateMandate, validateMandate } from "../../packages/mandate-engine/index.js";

export function createAgentPayMcpServer({ store, services }) {
  const server = new McpServer({
    name: "agentpay-casper",
    version: "0.2.0"
  });

  server.registerTool("agentpay_list_mandates", {
    description: "List Casper agent spending mandates and their current authority status.",
    inputSchema: {}
  }, async () => mcpResult({ mandates: await store.listMandates() }));

  server.registerTool("agentpay_get_mandate", {
    description: "Get one spending mandate, its canonical policy hash, and deterministic validation checks.",
    inputSchema: {
      mandateId: z.string().min(1).describe("AgentPay mandate identifier")
    }
  }, async ({ mandateId }) => {
    const mandate = await requireMandate(store, mandateId);
    return mcpResult({ mandate, validation: validateMandate(mandate) });
  });

  server.registerTool("agentpay_list_services", {
    description: "List paid API services that can be referenced by a spending mandate.",
    inputSchema: {}
  }, async () => mcpResult({ services }));

  server.registerTool("agentpay_simulate_action", {
    description: "Deterministically evaluate a proposed paid API action. This never signs, settles, or changes budget.",
    inputSchema: {
      mandateId: z.string().min(1),
      serviceId: z.string().min(1),
      amountMotes: z.string().regex(/^\d+$/),
      idempotencyKey: z.string().min(1),
      approvalId: z.string().min(1).optional()
    }
  }, async ({ mandateId, ...action }) => {
    const mandate = await requireMandate(store, mandateId);
    const seenIdempotencyKeys = await store.seenIdempotencyKeys(mandateId);
    const decision = evaluateMandate(mandate, {
      ...action,
      agentId: mandate.agentId,
      actionType: "paid_service_call"
    }, { seenIdempotencyKeys });
    return mcpResult({ mandateId, decision });
  });

  server.registerTool("agentpay_list_executions", {
    description: "List policy decisions and settlement evidence attached to a mandate.",
    inputSchema: {
      mandateId: z.string().min(1)
    }
  }, async ({ mandateId }) => mcpResult({
    mandateId,
    executions: await store.listExecutions(mandateId)
  }));

  return server;
}

export async function handleOfficialMcpRequest(request, response, body, dependencies) {
  const mcpServer = createAgentPayMcpServer(dependencies);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response, body);
  } finally {
    await transport.close();
    await mcpServer.close();
  }
}

async function requireMandate(store, mandateId) {
  const mandate = await store.getMandate(mandateId);
  if (!mandate) throw new Error(`Mandate not found: ${mandateId}`);
  return mandate;
}

function mcpResult(structuredContent) {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}
