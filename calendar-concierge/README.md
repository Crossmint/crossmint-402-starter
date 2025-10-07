# 🔐 Secret Vault

A demo application showcasing **autonomous agent-to-agent payments** using:
- **Crossmint Smart Wallets** (no private key management needed!)
- **x402 Protocol** (HTTP-native payment protocol)
- **Base Sepolia** testnet

## What This Demo Does

Two AI agents communicate with each other using paid services:

1. **Host Agent** - Stores secrets with payment requirements
   - Creates a Crossmint smart wallet to receive payments
   - Stores secrets in Cloudflare KV
   - Protects secrets with x402 payment requirements

2. **Guest Agent** - Retrieves secrets by paying automatically
   - Creates its own Crossmint smart wallet to make payments
   - Automatically handles 402 responses
   - Pays via x402 protocol without user intervention
   - Returns the secret + transaction hash

```
User → Host: "Store secret 'API-KEY' for $0.05"
  ↓
Host: Stores in KV, returns secret ID
  ↓
User → Guest: "Get secret abc-123"
  ↓
Guest: Fetches → Gets 402 → Pays automatically → Returns secret + TX hash
```

## Prerequisites

### 1. Crossmint API Key

Get a server API key from [Crossmint Console](https://www.crossmint.com/console):

1. Create a new **Smart Wallet** project
2. Navigate to **API Keys** section
3. Create an API key with scopes:
   - `wallets.create`
   - `wallets.read`
   - `wallets:messages.sign`
4. Copy the key (starts with `sk_staging_` or `sk_production_`)

### 2. OpenAI API Key

Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)

### 3. Test Tokens (Optional)

