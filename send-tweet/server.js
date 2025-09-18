import express from "express";
import { JsonRpcProvider, Contract, Interface } from "ethers";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { TwitterApi } from "twitter-api-v2";

// x402 extension constants per spec
const X402_EXTENSION_URI = "https://github.com/google-a2a/a2a-x402/v0.1";
const X402_STATUS_KEY = "x402.payment.status";
const X402_REQUIRED_KEY = "x402.payment.required";
const X402_PAYLOAD_KEY = "x402.payment.payload";
const X402_RECEIPTS_KEY = "x402.payment.receipts";
const X402_ERROR_KEY = "x402.payment.error";

// Merchant/token configuration (env configurable)
const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS; // the payee/recipient
const ASSET_ADDRESS = process.env.ASSET_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // usdc on base sepolia
const X402_NETWORK = process.env.X402_NETWORK || "base-sepolia"; // e.g., "base" or "base-sepolia"
const PRICE_USDC = process.env.PRICE_USDC || "1"; // decimal string, e.g., "1" or "1.50"
const PRICE_ATOMIC = process.env.PRICE_ATOMIC; // optional override in atomic units string
const MAX_TIMEOUT_SECONDS = parseInt(process.env.MAX_TIMEOUT_SECONDS || "600", 10);

// On-chain verification configuration
const RPC_URL = process.env.RPC_URL; // e.g. Base mainnet/sepolia RPC

// Twitter API configuration
const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

// Default image URL (optional)
const DEFAULT_IMAGE_URL = "https://photographylife.com/wp-content/uploads/2023/05/Nikon-Z8-Official-Samples-00016.jpg";

const ERC20_METADATA_ABI = [
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function decimals() view returns (uint8)"
];
const ERC20_TRANSFER_IFACE = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

async function getDomain(provider, tokenAddress) {
  const net = await provider.getNetwork();
  const token = new Contract(tokenAddress, ERC20_METADATA_ABI, provider);
  let name = "USD Coin";
  let version = "2";
  try {
    name = await token.name();
  } catch (e) {
    console.warn(`[server] Failed to fetch token name for ${tokenAddress}. Using default.`, e?.message || e);
  }
  try {
    const v = await token.version();
    if (typeof v === "string" && v.length > 0) version = v;
  } catch (e) {
    console.warn(`[server] Failed to fetch token version for ${tokenAddress}. Using default.`, e?.message || e);
  }
  return {
    name,
    version,
    chainId: Number(net.chainId),
    verifyingContract: tokenAddress,
  };
}

