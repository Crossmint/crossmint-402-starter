## A2A x402 Tweet Agent

A2A agent that sends tweets on X/Twitter for payment using the x402 payments extension. Client pays in USDC, server posts their tweet with optional image attachment.

### What it does

- Server (tweet agent):
  - Advertises the x402 extension for tweet posting service
  - Requires tweet text (will error if not provided)
  - Accepts optional image URL for tweet attachment
  - Verifies EIP-712 signature and settles payment on-chain
  - Posts tweet (with optional image) via Twitter API v2 after successful payment
- Client:
  - Sends tweet text (required) and optional image URL to agent
  - Receives payment terms and signs EIP-3009 payment authorization
  - Receives tweet confirmation with tweet ID

### Prerequisites

- Node.js 18+
- Twitter Developer Account with API v2 access

### Install

```bash
npm install
```

### Configure

Set environment variables (copy `.env.example` to `.env`):

**Required:**
- `MERCHANT_PRIVATE_KEY`: merchant wallet private key
- `RPC_URL`: Base network RPC endpoint
- `TWITTER_CONSUMER_KEY`, `TWITTER_CONSUMER_SECRET`: Twitter app credentials  
- `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`: Twitter user tokens

**Client-side (Required):**
- `TWEET_TEXT`: tweet text to send (server will error if missing)

**Client-side (Optional):**
- `AGENT_URL`: tweet agent server URL (default: http://localhost:10001)
- `IMAGE_URL`: image URL to attach to tweet

**Server-side (Optional):**
- `PORT`: server port (default: 10001)
- `X402_NETWORK`: "base" or "base-sepolia" (default: base-sepolia)
- `PRICE_USDC`: tweet price in USDC (default: 0 for free tweets)

### Run

1) Start the tweet agent server:
```bash
npm run server
# http://localhost:10001
```

2) Run the client with your tweet (customize via environment variables):
```bash
# Send tweet with text only
TWEET_TEXT="My awesome tweet! 🚀" npm run client

# Send tweet with text and image
TWEET_TEXT="Check out this photo!" IMAGE_URL="https://example.com/my-image.jpg" npm run client

# Will error if no TWEET_TEXT provided
npm run client
```

Expected output:
- Payment terms for tweet posting
- Payment settlement on-chain
- Tweet posted successfully with tweet ID (with or without image)

### Twitter API Setup

1. Create app at https://developer.x.com/en/portal/dashboard
2. **Important**: Set app permissions to "Read and Write"
3. **Important**: Apply for "Elevated" access if using Basic access level
4. Generate API keys and access tokens (after setting permissions)
5. Ensure your Twitter account has phone verification
6. Add credentials to your `.env` file

### Troubleshooting Twitter API Errors

**403 Permission Denied:**
- Check app has "Read and Write" permissions (not just "Read")
- Regenerate access tokens after changing permissions
- Verify you have "Elevated" access (Basic access has limitations)
- Ensure Twitter account is verified with phone number

**401 Authentication Failed:**
- Verify all 4 credentials are correct (consumer key/secret, access token/secret)
- Check for extra spaces or quotes in environment variables

**429 Rate Limit:**
- Wait before retrying (Twitter has rate limits)
- Consider implementing retry logic with backoff

### Files

- `server.js`: tweet agent server with x402 payment and Twitter API integration
- `client.js`: client that pays and requests tweet posting
- `.env.example`: configuration template