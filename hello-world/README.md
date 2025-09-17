# A2A x402 Payment Demo with Crossmint

A complete **Agent-to-Agent (A2A)** payment demo using the **x402 payments extension** and **Crossmint Wallets SDK** in a React Web interface

## What it does

### **Server (Merchant):**
- Advertises the x402 extension in its AgentCard
- Returns payment requirements on first message (`x402.payment.required`)
- Verifies EIP-712 signatures (EOA + ERC-1271 smart wallet support)
- Settles payments on-chain using `transferWithAuthorization`
- Publishes payment receipts with transaction hashes

### **Client (React App):**
- Web interface for A2A payment flow
- Integrates **Crossmint Wallets SDK** for wallet management
- Uses **delegated EOA signing** for consistent signature verification
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
- the private key you will enter in the react app is to demonstrate that user's crossmint wallet will ideally be delegating signing authority to the client agent which will be interacting with the server agent.

## **Getting Testnet Tokens**
1. **Base Sepolia ETH**: [Coinbase Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
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
- **EIP‑712 authorization**: The app builds the EIP‑712 `domain`, `types` (TransferWithAuthorization), and `message` (from, to, value, validity, nonce). See the EIP‑712 setup in `handlePayment()` in [`app/page.tsx`](./app/page.tsx).
- **Signing and verification (Crossmint signs)**: The Crossmint wallet signs via `evmWallet.signTypedData(...)`. Optionally verify with `recoverTypedDataAddress(...)`. See `handlePayment()` in [`app/page.tsx`](./app/page.tsx).
- **Payment submission**: The signed authorization is sent back with `x402.payment.status: "payment-submitted"` and `x402.payment.payload` (including `taskId`). The merchant verifies/settles per the A2A x402 protocol.
- **Receipts and balances**: The client reads `x402.payment.receipts` and refreshes balances via RPC + ERC‑20 calls. See `checkBalances()` with `JsonRpcProvider`, `Contract`, and `ERC20_ABI` in [`app/page.tsx`](./app/page.tsx).

## References

- [A2A JavaScript SDK](https://github.com/a2aproject/a2a-js)
- [Crossmint Wallets SDK](https://www.npmjs.com/package/@crossmint/wallets-sdk)
- [x402 Extension Specification](#)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
