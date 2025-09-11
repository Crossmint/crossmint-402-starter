## A2A x402 Tweet Agent

A2A agent that sends tweets on X/Twitter for payment using the x402 payments extension. Client pays in USDC, server posts their tweet.

### What it does

- Server (tweet agent):
  - Advertises the x402 extension for tweet posting service
  - Requires payment before sending tweets
  - Verifies EIP-712 signature and settles payment on-chain
  - Posts tweet via Twitter API v2 after successful payment
- Client:
  - Fetches AgentCard, sends tweet text, receives payment terms
  - Signs EIP-3009 payment authorization and submits to server
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

**Optional:**
- `PORT`: server port (default: 10001)
- `X402_NETWORK`: "base" or "base-sepolia" (default: base-sepolia)
- `PRICE_USDC`: tweet price in USDC (default: 1.0)

### Run

1) Start the tweet agent server:
```bash
npm run server
# http://localhost:10001
```

2) Run the client with your tweet:
```bash
npm run client
```

Expected output:
- Payment terms for tweet posting
- Payment settlement on-chain
- Tweet posted successfully with tweet ID

### Twitter API Setup

1. Create app at https://developer.x.com/en/portal/dashboard
2. Generate API keys and access tokens
3. Ensure app has "Read and Write" permissions
4. Add credentials to your `.env` file

### Files

- `server.js`: tweet agent server with x402 payment and Twitter API integration
- `client.js`: client that pays and requests tweet posting
- `.env.example`: configuration template