import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";
import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 10001;
const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS;
const NETWORK = process.env.X402_NETWORK || "base-sepolia";
const PRICE_USDC = process.env.PRICE_USDC || "1";

// Twitter API configuration
const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

// Validate configuration
if (!MERCHANT_ADDRESS) {
  console.error("[server] MERCHANT_ADDRESS is required. Set it in your environment.");
  process.exit(1);
}

if (!TWITTER_CONSUMER_KEY || !TWITTER_CONSUMER_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
  console.warn("[server] Twitter API credentials are missing. Tweets will not be sent.");
}

// Initialize Twitter client
function createTwitterClient() {
  if (!TWITTER_CONSUMER_KEY || !TWITTER_CONSUMER_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
    return null;
  }

  return new TwitterApi({
    appKey: TWITTER_CONSUMER_KEY,
    appSecret: TWITTER_CONSUMER_SECRET,
    accessToken: TWITTER_ACCESS_TOKEN,
    accessSecret: TWITTER_ACCESS_TOKEN_SECRET,
  });
}

const twitterClient = createTwitterClient();

// Download image and upload to Twitter
async function downloadAndUploadImage(imageUrl) {
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
    const errMsg = error?.message || String(error);
    console.error("[server] failed to download/upload image:", errMsg);
    throw error;
  }
}

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
}));

// Debug logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const xpay = req.header("X-PAYMENT");
  console.log(`[REQ] ${req.method} ${req.path} X-PAYMENT=${xpay ? `present (${xpay.length} bytes)` : "none"}`);

  res.on("finish", () => {
    const dur = Date.now() - start;
    console.log(`[RES] ${req.method} ${req.path} -> ${res.statusCode} dur=${dur}ms`);
  });

  next();
});

// Apply x402 payment middleware
app.use(paymentMiddleware(MERCHANT_ADDRESS, {
  "POST /tweet": { price: `$${PRICE_USDC}`, network: NETWORK }
}, {
  url: "https://x402.org/facilitator",
  createAuthHeaders: undefined
}));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT,
    network: NETWORK,
    merchantAddress: MERCHANT_ADDRESS,
    twitterConfigured: !!twitterClient,
    endpoints: {
      tweet: `$${PRICE_USDC}`
    }
  });
});

// Tweet endpoint (protected by x402 middleware)
app.post("/tweet", async (req, res) => {
  const { text, imageUrl } = req.body;

  console.log("[server] /tweet endpoint called", { text, imageUrl: imageUrl || "none" });

  // Validate tweet text
  if (!text || !text.trim()) {
    console.error("[server] no tweet text provided");
    return res.status(400).json({ error: "Tweet text is required" });
  }

  if (text.length > 280) {
    console.error("[server] tweet text too long", { length: text.length });
    return res.status(400).json({ error: `Tweet text exceeds 280 character limit (${text.length} characters)` });
  }

  if (!twitterClient) {
    console.error("[server] Twitter client not initialized");
    return res.status(500).json({ error: "Twitter API not configured" });
  }

  try {
    let tweetOptions = {};

    // Upload image if provided
    if (imageUrl) {
      console.log("[server] sending tweet with image:", text);
      const mediaId = await downloadAndUploadImage(imageUrl);
      tweetOptions.media = { media_ids: [mediaId] };
    } else {
      console.log("[server] sending text-only tweet:", text);
    }

    // Send tweet
    const tweetResult = await twitterClient.v2.tweet(text, tweetOptions);
    console.log("[server] tweet sent successfully:", tweetResult.data);

    const message = imageUrl
      ? `Tweet with image sent successfully! Tweet ID: ${tweetResult.data.id}`
      : `Tweet sent successfully! Tweet ID: ${tweetResult.data.id}`;

    return res.json({
      success: true,
      message,
      tweetId: tweetResult.data.id,
      tweetUrl: `https://twitter.com/user/status/${tweetResult.data.id}`,
      data: tweetResult.data
    });

  } catch (error) {
    const errMsg = error?.message || String(error);
    console.error("[server] failed to send tweet:", errMsg);

    // Provide specific error messages
    let errorMessage = "Failed to send tweet";
    if (error.code === 403) {
      errorMessage = "Twitter API permission denied (403). Check your app has 'Read and Write' permissions.";
    } else if (error.code === 401) {
      errorMessage = "Twitter API authentication failed (401). Verify your API keys.";
    } else if (error.code === 429) {
      errorMessage = "Twitter API rate limit exceeded (429). Please try again later.";
    } else {
      errorMessage = `Twitter API error: ${errMsg}`;
    }

    return res.status(500).json({ error: errorMessage, details: errMsg });
  }
});

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "Tweet Agent (x402)",
    description: "Agent that sends tweets on X/Twitter for payment using x402 protocol",
    version: "0.2.0",
    endpoints: {
      health: "GET /health",
      tweet: "POST /tweet (requires payment)"
    }
  });
});

app.listen(PORT, () => {
  console.log(`[server] Tweet agent (x402) listening on http://localhost:${PORT}`);
  console.log(`[server] Merchant address: ${MERCHANT_ADDRESS}`);
  console.log(`[server] Network: ${NETWORK}`);
  console.log(`[server] Price: $${PRICE_USDC} USDC`);
  console.log(`[server] Twitter configured: ${!!twitterClient}`);
});
