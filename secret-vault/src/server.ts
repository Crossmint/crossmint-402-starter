import { routeAgentRequest, getAgentByName } from "agents";
import { Host } from "./agents/host";
import { Guest } from "./agents/guest";

export type Env = {
  OPENAI_API_KEY: string;
  CROSSMINT_API_KEY: string; // Client API key (ck_) for email OTP
  CROSSMINT_SERVER_KEY?: string; // Server API key (sk_) for Host wallet
  GUEST_PRIVATE_KEY: string;
  HOST_WALLET_ADDRESS: string;
  SECRETS: KVNamespace;
  ASSETS?: Fetcher; // Optional - only used in wrangler dev, not vite dev
  Host: DurableObjectNamespace;
  Guest: DurableObjectNamespace<Guest>;
};

export { Host, Guest };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Basic CORS headers for API endpoints
    const requestAllowHeaders = request.headers.get("access-control-request-headers");
    const allowHeaders = requestAllowHeaders
      ? `${requestAllowHeaders}, Content-Type, content-type, Authorization, authorization, X-Requested-With`
      : "Content-Type, content-type, Authorization, authorization, X-Requested-With";
    const originHeader = request.headers.get("Origin") || "*";
    const CORS_HEADERS: Record<string, string> = {
      "Access-Control-Allow-Origin": originHeader,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      // Include requested headers plus a safe baseline
      "Access-Control-Allow-Headers": allowHeaders,
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin, Access-Control-Request-Headers"
    };

    // Handle global preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Serve assets for root and static files first (only in wrangler dev with ASSETS binding)
    if (
      env.ASSETS &&
      (url.pathname === "/" ||
      url.pathname.startsWith("/src/") ||
      url.pathname.startsWith("/assets/") ||
      url.pathname === "/my-mcp.html")
    ) {
      return env.ASSETS.fetch(request);
    }

    // MCP server metadata endpoint
    if (url.pathname === "/mcp/info") {
      const { NETWORK, FACILITATOR_URL } = await import("./constants");
      return new Response(JSON.stringify({
        name: "SecretVault",
        version: "1.0.0",
        description: "Paid secret storage with x402 payments",
        transport: "streamable-http",
        endpoints: {
          shared: `${url.origin}/mcp`,
          perUser: `${url.origin}/mcp/users/{userId}`,
          sseShared: `${url.origin}/mcp/sse`,
          register: `${url.origin}/api/users/mcp`
        },
        tools: [
          { name: "storeSecret", description: "Store a secret with payment requirement", paid: false },
          { name: "listSecrets", description: "List all stored secrets (metadata only)", paid: false },
          { name: "retrieveSecret", description: "Retrieve a secret by ID (requires payment)", paid: true, price: "$0.05" }
        ],
        payment: {
          protocol: "x402",
          network: NETWORK,
          token: "USDC",
          facilitator: FACILITATOR_URL
        }
      }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    // Host MCP server endpoint (shared instance). Exclude SSE paths handled below
    if (
      url.pathname.startsWith("/mcp") &&
      !url.pathname.startsWith("/mcp/users/") &&
      !url.pathname.startsWith("/mcp/sse")
    ) {
      try {
        return await Host.serve("/mcp", { binding: "Host" }).fetch(request, env, ctx);
      } catch (error) {
        console.error("MCP server error:", error);
        return new Response(
          JSON.stringify({
            error: "MCP server error",
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // Personal MCP endpoint per user (Streamable HTTP transport)
    // Use serve() method which creates proper handler for each path
    if (url.pathname.startsWith("/mcp/users/")) {
      try {
        const pathParts = url.pathname.split("/").filter(Boolean);
        const urlSafeId = pathParts[2] ? decodeURIComponent(pathParts[2]) : null;

        if (!urlSafeId) {
          return new Response(
            JSON.stringify({ error: "User ID required" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        // Handle CORS preflight for MCP endpoints
        if (request.method === "OPTIONS") {
          const origin = request.headers.get("Origin") || "*";
          const requestedHeaders = request.headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization, X-Requested-With, x-user-scope-id";
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": requestedHeaders,
              "Access-Control-Max-Age": "86400",
              "Vary": "Origin, Access-Control-Request-Headers"
            }
          });
        }

        // Look up user by urlSafeId (hash)
        const user = await env.SECRETS.get(`usersByHash:${urlSafeId}`, { type: "json" }) as { userId?: string, walletAddress?: string } | null;
        if (!user?.walletAddress) {
          return new Response(
            JSON.stringify({ error: "User not found", urlSafeId }),
            { status: 404, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        console.log(`🔀 Routing to user MCP: ${user.userId} (${urlSafeId})`);
        console.log(`📨 Request method: ${request.method}, URL: ${url.pathname}`);
        // Log a simple subset of headers to avoid typing issues
        const hdrs: Record<string, string> = {};
        request.headers.forEach((v, k) => (hdrs[k] = v));
        console.log(`📨 Headers:`, hdrs);

        // CRITICAL: Pass urlSafeId via custom header so Host DO can extract it
        // Host.serve() creates session-based DOs, but we need per-user scoping
        // Solution: inject urlSafeId as a header that the DO can read
        const headers = new Headers(request.headers);
        headers.set("x-user-scope-id", urlSafeId);
        const scopedRequest = new Request(request.url, {
          method: request.method,
          headers,
          body: request.body
        });

        const response = await Host.serve(`/mcp/users/${urlSafeId}`, { binding: "Host" }).fetch(scopedRequest, env, ctx);
        console.log(`✅ Host response status: ${response.status}`);

        // Add CORS headers to MCP response
        const corsHeaders = new Headers(response.headers);
        corsHeaders.set("Access-Control-Allow-Origin", "*");
        corsHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        corsHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, x-user-scope-id");

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: corsHeaders
        });
      } catch (error) {
        console.error("Per-user MCP error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to route to user MCP server",
            message: error instanceof Error ? error.message : String(error)
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
    }

    // =========================================================
    // SSE MCP endpoints (direct to DO, not gateway)
    // =========================================================
    // Note: SSE gateway with DO-to-DO WS has known issues
    // Use streamable-http for per-user; SSE only for shared endpoint
    if (url.pathname === "/mcp/sse") {
      // Shared SSE endpoint only
      try {
        return await Host.serve("/mcp", { binding: "Host", transport: "sse" }).fetch(request, env, ctx);
      } catch (error) {
        console.error("SSE shared MCP error:", error);
        return new Response(
          JSON.stringify({
            error: "SSE MCP error",
            message: error instanceof Error ? error.message : String(error)
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
    }

    // API to register user's MCP mapping (authenticated via Crossmint wallet)
    if (url.pathname === "/api/users/mcp" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => ({} as any))) as Partial<{ walletAddress: string; userId: string }>;
        const { walletAddress, userId } = body;

        // Validate input
        if (
          !userId ||
          !walletAddress ||
          typeof userId !== "string" ||
          typeof walletAddress !== "string" ||
          !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)
        ) {
          return new Response(
            JSON.stringify({ error: "Invalid body. Required: userId (string) and walletAddress (0x...)" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        // Create URL-safe identifier from userId
        // Hash the userId to avoid special characters in URL paths
        const encoder = new TextEncoder();
        const data = encoder.encode(userId);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const urlSafeId = hashHex.substring(0, 16); // Use first 16 chars for shorter URLs

        // Check if user already exists (check both original userId and urlSafeId)
        let existingUser = await env.SECRETS.get(`users:${userId}`, { type: "json" }) as { walletAddress?: string, urlSafeId?: string, userId?: string } | null;
        if (!existingUser) {
          // Also check by urlSafeId in case of lookup
          existingUser = await env.SECRETS.get(`usersByHash:${urlSafeId}`, { type: "json" }) as { walletAddress?: string, urlSafeId?: string, userId?: string } | null;
        }
        if (existingUser) {
          // User exists - verify wallet matches
          if (existingUser.walletAddress !== walletAddress) {
            return new Response(
              JSON.stringify({
                error: "User already exists with different wallet address",
                existingWallet: existingUser.walletAddress
              }),
              { status: 409, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
            );
          }

          // User exists with same wallet - migrate if needed and return existing MCP URL
          const workerHost = request.headers.get("cf-worker");
          const origin = workerHost ? `https://${workerHost}` : new URL(request.url).origin;
          const existingUrlSafeId = existingUser.urlSafeId || urlSafeId;

          // Migrate old users: add urlSafeId and usersByHash mapping if missing
          if (!existingUser.urlSafeId) {
            const migratedRecord = {
              userId: existingUser.userId || userId,
              walletAddress: existingUser.walletAddress,
              urlSafeId: existingUrlSafeId,
              createdAt: (existingUser as any).createdAt || Date.now(),
              createdBy: (existingUser as any).createdBy || "crossmint-auth"
            };
            await env.SECRETS.put(`users:${userId}`, JSON.stringify(migratedRecord));
            await env.SECRETS.put(`usersByHash:${existingUrlSafeId}`, JSON.stringify(migratedRecord));
            console.log(`🔄 Migrated user: ${userId} → ${existingUrlSafeId}`);
          }

          return new Response(JSON.stringify({
            name: userId,
            mcpUrl: `${origin}/mcp/users/${existingUrlSafeId}`,
            walletAddress,
            urlSafeId: existingUrlSafeId,
            message: "MCP already exists"
          }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
        }

        // Create new user with both mappings
        const userRecord = {
          userId,
          walletAddress,
          urlSafeId,
          createdAt: Date.now(),
          createdBy: "crossmint-auth"
        };

        // Store by original userId
        await env.SECRETS.put(`users:${userId}`, JSON.stringify(userRecord));

        // Store by urlSafeId for reverse lookup
        await env.SECRETS.put(`usersByHash:${urlSafeId}`, JSON.stringify(userRecord));

        const workerHost = request.headers.get("cf-worker");
        const origin = workerHost ? `https://${workerHost}` : new URL(request.url).origin;
        console.log(`✅ User MCP created: ${userId} → ${walletAddress} (${urlSafeId})`);

        return new Response(JSON.stringify({
          name: userId,
          mcpUrl: `${origin}/mcp/users/${urlSafeId}`,
          walletAddress,
          urlSafeId,
          message: "MCP created successfully"
        }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      } catch (error) {
        console.error("Registration error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to create MCP",
            message: error instanceof Error ? error.message : String(error)
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
    }

    // API to store a secret (authenticated - only MCP owner)
    if (url.pathname === "/api/users/secrets" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => ({} as any))) as Partial<{ userId: string; walletAddress: string; secretName: string; secretValue: string }>;
        const { userId, walletAddress, secretName, secretValue } = body;

        // Validate input
        if (
          !userId ||
          !walletAddress ||
          !secretName ||
          !secretValue ||
          typeof userId !== "string" ||
          typeof walletAddress !== "string" ||
          typeof secretName !== "string" ||
          typeof secretValue !== "string"
        ) {
          return new Response(
            JSON.stringify({
              error: "Invalid body. Required: userId (string), walletAddress (string), secretName (string), secretValue (string)"
            }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        // Verify user exists and wallet matches (authentication)
        const user = await env.SECRETS.get(`users:${userId}`, { type: "json" }) as { walletAddress?: string, urlSafeId?: string } | null;
        if (!user) {
          return new Response(
            JSON.stringify({ error: "User not found. Please register first at /api/users/mcp" }),
            { status: 404, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        if (user.walletAddress !== walletAddress) {
          return new Response(
            JSON.stringify({ error: "Unauthorized. Wallet address does not match MCP owner." }),
            { status: 403, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }

        // Create URL-safe identifier for routing to the correct DO
        const encoder = new TextEncoder();
        const data = encoder.encode(userId);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const urlSafeId = hashHex.substring(0, 16);

        // Store secret directly using the urlSafeId as the key prefix (same as Host DO does)
        const secretId = crypto.randomUUID();
        const stored = {
          id: secretId,
          secret: secretValue,
          amount: "0.05", // Default price
          description: secretName,
          createdAt: Date.now(),
          retrievalCount: 0
        };

        // Scope secret to the user's DO instance using urlSafeId (matches Host.name)
        const secretKey = `${urlSafeId}:secrets:${secretId}`;
        await env.SECRETS.put(secretKey, JSON.stringify(stored));

        console.log(`🔐 Secret stored for user ${userId}: ${secretName} (${secretId})`);
        return new Response(JSON.stringify({
          success: true,
          secretId,
          secretName,
          message: "Secret stored successfully"
        }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

      } catch (error) {
        console.error("Store secret error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to store secret",
            message: error instanceof Error ? error.message : String(error)
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
    }

    // Route all agent requests with CORS enabled (handles OPTIONS)
    return (
      (await routeAgentRequest(request, env, { cors: true })) ||
      (env.ASSETS ? await env.ASSETS.fetch(request) : null) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
