import { Agent, type Connection, type WSMessage } from "agents";
import { withX402Client } from "agents/x402";
import type { Env } from "../server";
import { NETWORK, GUEST_WALLET_LOCATOR } from "../constants";
import type { PaymentRequirements } from "x402/types";
import { CrossmintWallets, createCrossmint, type Wallet } from "@crossmint/wallets-sdk";
import { createX402Signer, checkWalletDeployment, deployWallet } from "../x402Adapter";

/**
 * Guest Agent - Connects to Host MCP server and can pay for tools via x402
 * Uses Crossmint smart wallet to make payments
 */
export class Guest extends Agent<Env> {
  wallet!: Wallet<any>;
  confirmations: Record<string, (res: boolean) => void> = {};
  x402Client?: ReturnType<typeof withX402Client>;
  mcpConnected = false;
  mcpConnectionId?: string;
  mcpUrl?: string;
  hostWalletAddress?: string;

  /**
   * Handle payment confirmation popup
   */
  async onPaymentRequired(paymentRequirements: PaymentRequirements[]) {
    const confirmationId = crypto.randomUUID().slice(0, 8);

    // Extract and store Host wallet address from payment requirements
    if (paymentRequirements.length > 0 && paymentRequirements[0].payTo) {
      const hostAddress = paymentRequirements[0].payTo;
      if (hostAddress !== this.hostWalletAddress) {
        this.hostWalletAddress = hostAddress;
        console.log(`💼 Host wallet address discovered: ${hostAddress}`);

        // Check deployment status and send updated wallet info to UI
        const isDeployed = await checkWalletDeployment(this.wallet.address, "base-sepolia");

        this.broadcast(
          JSON.stringify({
            type: "wallet_info",
            guestAddress: this.wallet.address,
            hostAddress: this.hostWalletAddress,
            network: NETWORK,
            guestWalletDeployed: isDeployed
          })
        );
      }
    }

    // Send payment popup to UI
    this.broadcast(
      JSON.stringify({
        type: "payment_required",
        confirmationId,
        requirements: paymentRequirements
      })
    );

    // Wait for user confirmation
    const prom = new Promise<boolean>((res) => {
      this.confirmations[confirmationId] = res;
    });

    return await prom;
  }

  async onStart() {
    console.log("👤 Guest Agent starting...");

    // Initialize Crossmint SDK and create wallet with API key signer
    const crossmint = createCrossmint({
      apiKey: this.env.CROSSMINT_API_KEY
    });
    const crossmintWallets = CrossmintWallets.from(crossmint);

    // Create or get wallet using consistent locator
    const locator = GUEST_WALLET_LOCATOR;
    this.wallet = await crossmintWallets.createWallet({
      chain: "base-sepolia",
      signer: { type: "api-key" },
      owner: locator
    });

    console.log(`💰 Guest wallet created: ${this.wallet.address}`);
  }

  async onConnect(conn: Connection) {
    console.log("🔗 New connection established, sending wallet info");

    // Send wallet info to the new connection
    if (!this.wallet) {
      conn.send(JSON.stringify({
        type: "error",
        message: "Guest wallet not initialized"
      }));
      return;
    }

    // Check initial deployment status
    const isDeployed = await checkWalletDeployment(this.wallet.address, "base-sepolia");

    conn.send(JSON.stringify({
      type: "wallet_info",
      guestAddress: this.wallet.address,
      hostAddress: this.hostWalletAddress || "Will be retrieved from Host agent",
      network: NETWORK,
      guestWalletDeployed: isDeployed
    }));
  }

