import { registerExactCasperScheme } from "@make-software/casper-x402/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";

export const CASPER_X402_NETWORK = "casper:casper-test";

export function casperX402Config(env = process.env) {
  const config = {
    facilitatorUrl: env.X402_FACILITATOR_URL || "",
    facilitatorApiKey: env.X402_FACILITATOR_API_KEY || "",
    payTo: env.X402_PAYEE_ADDRESS || "",
    network: CASPER_X402_NETWORK,
    asset: env.X402_ASSET_PACKAGE || "",
    assetName: env.X402_ASSET_NAME || "",
    assetVersion: env.X402_ASSET_VERSION || "1",
    amount: env.X402_RWA_REPORT_AMOUNT || "10000000000"
  };

  return {
    ...config,
    configured: [config.facilitatorUrl, config.payTo, config.asset, config.assetName].every(Boolean)
  };
}

export function createCasperX402Middleware(env = process.env) {
  const config = casperX402Config(env);
  if (!config.configured) return { configured: false, config, middleware: null };

  const facilitator = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    createAuthHeaders: config.facilitatorApiKey
      ? async () => ({
          verify: { Authorization: `Bearer ${config.facilitatorApiKey}` },
          settle: { Authorization: `Bearer ${config.facilitatorApiKey}` },
          supported: { Authorization: `Bearer ${config.facilitatorApiKey}` }
        })
      : undefined
  });
  const resourceServer = registerExactCasperScheme(
    new x402ResourceServer(facilitator),
    { networks: [config.network] }
  );
  const routes = {
    "GET /api/x402/rwa-risk-report": {
      accepts: {
        scheme: "exact",
        network: config.network,
        payTo: config.payTo,
        price: {
          asset: config.asset,
          amount: config.amount,
          extra: { name: config.assetName, version: config.assetVersion }
        },
        maxTimeoutSeconds: 120
      },
      description: "Machine-readable RWA risk report for a permitted buyer agent.",
      mimeType: "application/json",
      serviceName: "AgentPay RWA Risk Report"
    }
  };

  return {
    configured: true,
    config,
    middleware: paymentMiddleware(routes, resourceServer, undefined, undefined, true)
  };
}