Get test USDC on Base Sepolia from [Circle Faucet](https://faucet.circle.com/)

## Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment Variables

Copy the example file:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your actual API keys:

```bash
OPENAI_API_KEY=sk-proj-your-openai-key-here
CROSSMINT_API_KEY=sk_staging_your-crossmint-key-here
```

### Step 3: Run Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

You should see:
```
🏠 Host wallet created: 0xABC...
👤 Guest wallet created: 0xDEF...
```

## Using the Demo

### 1. Store a Secret (Host Agent)

In the Host Agent chat:

```
Store secret 'MY-API-KEY-12345' for $0.05
```

The agent will:
- Generate a unique secret ID
- Store it in KV with payment requirements
- Return the secret ID (e.g., `abc-123-def-456`)

**Copy this secret ID!**

### 2. Check Wallet Addresses

Ask both agents:

```
What's my wallet address?
```

This shows you the Crossmint smart wallet addresses and balances.

### 3. Fund the Guest Wallet

The Guest agent needs USDC to pay for secrets:

1. Copy the Guest wallet address
2. Visit [Circle Faucet](https://faucet.circle.com/)
3. Paste the Guest wallet address
4. Request test USDC (usually 10 USDC)
5. Wait ~30 seconds for confirmation

### 4. Retrieve the Secret (Guest Agent)

In the Guest Agent chat:

```
Get secret abc-123-def-456
```

The agent will:
1. Check its wallet balance
2. Fetch the secret endpoint
3. Receive 402 Payment Required
4. **Automatically sign and submit payment**
5. Receive the secret + transaction hash

### 5. Verify the Transaction

Click the transaction hash link to view it on [Base Sepolia Explorer](https://sepolia.basescan.org/)

You can see:
- The USDC transfer from Guest → Host
- The payment amount ($0.05 = 50,000 USDC wei)
- Block confirmation

## How It Works

### Payment Flow

```
┌─────────────┐                           ┌─────────────┐
│Guest Agent  │                           │ Host Agent  │
│+ Wallet B   │                           │ + Wallet A  │
└──────┬──────┘                           └──────┬──────┘
       │                                         │
       │ 1. GET /api/secrets/abc-123            │
       │────────────────────────────────────────>│
       │                                         │
       │ 2. 402 Payment Required                │
       │    + Payment Requirements (x402)       │
       │<────────────────────────────────────────│
       │                                         │
       │ 3. Sign Payment (Crossmint)            │
       │    Create X-PAYMENT header             │
       │                                         │
       │ 4. GET /api/secrets/abc-123            │
       │    Header: X-PAYMENT: [signed]         │
       │────────────────────────────────────────>│
       │                                         │
       │                          5. Verify Payment
       │                             (x402 Facilitator)
       │                                         │
       │                          6. Settle Payment
       │                             (on-chain TX)
       │                                         │
       │ 7. 200 OK                              │
       │    + Secret Data                       │
       │    + TX Hash                           │
       │<────────────────────────────────────────│
       │                                         │
```

### Key Components

**x402 Protocol** ([x402.org](https://x402.org))
- HTTP-native payment standard
- Uses `402 Payment Required` status code
- `X-PAYMENT` header for payment proofs
- Facilitator server for verification & settlement

**Crossmint Wallets** ([docs.crossmint.com](https://docs.crossmint.com/wallets))
- Smart contract wallets (ERC-4337)
- No private key management
- API-based signing
- ERC-6492 signatures for pre-deployed wallets

**Base Sepolia**
- Ethereum L2 testnet
- Fast & cheap transactions
- USDC as payment token

## Architecture

```
src/
├── agents/
│   ├── host.ts          # Stores secrets, receives payments
│   └── guest.ts         # Retrieves secrets, makes payments
├── x402Adapter.ts       # Crossmint wallet → x402 signer
├── constants.ts         # Network config, USDC address
├── server.ts            # x402 payment verification & settlement
├── client.tsx           # React UI
└── styles.css           # Demo styling
```

## Troubleshooting

### "Wallets need test tokens"

Both wallets start with zero balance. The Guest wallet needs USDC to make payments:

- Get test USDC from [Circle Faucet](https://faucet.circle.com/)
- Both wallets also need a tiny amount of ETH for gas (faucet provides this too)

### "Payment verification failed"

Check:
- Guest wallet has sufficient USDC balance
- Network is consistently "base-sepolia"
- Facilitator URL is accessible (`https://x402.org/facilitator`)

### "Wallet deployment failed"

The wallet needs ETH for gas to deploy on-chain:
- Get test ETH from Base Sepolia faucet
- The Circle faucet provides both USDC and ETH

### "Cannot find module '@crossmint/wallets-sdk'"

Run `npm install` to install all dependencies.

## Connecting to the MCP Server

### MCP Server Info

The Host agent exposes an MCP (Model Context Protocol) server that can be connected to by AI clients:

```bash
# Get server metadata
curl http://localhost:5173/mcp/info
```

### From Claude Desktop

Add to your Claude config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "secret-vault": {
      "url": "http://localhost:5173/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Restart Claude Desktop, and the SecretVault tools will appear in your tool list.

### From Code (Guest Agent Example)

The Guest agent already connects to the Host MCP server programmatically:

```typescript
// Connect to MCP server
const { id } = await this.mcp.connect("http://localhost:5173/mcp", {
  transport: { type: "streamable-http" }
});

// Wrap with x402 client for payments
this.x402Client = withX402Client(this.mcp.mcpConnections[id].client, {
  network: "base-sepolia",
  account: x402Signer
});

// List available tools
const tools = await this.x402Client.listTools({});

// Call a paid tool
const result = await this.x402Client.callTool(
  this.onPaymentRequired.bind(this),
  { name: "retrieveSecret", arguments: { secretId: "abc-123" } }
);
```

### Per-User MCP Endpoints

For multi-tenant scenarios, you can create user-specific MCP endpoints:

```bash
# 1. Register a user with their wallet address
curl -X POST http://localhost:5173/api/users/mcp \
  -H "Content-Type: application/json" \
  -d '{"userId":"alice","walletAddress":"0x..."}'

# 2. Connect to user-specific MCP server
# Each user gets their own Durable Object instance with isolated state
curl http://localhost:5173/mcp/users/alice
```

This allows each user to have their own wallet and secret storage.

## Learn More

- 📖 **Crossmint Wallets**: https://docs.crossmint.com/wallets
- 📖 **x402 Protocol**: https://x402.org
- 📖 **Model Context Protocol**: https://modelcontextprotocol.io
- 🏗️ **Cloudflare Agents**: https://developers.cloudflare.com/agents/
- 💰 **Base Network**: https://base.org/
- 🔍 **Base Sepolia Explorer**: https://sepolia.basescan.org/

## Key Features

✅ **No private key management** - Crossmint handles wallet security
✅ **Smart contract wallets** - Account abstraction, gas sponsorship
✅ **Agent-to-agent payments** - Autonomous commerce between services
✅ **HTTP-native payments** - x402 protocol for seamless integration
✅ **Demo-friendly** - Clear logging, helpful instructions, real transactions

---

Built with **Cloudflare Workers + Agents SDK + Crossmint Wallets + x402 Protocol**