function decimalToAtomic(decimalStr, decimals) {
  const [whole, frac = ""] = String(decimalStr).split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fracPadded}`.replace(/^0+/, "");
  return combined.length ? combined : "0";
}

async function getTokenDecimals(provider, tokenAddress, fallbackDecimals) {
  try {
    const token = new Contract(tokenAddress, ERC20_METADATA_ABI, provider);
    const d = await token.decimals();
    const n = Number(d);
    if (!Number.isNaN(n) && n > 0 && n < 255) return n;
  } catch (e) {
    console.warn(`[server] Could not fetch token decimals for ${tokenAddress}, using fallback.`, e?.message || e);
  }
  return fallbackDecimals;
}

// Helper function to ensure URL has protocol
function ensureProtocol(url) {
  if (!url) return "http://localhost:10001";
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

// Create a minimal AgentCard advertising the x402 extension
const agentCard = {
  name: "Tweet Agent",
  description: "Agent that sends tweets on X/Twitter for payment",
  url: ensureProtocol(process.env.AGENT_URL),
  version: "0.1.0",
  defaultInputModes: ["text", "text/plain"],
  defaultOutputModes: ["text", "text/plain"],
  capabilities: {
    streaming: true,
    extensions: [
      {
        uri: X402_EXTENSION_URI,
        description: "Supports payments using the x402 protocol for on-chain settlement.",
        required: true,
      },
    ],
  },
};

// Initialize Twitter client
function createTwitterClient() {
  if (!TWITTER_CONSUMER_KEY || !TWITTER_CONSUMER_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
    console.error("[server] Twitter API credentials are required. Set TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET in your environment.");
    return null;
  }

  return new TwitterApi({
    appKey: TWITTER_CONSUMER_KEY,
    appSecret: TWITTER_CONSUMER_SECRET,
    accessToken: TWITTER_ACCESS_TOKEN,
    accessSecret: TWITTER_ACCESS_TOKEN_SECRET,
  });
}

// Download image and upload to Twitter
async function downloadAndUploadImage(twitterClient, imageUrl) {
  try {
    console.log("[server] downloading image from:", imageUrl);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    console.log("[server] image downloaded, size:", imageBuffer.length, "bytes");

    console.log("[server] uploading image to Twitter");
    const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' });
    console.log("[server] image uploaded to Twitter, media ID:", mediaId);

    return mediaId;
  } catch (error) {
    console.error("[server] failed to download/upload image:", error);
    throw error;
  }
}

// Simple executor that triggers payment for any request and sends tweets
class MerchantExecutor {
  constructor(provider, signer) {
    this.provider = provider;
    this.signer = signer;
    this.twitterClient = createTwitterClient();
    this.taskContent = new Map(); // Store original content for each task
  }

  async execute(requestContext, eventBus) {
    const { taskId, contextId, userMessage } = requestContext;
    const meta = (userMessage && userMessage.metadata) || {};

    console.log("[server] execute start", {
      taskId,
      contextId,
      status: meta[X402_STATUS_KEY] || null,
      hasPayload: Boolean(meta[X402_PAYLOAD_KEY]),
    });

    if (meta[X402_STATUS_KEY] === "payment-submitted" && taskId) {
      console.log("[server] payment-submitted received", {
        taskId,
        contextId,
      });

      // Extract direct-transfer fields from payload
      const payload = meta[X402_PAYLOAD_KEY];
      const submitted = payload?.payload || {};
      const asset = (submitted.asset || ASSET_ADDRESS || "").toLowerCase();
      const payer = (submitted.payer || "").toLowerCase();
      const to = (submitted.payTo || MERCHANT_ADDRESS || "").toLowerCase();
      const value = String(submitted.value || "");
      const txHash = submitted.transaction;
      if (!txHash || !payer || !to || !value || !asset) {
        console.error("[server] missing required direct-transfer fields in payload");
        eventBus.publish({
          kind: "status-update",
          taskId,
          contextId,
          status: {
            state: "failed",
            message: {
              kind: "message",
              role: "agent",
              parts: [{ kind: "text", text: "Payment verification failed: invalid payload." }],
              metadata: { [X402_STATUS_KEY]: "payment-failed", [X402_ERROR_KEY]: "INVALID_PAYLOAD" },
            },
            timestamp: new Date().toISOString(),
          },
          final: true,
        });
        eventBus.finished();
        return;
      }

      // Publish payment-pending while verifying on-chain
      eventBus.publish({
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "working",
          message: {
            kind: "message",
            role: "agent",
            parts: [{ kind: "text", text: "Verifying on-chain payment..." }],
            metadata: { [X402_STATUS_KEY]: "payment-pending" },
          },
        },
        final: false,
      });
      console.log("[server] payment-pending published", { taskId });

      if (!this.provider) {
        console.error("[server] RPC_URL not set. Cannot verify on-chain.");
        eventBus.publish({
          kind: "status-update",
          taskId,
          contextId,
          status: {
            state: "failed",
            message: {
              kind: "message",
              role: "agent",
              parts: [{ kind: "text", text: "Verification configuration missing (RPC_URL)." }],
              metadata: { [X402_STATUS_KEY]: "payment-failed", [X402_ERROR_KEY]: "VERIFICATION_FAILED" },
            },
            timestamp: new Date().toISOString(),
          },
          final: true,
        });
        eventBus.finished();
        return;
      }

      // Verify transaction receipt and Transfer event
      let mined;
      try {
        mined = await this.provider.getTransactionReceipt(txHash);
      } catch (e) {
        console.error("[server] failed to fetch receipt", e?.message || e);
      }
      if (!mined || mined.status !== 1) {
        console.error("[server] receipt missing or failed", { txHash, status: mined?.status });
        eventBus.publish({
          kind: "status-update",
          taskId,
          contextId,
          status: {
            state: "failed",
            message: {
              kind: "message",
              role: "agent",
              parts: [{ kind: "text", text: "Payment verification failed: transaction not successful." }],
              metadata: { [X402_STATUS_KEY]: "payment-failed", [X402_ERROR_KEY]: "TX_FAILED" },
            },
            timestamp: new Date().toISOString(),
          },
          final: true,
        });
        eventBus.finished();
        return;
      }

      // Find matching Transfer event from the token contract
      const wantedToken = asset.toLowerCase();
      const logs = mined.logs || [];
      let matched = false;
      for (const log of logs) {
        if (!log || String(log.address || '').toLowerCase() !== wantedToken) continue;
        let parsed;
        try {
          parsed = ERC20_TRANSFER_IFACE.parseLog({ topics: log.topics, data: log.data });
        } catch (_e) {}
        if (parsed && parsed.name === "Transfer") {
          const fromEv = String(parsed.args[0]).toLowerCase();
          const toEv = String(parsed.args[1]).toLowerCase();
          const valueEv = String(parsed.args[2]);
          if (fromEv === payer && toEv === to && valueEv === String(value)) {
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        console.error("[server] Transfer log not found or mismatch", { txHash });
        eventBus.publish({
          kind: "status-update",
          taskId,
          contextId,
          status: {
            state: "failed",
            message: {
              kind: "message",
              role: "agent",
              parts: [{ kind: "text", text: "Payment verification failed: transfer mismatch." }],
              metadata: { [X402_STATUS_KEY]: "payment-failed", [X402_ERROR_KEY]: "TRANSFER_MISMATCH" },
            },
            timestamp: new Date().toISOString(),
          },
          final: true,
        });
        eventBus.finished();
        return;
      }

      // Append receipts history
      const prevReceipts = requestContext?.task?.status?.message?.metadata?.[X402_RECEIPTS_KEY] || [];
      const receipt = {
        success: true,
        transaction: mined?.transactionHash || txHash,
        network: X402_NETWORK,
        payer,
      };

      // Working update with completed payment and receipt
      eventBus.publish({
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "working",
          message: {
            kind: "message",
            role: "agent",
            parts: [{ kind: "text", text: "Payment successful. Processing your tweet..." }],
            metadata: {
              [X402_STATUS_KEY]: "payment-completed",
              [X402_RECEIPTS_KEY]: [...prevReceipts, receipt],
            },
          },
        },
        final: false,
      });
      console.log("[server] published working with payment-completed", { taskId });

      // Extract tweet text and image URL from stored task content
      const storedContent = this.taskContent.get(taskId);
      const tweetText = storedContent?.tweetText;
      const imageUrl = storedContent?.imageUrl;

      if (!tweetText) {
        console.error("[server] no tweet text available for task:", taskId);
        eventBus.publish({
          kind: "status-update",
          taskId,
          contextId,
          status: {
            state: "failed",
            message: {
              kind: "message",
              role: "agent",
              parts: [{ kind: "text", text: "Payment successful but no tweet text available." }],
              metadata: { [X402_STATUS_KEY]: "payment-completed", [X402_ERROR_KEY]: "NO_TEXT_PROVIDED" },
            },
            timestamp: new Date().toISOString(),
          },
          final: true,
        });
        eventBus.finished();
        return;
      }

      // Send the tweet with optional image
      let tweetResult = null;
      let tweetError = null;
      if (this.twitterClient) {
        try {
          let tweetOptions = {};

          // Upload image if provided
          if (imageUrl) {
            console.log("[server] sending tweet with image:", tweetText);
            const mediaId = await downloadAndUploadImage(this.twitterClient, imageUrl);
            tweetOptions.media = { media_ids: [mediaId] };
          } else {
            console.log("[server] sending text-only tweet:", tweetText);
          }

          // Send tweet (with or without image)
          tweetResult = await this.twitterClient.v2.tweet(tweetText, tweetOptions);
          console.log("[server] tweet sent successfully:", tweetResult.data);
        } catch (error) {
          console.error("[server] failed to send tweet:", error);

          // Provide more specific error messages for common issues
          if (error.code === 403) {
            tweetError = "Twitter API permission denied (403). Check your app has 'Read and Write' permissions and elevated access.";
          } else if (error.code === 401) {
            tweetError = "Twitter API authentication failed (401). Verify your API keys and tokens.";
          } else if (error.code === 429) {
            tweetError = "Twitter API rate limit exceeded (429). Please try again later.";
          } else {
            tweetError = `Twitter API error (${error.code || 'unknown'}): ${error.message || error}`;
          }
        }
      } else {
        tweetError = "Twitter API client not initialized. Check your credentials.";
      }

      // Final completion (include payment metadata, receipts, and tweet result)
      let completionMessage;
      let artifacts = [];

      if (tweetResult) {
        completionMessage = imageUrl
          ? `Tweet with image sent successfully! Tweet ID: ${tweetResult.data.id}`
          : `Tweet sent successfully! Tweet ID: ${tweetResult.data.id}`;
        artifacts = [{
          kind: "artifact",
          type: "application/json",
          title: "Tweet Result",
          content: JSON.stringify(tweetResult.data, null, 2),
        }];
      } else {
        completionMessage = imageUrl
          ? `Payment successful but failed to send tweet with image: ${tweetError}`
          : `Payment successful but failed to send tweet: ${tweetError}`;
      }

      eventBus.publish({
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "completed",
          message: {
            kind: "message",
            role: "agent",
            parts: [{ kind: "text", text: completionMessage }],
            metadata: {
              [X402_STATUS_KEY]: "payment-completed",
              [X402_RECEIPTS_KEY]: [...prevReceipts, receipt],
            },
          },
          timestamp: new Date().toISOString(),
        },
        artifacts: artifacts,
        final: true,
      });
      console.log("[server] published completed with receipt and tweet result", { receipt, tweetResult });
      eventBus.finished();
      return;
    }

    console.log("[server] publishing payment-required", { taskId, contextId });

    // Store the original message content for later use
    if (userMessage) {
      let tweetText = null;
      let imageUrl = null;

      // Extract tweet text from message parts (REQUIRED)
      if (userMessage.parts && userMessage.parts.length > 0) {
        const textPart = userMessage.parts.find(part => part.kind === "text");
        if (textPart && textPart.text && textPart.text.trim()) {
          tweetText = textPart.text.trim();
        }
      }

      // Validate that tweet text is provided
      if (!tweetText) {
        console.error("[server] no tweet text provided");
        eventBus.publish({
          kind: "status-update",
          taskId,
          contextId,
          status: {
            state: "failed",
            message: {
              kind: "message",
              role: "agent",
              parts: [{ kind: "text", text: "No tweet text provided. Please provide text to tweet." }],
              metadata: { [X402_ERROR_KEY]: "NO_TEXT_PROVIDED" },
            },
            timestamp: new Date().toISOString(),
          },
          final: true,
        });
        eventBus.finished();
        return;
      }

      // Extract image URL from metadata (OPTIONAL)
      if (userMessage.metadata && userMessage.metadata.imageUrl) {
        imageUrl = userMessage.metadata.imageUrl;
      }

      this.taskContent.set(taskId, { tweetText, imageUrl });
      console.log("[server] stored task content", { taskId, tweetText, imageUrl: imageUrl || "none" });
    }

    // Default path: require payment first — publish a Task and finish
    // Prepare EIP-712 domain for the token so the client can sign with the exact same fields
    let domainForClient = undefined;
    let tokenDecimals = 6;
    try {
      if (this.provider) {
        domainForClient = await getDomain(this.provider, ASSET_ADDRESS);
        tokenDecimals = await getTokenDecimals(this.provider, ASSET_ADDRESS, 6);
      }
    } catch (e) {
      console.warn("[server] failed to derive token domain; client will use defaults", e?.message || e);
    }

    // Compute required amount in atomic units
    const requiredAtomic = PRICE_ATOMIC || decimalToAtomic(PRICE_USDC, tokenDecimals);

    // Persist per-task expected payment details for later verification
    this.taskContent.set(taskId, {
      ...(this.taskContent.get(taskId) || {}),
      requiredAtomic,
      asset: ASSET_ADDRESS.toLowerCase(),
      payTo: MERCHANT_ADDRESS.toLowerCase(),
      network: X402_NETWORK,
    });

    eventBus.publish({
      kind: "task",
      id: taskId,
      contextId,
      status: {
        state: "input-required",
        message: {
          kind: "message",
          role: "agent",
          parts: [{ kind: "text", text: "Payment is required to send your tweet." }],
          metadata: {
            [X402_STATUS_KEY]: "payment-required",
            [X402_REQUIRED_KEY]: {
              x402Version: 1,
              accepts: [
                {
                  scheme: "direct-transfer",
                  network: X402_NETWORK,
                  resource: "https://api.x.com/2/tweets",
                  description: "Send a tweet on X/Twitter",
                  mimeType: "application/json",
                  outputSchema: {},
                  asset: ASSET_ADDRESS,
                  payTo: MERCHANT_ADDRESS,
                  maxAmountRequired: requiredAtomic,
                  maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
                  extra: {},
                },
              ],
            },
          },
        },
      },
    });
    eventBus.finished();
    console.log("[server] published input-required and finished", { taskId, contextId });
  }

  async cancelTask(taskId, eventBus) {
    // contextId is not available here; publish without it
    console.log("[server] cancelTask", { taskId });
    eventBus.publish({
      kind: "status-update",
      taskId,
      status: { state: "canceled", timestamp: new Date().toISOString() },
      final: true,
    });
    eventBus.finished();
    console.log("[server] cancellation published", { taskId });
  }
}

async function main() {
  // Validate critical configuration before starting the server
  if (!RPC_URL) {
    console.error("[server] RPC_URL is required for verification. Set it in your environment.");
    process.exit(1);
  }
  if (!MERCHANT_ADDRESS) {
    console.error("[server] MERCHANT_ADDRESS is required. Set MERCHANT_ADDRESS in your environment.");
    process.exit(1);
  }

  // Warn if Twitter credentials are missing
  if (!TWITTER_CONSUMER_KEY || !TWITTER_CONSUMER_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
    console.warn("[server] Twitter API credentials are missing. Tweets will not be sent. Set TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET in your environment.");
  }

  const app = express();
  app.use(express.json());
  // CORS + extension activation headers and OPTIONS preflight handling
  app.use((req, res, next) => {
    const origin = process.env.CORS_ORIGIN || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-A2A-Extensions");
    res.setHeader("X-A2A-Extensions", X402_EXTENSION_URI);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  const taskStore = new InMemoryTaskStore();
  const sharedProvider = RPC_URL ? new JsonRpcProvider(RPC_URL) : undefined;
  const sharedSigner = undefined; // not needed for direct-transfer verification
  const executor = new MerchantExecutor(sharedProvider, sharedSigner);
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

  const a2a = new A2AExpressApp(requestHandler);
  a2a.setupRoutes(app);

  const port = process.env.PORT || 10001;
  app.listen(port, () => {
    console.log(`Merchant server listening on http://localhost:${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
