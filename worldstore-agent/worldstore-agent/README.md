# Worldstore Agent

> **Buy Amazon products with onchain payments through AI-powered conversations.** Gasless transactions, natural language interface, real shipping.

Welcome to the future of onchain commerce

## What It Does

Users interact with an AI agent through natural conversation to purchase real-world products using onchain payments. The agent handles Amazon searches, processes gasless USDC payments on Base, and manages shipping to real addresses. This creates an intuitive that makes onchain payments as simple as sending a text message.

```
User: "I need wireless headphones under $100"
Agent: "Found Sony WH-CH720N for $89.99. Want to order them?"
User: "Yes, ship to my usual address"
Agent: *generates USDC payment signature, processes order*
User: *receives Amazon package in 2 days*
```

Gasless transactions with an intuitive interface that abstracts onchain complexity

## Architecture: The Good Parts

The monorepo structure:

```
worldstore-agent/
├── agent/          # XMTP AI agent - the conversational magic
├── server/         # x402 payment server - the crypto plumbing
├── pnpm-workspace.yaml
└── package.json    # One script to rule them all
```

### The XMTP Agent (`/agent`)
The AI that handles everything users see:
- **[XMTP Protocol](https://docs.xmtp.org/)** for secure, decentralized messaging
- **Claude Sonnet 4** for natural conversations
- **Redis** for speed (with filesystem fallback for reliability)
- **Deterministic wallets** so each user gets their own payment identity
- **Profile management** for streamlined user experience
- **Interactive buttons** for when tapping is easier than typing

### The x402 Server (`/server`)
The payment processor that makes crypto-to-Amazon payments work:
- **EIP-3009 signatures** for gasless USDC payments
- **Multi-network support** with Base as the primary network (also supports Ethereum, Polygon, Arbitrum)
- **Crossmint integration** for the actual Amazon fulfillment
- **Custom x402 implementation** optimized for commerce use cases

## Setup

> **Base Wallet Integration Note**
>
> This XMTP bot is optimized for Base Wallet, leveraging two specialized content types that enhance the chat experience:
>
> - **Quick Actions codec**: Enables interactive buttons and commands within chat
> - **Intent codec**: Handles transaction intents and wallet interactions
>
> While your bot works with any XMTP client, Base Wallet users get the full interactive experience with these enhanced message types.
>
> **Learn more**: 
> - Complete codec documentation and implementation examples at [Base App Chat Agents Guide](https://docs.base.org/base-app/guides/chat-agents#base-app-content-types)
> - XMTP Protocol documentation at [docs.xmtp.org](https://docs.xmtp.org/)

### Prerequisites
- **Node.js 20+** (`node --version`)
- **PNPM** (`npm install -g pnpm`)
- **Anthropic API key** (get from console.anthropic.com)
- **Crossmint account** (sign up at crossmint.com)
- **SerpAPI key** (optional, for enhanced product search)

### Installation
```bash
git clone <your-repo-url>
cd worldstore-agent
pnpm install

# Start Redis (highly recommended for production performance)
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack:latest
```

### Configuration
```bash
# Copy environment templates
cp agent/.env.template agent/.env
cp server/.env.template server/.env

# Generate XMTP keys for the agent
# Learn more about XMTP keys: https://docs.xmtp.org/build/authentication
cd agent && pnpm gen:keys

# Edit .env files with your API keys (see templates for details)
```

### Start Services
```bash
# Start both services with hot reload
pnpm dev

# Or start individually:
pnpm dev:agent    # XMTP agent only
pnpm dev:server   # Payment server only
```

### Verify Setup
```bash
# Check server health
curl http://localhost:3000/api/orders/facilitator/health

# Check Redis connection
redis-cli ping  # Should return PONG

# Agent will log XMTP connection details on startup
```

### Troubleshooting First Setup
**Agent not connecting to XMTP:**
- Check that `WALLET_KEY` and `ENCRYPTION_KEY` are set (run `pnpm gen:keys` if missing)
- Verify XMTP environment setting (`dev` vs `production`)
- See [XMTP Troubleshooting Guide](https://docs.xmtp.org/build/troubleshooting) for connection issues

**Server health check fails:**
- Ensure all Crossmint env vars are set correctly
- Check that your Crossmint treasury wallet is funded
- Verify network configurations match your target chains

**Redis connection issues:**
- Agent falls back to filesystem storage automatically
- For production performance, ensure Redis Stack is running (not basic Redis)

**What makes this simple:**
The system is designed for simplicity, requiring minimal blockchain knowledge and straightforward configuration.

## How Users Experience This

1. **First Contact**: User messages the agent, gets asked for basic profile info (name, email, address)
2. **Shopping**: Natural language product search - "wireless mouse under $50" or specific ASINs work equally well
3. **Payment**: Agent checks USDC balance, requests funding if needed (with helpful action buttons)
4. **Authorization**: User signs a payment authorization (gasless, just a signature)
5. **Fulfillment**: Order goes to Amazon via Crossmint, tracking info gets shared
6. **Delivery**: Real package arrives at real address

The entire flow feels like messaging a really competent personal shopper who accepts onchain payments.

## The Technical Reality

### Payments That Actually Work
- **Gasless USDC payments** via EIP-3009 `transferWithAuthorization`
> **💡 Multi-Currency Payment Support**
>
> **Current limitation**: x402 protocol restricts payments to EIP-3009 tokens (USDC only). For multi-currency support, you'll need to bypass x402.
>
> **The details**:
> - x402 enables gasless payments but only supports USDC
> - Crossmint APIs are chain/token agnostic—they work with any token you throw at them
> - To accept other tokens: remove the 402 server response code and let API calls go through directly
>
> **Implementation**: Skip the x402 middleware for multi-currency flows. Your users will handle gas fees, but you gain full token flexibility.
>
> **Need help with this setup?** [Contact our team](https://t.me/crossmintdevs)—we've helped other developers implement multi-currency flows and can walk you through the specifics.

- **Multi-network** so users aren't stuck on expensive chains
> **Network Simplification:** While the payment server supports multiple networks, the XMTP agent is configured to work primarily with Base, leveraging Base's low-cost infrastructure for USDC transactions. This reduces complexity in wallet operations and balance checks while maintaining the core functionality. Additional networks can be added by extending the onchain tools and wallet configuration.
- **Deterministic wallets** generated per user for seamless UX
- **Balance checking** with funding requests when needed

### AI stuff
- **Claude Sonnet 4** with function calling for structured operations
- **Context management** so conversations feel natural
- **Slash commands** (`/clear`, `/help`, `/menu`) for power users
  - `/clear`: clears context window
  - `/help`: displays the help menu
  - `/menu`: displays all options menu
- **Interactive actions** for mobile-friendly experiences

### Storage That Scales
- **Redis** for production performance with JSON search
- **Filesystem fallback** when Redis is unavailable
- **Automatic migration** from filesystem to Redis
- **User profiles, order history, conversation state** all handled seamlessly

## Workspace Commands

```bash
# Development (both services with hot reload)
pnpm dev

# Individual services
pnpm dev:agent      # Just the XMTP agent
pnpm dev:server     # Just the x402 server

# Production
pnpm start:agent    # Agent in production mode
pnpm start:server   # Server in production mode

# The usual dev tools
pnpm build         # Build everything
pnpm lint          # Fix your code style
pnpm type:check    # TypeScript validation
pnpm clean         # Start fresh
```

## Technology Choices

- **[XMTP Protocol](https://docs.xmtp.org/)** - Secure, decentralized messaging
- **[LangGraph + Claude](https://docs.anthropic.com/claude/docs/intro-to-claude)** - AI agent framework
- **[Express.js](https://expressjs.com/)** - Web server framework
- **[Redis](https://redis.io/docs/)** - High-performance storage
- **[GOAT SDK](https://ohmygoat.dev/)** - Blockchain operations
- **[Crossmint](https://docs.crossmint.com/)** - Payment infrastructure
- **TypeScript/JavaScript** - Runtime and type safety

## What's Next?

Each service has its own detailed README with the nitty-gritty details:
- **[`/agent/README.md`](/agent/README.md)** - XMTP agent setup, Redis configuration, and workflow details
- **[`/server/README.md`](/server/README.md)** - x402 protocol implementation and payment processing

## Ready to start building?
- **Understand the architecture**: [Overview](./tutorial/1-overview.md)
- **Ready to deploy**: [Quick Deployment Guide](./tutorial/2-deployment.md)
- **Production Planning**: [Production Considerations](./tutorial/3-production.md)
- **Debug**: [Troubleshooting Guide](./tutorial/4-troubleshooting.md)
- **Advanced features**: [Extension Opportunities](./tutorial/5-extensions.md)
