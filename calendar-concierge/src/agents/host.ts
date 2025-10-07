import { McpAgent } from "agents/mcp";
import type { Connection, ConnectionContext } from "agents";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withX402, type X402Config } from "agents/x402";
import { z } from "zod";
import type { Env } from "../server";
import { NETWORK, USDC_BASE_SEPOLIA, FACILITATOR_URL } from "../constants";
import { CrossmintWallets, createCrossmint, type Wallet } from "@crossmint/wallets-sdk";
import { createSecretService } from "../shared/secretService";

interface StoredSecret {
  id: string;
  secret: string;
  amount: string;
  description: string;
  createdAt: number;
  retrievalCount: number;
}

/**
 * Host MCP Server - Provides paid secret storage and retrieval
 * Uses Crossmint smart wallet to receive payments
 */
export class Host extends McpAgent<Env, never, { urlSafeId?: string }> {
  wallet!: Wallet<any>;
  server!: ReturnType<typeof withX402>;
  userScopeId!: string; // The actual user ID (urlSafeId) for scoping secrets

  async onConnect(conn: Connection, ctx: ConnectionContext) {
    // Extract and persist userScopeId from the initial request header
    const scopeId = ctx.request.headers.get("x-user-scope-id");
    if (scopeId) {
      await this.ctx.storage.put("userScopeId", scopeId);
      console.log(`💾 Stored userScopeId from header: ${scopeId}`);
    }
    return super.onConnect(conn, ctx);
  }

