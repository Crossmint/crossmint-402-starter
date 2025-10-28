# Quick Deployment Guide

**Get your Worldstore Agent up and running.** This guide covers the essential deployment steps for development and testing.

For production deployment considerations, see [Production Guide](./3-production.md).

## Prerequisites

Before starting, ensure you have:

- **Node.js 20+** and **pnpm 8+** installed
- **Redis Stack** (local or cloud)
- **Required API accounts**: Anthropic, Crossmint, SerpAPI, RPC provider

**Quick verification:**
```bash
node --version    # Should be 20+
pnpm --version   # Should be 8+
redis-cli ping   # Should return PONG (if running locally)
```

## Step 1: Clone and Setup Workspace

```bash
# Get the code
git clone <repository-url>
cd worldstore-agent

# Install dependencies for both services
pnpm install

# Verify workspace structure
ls -la
# You should see: agent/ server/ package.json pnpm-workspace.yaml
```

## Step 2: Configure the XMTP Agent

**Copy template and generate keys:**
```bash
cd agent
cp .env.template .env

# Generate XMTP wallet and encryption keys
pnpm gen:keys
# Copy the output values to your .env file
```

**Important: XMTP Client Architecture**

This agent uses a **single [XMTP](https://docs.xmtp.org/) client** that handles all user conversations concurrently. Understanding this architecture is important for deployment:

- **Development**: One client instance handles testing with multiple users
- **Production**: Same architecture scales to handle real users (see [Production Guide](./3-production.md))
- **Database**: XMTP maintains conversation history in local SQLite database
- **Connection**: Client maintains persistent connection to XMTP network

**Edit `agent/.env`:**
```bash
# AI Configuration - Get from Anthropic Console
ANTHROPIC_API_KEY=sk-ant-your-key-here

# XMTP keys (from gen:keys output)
WALLET_KEY=0x1234abcd...
ENCRYPTION_KEY=your-32-byte-hex-encryption-key
XMTP_ENV=dev

# Backend Integration
WORLDSTORE_API_URL=http://localhost:3000

# Product Search - Get from SerpAPI
SERPAPI_API_KEY=your-serpapi-key

# Wallet Generation - Use any Ethereum private key
WALLET_PRIVATE_KEY=0x...
RPC_PROVIDER_URL=https://ethereum-sepolia.publicnode.com

# Redis - Use Redis Cloud or local instance
REDIS_URL=redis://localhost:6379
```

**Verify agent configuration:**
```bash
pnpm type:check
# Should complete without errors
```

## Step 3: Configure the Payment Server

**Copy template:**
```bash
cd ../server
cp .env.template .env
```

**Edit `server/.env`:**
```bash
# Crossmint Configuration - Get from Crossmint Console
CROSSMINT_API_KEY=your_crossmint_api_key
CROSSMINT_ENVIRONMENT=staging
CROSSMINT_WALLET_ADDRESS=your_wallet_address
CROSSMINT_WALLET_LOCATOR=your_wallet_locator

# Order Configuration
ORDER_FEE_PERCENTAGE=0
ORDER_PAYMENT_TIMEOUT_MINUTES=10

# Network Support
CUSTOM_MIDDLEWARE_NETWORKS=ethereum-sepolia,base-sepolia,polygon-mumbai,arbitrum-sepolia
CUSTOM_MIDDLEWARE_CURRENCIES=usdc

# Server Configuration
PORT=3000
NODE_ENV=development
DEBUG=false
```

**Verify server configuration:**
```bash
pnpm start
# Should see: => x402 + Crossmint API Server started
# Stop with Ctrl+C after verification
```

## Step 4: Start Redis

**Option 1: Docker (Recommended)**
```bash
# Ensure Docker Desktop is running first
docker --version  # Verify Docker is available

# Start Redis with persistent storage
docker run -d --name worldstore-redis -p 6379:6379 redis/redis-stack:latest
```

**Option 2: Local Installation**
```bash
redis-server
```

**Verify Redis:**
```bash
redis-cli ping
# Should return: PONG
```

Common Docker issues:
- **"Cannot connect to Docker daemon"** → Launch Docker Desktop and wait for startup
- **"Port already in use"** → Stop existing Redis: `docker stop worldstore-redis`

## Step 5: Launch Both Services

**From the root directory:**
```bash
# Start both services in development mode
pnpm dev

# This runs:
# - Agent on XMTP protocol (no HTTP port)
# - Server on http://localhost:3000
```

## Step 6: Verify Everything Works

**Check server health:**
```bash
curl http://localhost:3000/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-20T10:30:00.000Z",
  "version": "1.0.0",
  "environment": "development"
}
```

**Check agent logs** - should show:
```
XMTP Shopping Bot initialized
Listening for messages...
```

## Quick Test

**Send a test message via XMTP to verify the agent responds:**

1. Open your [XMTP](https://docs.xmtp.org/) client (Base Wallet, Converse, etc.)
2. Message your agent's wallet address (from WALLET_KEY in agent/.env)
3. Send: "Hello, can you help me find wireless earbuds?"
4. Agent should respond with product search results

## What's Next?

- **Having issues?** Check the [Troubleshooting Guide](./4-troubleshooting.md)
- **Ready for production?** Review [Production Considerations](./3-production.md)
- **Want to extend features?** Explore [Extension Opportunities](./5-extensions.md)

## Common Quick Fixes

**Agent won't start:**
```bash
# Regenerate XMTP keys
cd agent && pnpm gen:keys
# Copy new values to .env
```

**Redis connection failed:**
```bash
# Check Redis is running
redis-cli ping

# Fix URL format in .env
REDIS_URL=redis://localhost:6379  # Local
REDIS_URL=rediss://user:pass@host:port  # Cloud with SSL
```

**Payment server 402 errors:**
```bash
# Verify Crossmint configuration
curl -H "X-API-Key: $CROSSMINT_API_KEY" \
  https://staging.crossmint.com/api/v1-alpha2/wallets/$CROSSMINT_WALLET_LOCATOR
```

**Performance slow?** Check [Production Guide](./3-production.md) for optimization tips.

---

**Success!** Your Worldstore Agent is now running and ready to process crypto-commerce conversations.