  async onMessage(conn: Connection, message: WSMessage) {
    if (typeof message !== "string") {
      console.log("⚠️ Non-string message received:", message);
      return;
    }

    console.log("📨 Guest received message:", message);

    try {
      const parsed = JSON.parse(message);
      console.log("📦 Parsed message type:", parsed.type);

      switch (parsed.type) {
        case "set_wallet": {
          // Receive wallet ADDRESS from client (not the full wallet object)
          console.log("💰 Receiving wallet address from client...");

          if (!parsed.walletAddress) {
            conn.send(JSON.stringify({
              type: "error",
              message: "No wallet address provided"
            }));
            return;
          }

          // Create a minimal wallet object with just the address for x402
          // The actual signing will be handled by client-side wallet
          this.wallet = {
            address: parsed.walletAddress,
            // Add other minimal properties needed
          } as any;

          console.log(`✅ Guest wallet address registered: ${this.wallet.address}`);

          // Send wallet info back to client
          const isDeployed = await checkWalletDeployment(this.wallet.address, "base-sepolia");
          conn.send(JSON.stringify({
            type: "wallet_info",
            guestAddress: this.wallet.address,
            hostAddress: this.hostWalletAddress || "Will be retrieved from Host agent",
            network: NETWORK,
            guestWalletDeployed: isDeployed
          }));
          break;
        }

        case "connect_mcp": {
          // Connect to Host MCP server
          let mcpUrl = parsed.url || "https://calendar-concierge.angela-temp.workers.dev/mcp";
          // Normalize to fully-qualified https URL if missing protocol
          if (typeof mcpUrl === "string" && !/^https?:\/\//i.test(mcpUrl)) {
            mcpUrl = `https://${mcpUrl}`;
          }

          // If already connected, just resend the tools list
          if (this.mcpConnected && this.x402Client) {
            console.log("🔄 Already connected to MCP, resending tools list");
            try {
              const tools = await this.x402Client.listTools({});
              conn.send(JSON.stringify({
                type: "mcp_connected",
                mcpUrl: this.mcpUrl || mcpUrl,
                tools: tools.tools.map(t => ({
                  name: t.name,
                  description: t.description,
                  isPaid: t.annotations?.paymentHint || false,
                  price: t.annotations?.paymentPriceUSD || null
                }))
              }));
              console.log(`✅ Resent tools list (${tools.tools.length} tools)`);
            } catch (error) {
              console.error("❌ Failed to resend tools:", error);
              conn.send(JSON.stringify({
                type: "error",
                message: `Failed to get tools: ${error instanceof Error ? error.message : String(error)}`
              }));
            }
            return;
          }

          try {
            console.log(`🔌 Connecting to MCP server at ${mcpUrl}...`);
            console.log(`📡 Using transport: auto (streamable-http → SSE fallback)`);

            // Retry logic for demo stability
            let id: string | undefined;
            let lastError: Error | undefined;

            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                console.log(`🔄 Connection attempt ${attempt}/3...`);
                const result = await this.mcp.connect(mcpUrl, {
                  transport: { type: "streamable-http" }
                });
                id = result.id;
                console.log(`✅ MCP connection established with ID: ${id}`);
                break;
              } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                console.warn(`⚠️  Attempt ${attempt} failed:`, lastError.message);
                if (attempt < 3) {
                  await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
              }
            }

            if (!id) {
              throw lastError || new Error("Failed to connect after 3 attempts");
            }

            // Wait for connection to be fully ready (discover completed)
            const waitForReady = async (connId: string, timeoutMs = 5000) => {
              const start = Date.now();
              while (Date.now() - start < timeoutMs) {
                const state = this.mcp.mcpConnections[connId]?.connectionState;
                if (state === "ready") return true;
                if (state === "failed") return false;
                await new Promise((r) => setTimeout(r, 150));
              }
              return this.mcp.mcpConnections[connId]?.connectionState === "ready";
            };

            let isReady = await waitForReady(id);

            if (!isReady) {
              const state = this.mcp.mcpConnections[id]?.connectionState;
              throw new Error(`MCP not ready (state: ${state || "unknown"}). Ensure the MCP server supports streamable-http transport.`);
            }

            // Build x402 client using Crossmint wallet
            if (!this.wallet) {
              conn.send(JSON.stringify({
                type: "error",
                message: "Guest wallet not initialized"
              }));
              return;
            }

            const x402Signer = createX402Signer(this.wallet);

            this.x402Client = withX402Client(this.mcp.mcpConnections[id].client, {
              network: NETWORK,
              account: x402Signer
            });

            this.mcpConnected = true;
            this.mcpConnectionId = id;
            this.mcpUrl = mcpUrl;

            // List available tools
            const tools = await this.x402Client.listTools({});

            conn.send(JSON.stringify({
              type: "mcp_connected",
              mcpUrl,
              tools: tools.tools.map(t => ({
                name: t.name,
                description: t.description,
                isPaid: t.annotations?.paymentHint || false,
                price: t.annotations?.paymentPriceUSD || null
              }))
            }));

            console.log(`✅ Connected to MCP at ${mcpUrl}! Found ${tools.tools.length} tools`);
          } catch (error) {
            console.error("❌ MCP connection failed:", error);
            conn.send(JSON.stringify({
              type: "error",
              message: `Failed to connect to MCP: ${error instanceof Error ? error.message : String(error)}`
            }));
          }
          break;
        }

        case "call_tool": {
          // Call an MCP tool
          if (!this.x402Client) {
            conn.send(JSON.stringify({ type: "error", message: "Not connected to MCP" }));
            return;
          }

          try {
            console.log(`🔧 Calling tool: ${parsed.tool} with args:`, parsed.arguments);

            const result = await this.x402Client.callTool(
              this.onPaymentRequired.bind(this),
              {
                name: parsed.tool,
                arguments: parsed.arguments || {}
              }
            );

            conn.send(JSON.stringify({
              type: result.isError ? "tool_error" : "tool_result",
              tool: parsed.tool,
              result: result.content[0]?.text || JSON.stringify(result)
            }));

            console.log(`✅ Tool result:`, result.isError ? "ERROR" : "SUCCESS");
          } catch (error) {
            console.error("❌ Tool call failed:", error);
            conn.send(JSON.stringify({
              type: "error",
              message: `Tool call failed: ${error instanceof Error ? error.message : String(error)}`
            }));
          }
          break;
        }

        case "confirm":
        case "cancel": {
          // Handle payment confirmation
          const confirmed = parsed.type === "confirm";

          // If payment is confirmed, check wallet deployment status
          if (confirmed && this.wallet) {
            try {
              console.log("💳 Payment confirmed! Checking wallet deployment status...");

              const isDeployed = await checkWalletDeployment(this.wallet.address, "base-sepolia");

              if (!isDeployed) {
                console.log("⚠️ Wallet is pre-deployed. Deploying wallet on-chain for settlement...");

                conn.send(JSON.stringify({
                  type: "info",
                  message: "Deploying wallet for settlement..."
                }));

                const deploymentTxHash = await deployWallet(this.wallet);

                console.log(`✅ Wallet deployed successfully! Tx: ${deploymentTxHash}`);

                // Broadcast updated wallet info with deployment status
                this.broadcast(
                  JSON.stringify({
                    type: "wallet_info",
                    guestAddress: this.wallet.address,
                    hostAddress: this.hostWalletAddress || "Will be retrieved from Host agent",
                    network: NETWORK,
                    guestWalletDeployed: true
                  })
                );

                conn.send(JSON.stringify({
                  type: "wallet_deployed",
                  txHash: deploymentTxHash,
                  message: "Wallet deployed for settlement"
                }));
              } else {
                console.log("✅ Wallet already deployed, proceeding with payment");
              }
            } catch (deployError) {
              console.error("❌ Wallet deployment failed:", deployError);

              conn.send(JSON.stringify({
                type: "warning",
                message: `Wallet deployment failed: ${deployError instanceof Error ? deployError.message : String(deployError)}. Payment may fail.`
              }));
            }
          }

          this.confirmations[parsed.confirmationId]?.(confirmed);

          conn.send(JSON.stringify({
            type: "payment_response",
            confirmed,
            confirmationId: parsed.confirmationId
          }));
          break;
        }
      }
    } catch (error) {
      console.error("❌ Message handling error:", error);
    }
  }
}
