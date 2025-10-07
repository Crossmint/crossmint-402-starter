# Secret Vault MCP

**A reference implementation for autonomous agent-to-agent payments using Crossmint smart wallets and the x402 protocol.**

This demo shows how AI agents can autonomously handle paid API calls without user intervention: no private keys, no manual approvals, just HTTP and smart contracts doing their thing.

## Your Use-Case

You're building with MCP (Model Context Protocol) and want to charge for your API. Traditional approaches require manual payment flows, wallet management, and lots of user friction. This demo shows a better way:

1. **Host Agent** exposes MCP tools with payment requirements
2. **Guest Agent** automatically pays when calling those tools
3. Payments settle on-chain via x402 protocol (HTTP 402 status code, finally useful!)
4. No user intervention needed after initial confirmation

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure (get keys from Crossmint Console & OpenAI)
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your API keys

# 3. Run
npm run dev
```

Visit `http://localhost:5173` and you'll see a chat interface with two agents ready to demonstrate autonomous payments.

### Your First x402 Payment

1. Click "Connect to Vault" in the chat
2. Say "list secrets" to see what's available
3. Go to `/?view=my-mcp` to store your first secret
4. Get testnet USDC from [Circle Faucet](https://faucet.circle.com/) for the guest wallet
5. Say "retrieve secret <your-id>" and watch the magic happen

The Guest agent will automatically sign the payment, submit it on-chain, and retrieve your secret. You'll see the transaction hash, settlement confirmation, and the secret—all without touching MetaMask or managing keys.

---

## What You're Building

This demo combines four powerful primitives:

### 1. **Cloudflare Durable Objects**
Each user gets their own stateful MCP server instance. Think "mini-server per user" that never has race conditions.

### 2. **Crossmint Smart Wallets**
No private keys to manage. Wallets are controlled via API keys (server-side) or email OTP (client-side). Smart contracts handle the rest.

### 3. **x402 Payment Protocol**
HTTP's `402 Payment Required` status code, finally implemented properly. Send a payment requirement, get a signed payment proof, verify it, done.

### 4. **Model Context Protocol (MCP)**
OpenAI/Anthropic's standard for extending AI with tools. Like "plugins for LLMs" but with an actual spec.

Put them together and you get: **Paid APIs that agents can use autonomously.**

---

## Architecture at a Glance

```
Browser (React UI)
    ↓
Guest Agent (Durable Object)
  • Maintains WebSocket connection
  • Has its own Crossmint wallet
  • Handles 402 responses automatically
    ↓
Host Agent (Durable Object, per-user)
  • Exposes MCP tools
  • Returns 402 for paid tools
  • Verifies payments via x402 facilitator
  • Stores secrets in KV
    ↓
Cloudflare KV (Persistent Storage)
  • User mappings
  • Secrets scoped by user
  • Retrieval counters

    [External Services]
    • Crossmint API → Wallet creation & signing
    • x402 Facilitator → Payment verification
    • Base Sepolia → On-chain settlement
```

See `ARCHITECTURE.md` for detailed diagrams.

---

## Key Concepts Explained

### Durable Objects
Normal serverless functions are stateless—great for APIs, terrible for agents. Durable Objects are **stateful, single-threaded mini-servers** that:
- Persist state across requests
- Handle WebSockets gracefully
- Guarantee no race conditions (single-threaded)
- Scale to exactly one instance per user globally

Perfect for MCP servers that need to maintain connection state and coordinate tool calls.

### Smart Wallets
Traditional wallets require managing private keys—not fun for demos, terrible for production. Crossmint smart wallets:
- Controlled via API (server-side) or email OTP (client-side)
- Support ERC-6492 signatures (work even before on-chain deployment)
- Auto-deploy on first transaction
- Use EIP-1271 for signature verification (smart contract wallets don't have private keys!)

### x402 Protocol
The `402 Payment Required` HTTP status code was reserved in 1997 but never implemented. x402 fixes that:
1. Server returns `402 Payment Required` with payment details
2. Client signs an EIP-712 payment proof
3. Client retries request with `X-PAYMENT: <signature>` header
4. Server verifies signature, submits on-chain, returns data

It's just HTTP. No custom protocols, no WebSockets, no complexity.

### Per-User Isolation
Each user who registers gets:
- A unique MCP URL: `/mcp/users/{hashed-id}`
- Their own Durable Object instance
- Isolated secret storage in KV
- Their own Crossmint wallet for payments

All managed automatically via KV mappings and lazy DO initialization.

---

## File Guide for Builders

**Want to build something similar? Start here:**

### Core Files

- **`src/agents/host.ts`** - MCP server with x402 payment requirements
  - Shows how to use `withX402()` wrapper
  - Implements `paidTool()` for paid endpoints
  - Connects to Crossmint for payment verification

- **`src/agents/guest.ts`** - MCP client that pays automatically
  - Shows how to use `withX402Client()` wrapper
  - Handles payment confirmations
  - Signs payments with Crossmint wallet

- **`src/x402Adapter.ts`** - Bridge between Crossmint and x402
  - Creates viem-compatible account from Crossmint wallet
  - Handles ERC-6492 and EIP-1271 signature formats
  - Critical for making Crossmint work with x402

- **`src/server.ts`** - Cloudflare Worker entry point
  - Routes `/agent` → Guest DO (WebSocket)
  - Routes `/mcp/users/{id}` → Host DO (per-user MCP server)
  - Handles user registration and KV mapping

### UI Files (Optional, but makes demos way better)

- **`src/client.tsx`** - Chat interface with payment popups
- **`src/components/NerdMode/NerdPanel.tsx`** - Developer tools panel with logs
- **`src/pages/MyMcp.tsx`** - User registration & secret storage UI

### Shared Logic

- **`src/shared/secretService.ts`** - KV-backed CRUD for secrets
- **`src/constants.ts`** - Network config, USDC address, facilitator URL

---

## Customization Ideas

This is a demo. Here's how to adapt it for real use cases:

### Build Your Own Paid MCP

1. **Clone `host.ts`** and replace the tools:
   ```typescript
   // Instead of secrets, charge for anything
   this.server.paidTool("generateImage", "...", 0.10, {
     prompt: z.string()
   }, {}, async ({ prompt }) => {
     // Your expensive API call here
   });
   ```

2. **Update payment amounts** in the tool definitions

3. **Deploy to Cloudflare** (see `DEPLOYMENT.md`)

### Multi-Tenant SaaS

The per-user MCP endpoints (`/mcp/users/{id}`) are production-ready for multi-tenancy:
- Each user = separate DO instance
- Isolated state and storage
- Unique wallet per user
- Scoped KV keys

Just add authentication (JWT, API keys, whatever) to the registration endpoint.

### Client-Side Wallets

Swap server-side API key signing for client-side email OTP:
- See `src/pages/MyMcp.tsx` for email OTP example
- User controls their own wallet
- More secure for end-user apps
- Requires Crossmint client SDK

---

## Deployment

Deploy to Cloudflare Workers in 3 commands:

```bash
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put CROSSMINT_API_KEY
npm run deploy
```

Your app goes live at `https://{your-worker}.workers.dev` with global distribution, auto-scaling, and ~50ms cold starts.

See `DEPLOYMENT.md` for custom domains, CI/CD, monitoring, and more.

---

## What Makes This Demo Special

**Most payment demos** use fake tokens, local blockchains, or mock APIs. This one uses:
- ✅ Real Crossmint smart wallets on Base Sepolia
- ✅ Real USDC transfers you can track on BaseScan
- ✅ Real x402 facilitator verification
- ✅ Production-ready code (just swap testnet for mainnet)

**Most MCP demos** show basic tools. This one shows:
- ✅ Paid tools with actual payment requirements
- ✅ Autonomous agent payment flows
- ✅ Per-user isolation and state management
- ✅ WebSocket communication for real-time updates

**Most AI agent demos** hide the interesting bits. This one exposes:
- ✅ Developer Mode with raw logs
- ✅ Transaction history with block explorer links
- ✅ Payment confirmation flow you can step through
- ✅ Wallet deployment status in real-time

It's a demo you can actually learn from, not just watch.

---

## Stack

- **Frontend**: React 19, Vite, TypeScript
- **Backend**: Cloudflare Workers, Durable Objects, KV
- **Agents**: Cloudflare Agents SDK, MCP SDK
- **Wallets**: Crossmint SDK (smart contract wallets)
- **Payments**: x402 protocol, USDC on Base Sepolia
- **Deployment**: Wrangler, globally distributed at edge

---

## Resources

### Protocols & Standards
- [x402 Protocol](https://x402.org) - HTTP-native payments
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
- [ERC-6492](https://eips.ethereum.org/EIPS/eip-6492) - Signature validation for pre-deployed contracts
- [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271) - Smart contract signature validation

### Services & Tools
- [Crossmint Wallets](https://docs.crossmint.com/wallets) - Smart wallet API
- [Cloudflare Agents](https://developers.cloudflare.com/agents/) - Agent framework
- [Base Network](https://base.org) - Ethereum L2
- [Circle Faucet](https://faucet.circle.com/) - Get test USDC

### Explorers
- [Base Sepolia Explorer](https://sepolia.basescan.org/) - View your transactions

---

## FAQ

**Q: Can I use this in production?**
A: Yes, but swap testnet for mainnet. Change `base-sepolia` → `base` in `constants.ts` and update the USDC contract address. Use real API keys. Test thoroughly.

**Q: Do I need to fund the wallets manually?**
A: For testnet, yes (use Circle faucet). For production, wallets start empty—users fund them or you can sponsor gas.

**Q: Why Durable Objects instead of regular Workers?**
A: MCP requires stateful connections. Regular Workers are stateless and can't maintain WebSocket state or coordinate requests properly.

**Q: Can I use a different blockchain?**
A: Yes! Update `constants.ts` with your chain, token address, and RPC URL. Crossmint supports Ethereum, Polygon, Base, Solana, and more.

**Q: What's the deal with ERC-6492?**
A: It lets smart wallets sign messages *before* they're deployed on-chain. Crossmint uses it so wallets work immediately without deployment costs. First transaction auto-deploys the wallet.

**Q: Why USDC and not ETH?**
A: Stablecoins make pricing predictable. $0.05 is always $0.05. Also, x402 facilitator currently supports USDC.

---

## License

MIT - Build whatever you want with this. Attribution appreciated but not required.

## Contributing

Found a bug? Want to add a feature? PRs welcome. This is a demo meant for learning, so clarity > cleverness in code.

---

**Built by the Crossmint team to show what's possible when payments are as easy as HTTP.**

Now go build something that charges money. The future of AI is too expensive to be free.