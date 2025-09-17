# A2A x402 Payment Demo with Crossmint

A complete **Agent-to-Agent (A2A)** payment demo using the **x402 payments extension** and **Crossmint Wallets SDK** in a React Web interface

## What it does

### **Server (Merchant):**
- Advertises the x402 extension in its AgentCard
- Returns payment requirements on first message (`x402.payment.required`)
- Uses the `direct-transfer` scheme: verifies payment by checking ERC‑20 `Transfer` logs from payer to payee
- Publishes payment receipts with transaction hashes

### **Client (React App):**
- Web interface for A2A payment flow
- Integrates **Crossmint Wallets SDK** for wallet management
- Executes ERC‑20 `transfer` from the Crossmint wallet and submits tx hash via x402
- Real-time balance checking and payment status
- Automatic balance refresh after successful payments

## Quick Start

### 1. **Setup Environment**
```bash
# Copy environment template
cp env.example .env

# Edit .env with your credentials (see configuration section below)
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Start Both Services**
```bash
# Terminal 1: Start merchant server
npm run server

# Terminal 2: Start React client
npm run dev
```

### 4. **Access the Demo**
- **React App**: http://localhost:3000
- **Server API**: http://localhost:10000
- **AgentCard**: http://localhost:10000/.well-known/agent-card.json

## **Note**:
- Crossmint is the payer in this demo. No user private key is required; the transfer is executed by the Crossmint wallet service and verified on-chain by the server.

## **Getting Testnet Tokens**
1. **Base Sepolia ETH**: [Circle Faucet](https://faucet.circle.com/)
2. **Base Sepolia USDC**: Bridge from other testnets or use USDC faucets
3. Send tokens to your `CLIENT_PRIVATE_KEY` address

## 📋 Scripts

```bash
npm run server    # Start merchant server (port 10000)
npm run dev       # Start React client (port 3000)
```

## What's happening behind the scenes

- **Discovery and activation**: The client opts in to the payments extension and loads the merchant's AgentCard using the `X-A2A-Extensions` header. See `A2AClient.fromCardUrl` and `fetchWithExtension` in [`app/page.tsx`](./app/page.tsx).
- **Request and requirements**: The client sends an initial message; the merchant replies with a Task whose message `metadata` includes `x402.payment.status: "payment-required"` and `x402.payment.required`. See `handlePayment()` in [`app/page.tsx`](./app/page.tsx).
- **Wallet setup (payer)**: A Crossmint wallet is created/loaded for `email:{userEmail}` on the requested chain. See `createCrossmint`, `CrossmintWallets.from`, and `wallets.createWallet` in [`app/page.tsx`](./app/page.tsx).
- **Direct transfer**: The client executes ERC‑20 `transfer(payTo, amount)` from the Crossmint wallet. See `evmWallet.sendTransaction` usage in `handlePayment()`.
- **Payment submission**: The tx hash and details are sent back with `x402.payment.status: "payment-submitted"` and `x402.payment.payload`.
- **Server verification**: The server checks the receipt and `Transfer` log for exact payer, payTo, and amount, then publishes `payment-completed` with a receipt. See `server.js`.
- **Receipts and balances**: The client reads `x402.payment.receipts` and refreshes balances via RPC + ERC‑20 calls. See `checkBalances()` in [`app/page.tsx`](./app/page.tsx).

## References

- [A2A JavaScript SDK](https://github.com/a2aproject/a2a-js)
- [Crossmint Wallets SDK](https://www.npmjs.com/package/@crossmint/wallets-sdk)
- [Local integration spec (direct-transfer)](./spec.md)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