  async init() {
    console.log("🏠 Host MCP Server initializing...");
    console.log(`📝 DO instance name: ${this.name}`);

    // Get userScopeId from DO storage (set on first connection)
    let userScopeId = await this.ctx.storage.get<string>("userScopeId");

    if (!userScopeId) {
      // Fallback to this.name for shared/legacy instances
      userScopeId = this.name;
      console.log(`⚠️ No userScopeId in storage; using DO name: ${userScopeId}`);
    } else {
      console.log(`✅ Using userScopeId from storage: ${userScopeId}`);
    }

    this.userScopeId = userScopeId;

    // Resolve x402 recipient per user
    let recipient: `0x${string}` | null = null;
    try {
      const userJson = await this.env.SECRETS.get(`usersByHash:${this.userScopeId}`);
      console.log(`🔍 Looking up user: usersByHash:${this.userScopeId}`, userJson ? "✅ Found" : "❌ Not found");

      if (userJson) {
        const parsed = JSON.parse(userJson);
        if (parsed?.walletAddress && /^0x[a-fA-F0-9]{40}$/.test(parsed.walletAddress)) {
          recipient = parsed.walletAddress as `0x${string}`;
          console.log(`💼 Using per-user recipient: ${recipient}`);
        }
      }
    } catch (err) {
      console.error("Error looking up user:", err);
    }

    // If no recipient found, create and store host wallet
    if (!recipient) {
      console.log("🔧 No host wallet found, creating new wallet...");

      const crossmint = createCrossmint({
        apiKey: this.env.CROSSMINT_API_KEY
      });
      const crossmintWallets = CrossmintWallets.from(crossmint);

      this.wallet = await crossmintWallets.createWallet({
        chain: "base-sepolia",
        signer: { type: "api-key" },
        owner: `userId:crossmint-merchant-host:${this.userScopeId}`
      });

      recipient = this.wallet.address as `0x${string}`;

      // Store wallet address in KV using userScopeId
      await this.env.SECRETS.put(
        `usersByHash:${this.userScopeId}`,
        JSON.stringify({ walletAddress: recipient, userId: this.userScopeId })
      );

      console.log(`💰 Host wallet created and stored: ${recipient}`);
    }

    // Initialize MCP server with x402 payment support (recipient = user's wallet)
    const X402_CONFIG: X402Config = {
      network: NETWORK,
      recipient,
      facilitator: { url: FACILITATOR_URL }
    };

    this.server = withX402(
      new McpServer({
        name: "SecretVault",
        version: "1.0.0"
      }),
      X402_CONFIG
    );

    console.log("✅ MCP Server created with x402 support");

    // ==========================================
    // FREE TOOLS
    // ==========================================

    // Initialize shared secret service scoped to this DO's KV
    const secretService = createSecretService({ kv: this.env.SECRETS });

    // Store a secret (free)
    this.server.tool(
      "storeSecret",
      "Store a secret with a payment requirement. Returns a secret ID.",
      {
        secret: z.string().describe("The secret data to store"),
        amount: z.string().describe("Price in USD (e.g., '0.05')"),
        description: z.string().describe("What this secret is for")
      },
      async ({ secret, amount, description }) => {
        const stored = await secretService.storeSecret({
          userScopeId: this.userScopeId,
          secret,
          amount,
          description
        });

        console.log(`✅ Secret stored by ${this.userScopeId}: ${stored.id} for $${amount}`);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              secretId: stored.id,
              amount,
              description,
              owner: this.userScopeId,
              message: `Secret stored! ID: ${stored.id}. Costs $${amount} to retrieve.`
            }, null, 2)
          }]
        };
      }
    );

    // List all secrets (free preview)
    this.server.tool(
      "listSecrets",
      "List all stored secrets (shows metadata only, not the actual secrets)",
      {},
      async () => {
        const secretList = await secretService.listSecrets({ userScopeId: this.userScopeId });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              secrets: secretList,
              count: secretList.length,
              message: secretList.length > 0
                ? `Found ${secretList.length} secret(s)`
                : "No secrets stored yet"
            }, null, 2)
          }]
        };
      }
    );

    // ==========================================
    // PAID TOOLS (x402 protected)
    // ==========================================

    // Retrieve a secret (PAID - requires x402 payment)
    this.server.paidTool(
      "retrieveSecret",
      "Retrieve a secret by its ID. Requires payment via x402.",
      0.05, // USD - this will be overridden by the secret's actual price
      {
        secretId: z.string().describe("The secret ID to retrieve")
      },
      {},
      async ({ secretId }) => {
        const stored = await secretService.retrieveSecret({ userScopeId: this.userScopeId, secretId });

        if (!stored) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Secret not found",
                message: `Secret ${secretId} not found in ${this.userScopeId}'s storage`
              })
            }]
          };
        }

        console.log(`🔓 Secret retrieved by ${this.userScopeId}: ${secretId} (retrieval #${stored.retrievalCount})`);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              secret: stored.secret,
              description: stored.description,
              retrievalCount: stored.retrievalCount,
              owner: this.userScopeId,
              message: `Secret retrieved successfully! This is retrieval #${stored.retrievalCount}.`
            }, null, 2)
          }]
        };
      }
    );

    console.log("✅ Host MCP Server initialized with tools:");
    console.log("   - storeSecret (free)");
    console.log("   - listSecrets (free)");
    console.log("   - retrieveSecret (paid: $0.05)");
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal endpoint for authenticated secret storage
    if (url.pathname === "/store-secret" && request.method === "POST") {
      try {
        const body = await request.json() as { secretName: string, secretValue: string };
        const { secretName, secretValue } = body;

        if (!secretName || !secretValue) {
          return Response.json(
            { error: "Missing secretName or secretValue" },
            { status: 400 }
          );
        }

        // Store secret using the shared service
        const stored = await createSecretService({ kv: this.env.SECRETS }).storeSecret({
          userScopeId: this.userScopeId,
          secret: secretValue,
          amount: "0.05",
          description: secretName
        });

        console.log(`🔐 Secret stored via API by ${this.userScopeId}: ${secretName} (${stored.id})`);

        return Response.json({
          success: true,
          secretId: stored.id,
          secretName,
          message: "Secret stored successfully"
        });

      } catch (error) {
        console.error("Error storing secret:", error);
        return Response.json(
          { error: "Failed to store secret", message: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    }

    // For all other requests (including WebSocket upgrades for MCP), delegate to parent Agent
    return super.fetch(request);
  }
}
