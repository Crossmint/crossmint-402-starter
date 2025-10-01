# ping-crossmint

A demonstration of Crossmint wallet integration with x402 payment protocol for protected API endpoints.

## Overview

This project showcases how to use Crossmint smart wallets to automatically handle payments for HTTP 402 (Payment Required) protected endpoints. It includes:

- **Client**: React application with Crossmint wallet integration
- **Server**: Express server with x402 payment middleware
- **Demo**: Interactive interface for wallet creation, deployment, and payment testing

## Features

- 🔐 Server API key authentication
- 📧 Email-based wallet creation
- 🏗️ Smart wallet deployment detection and management
- 💰 Automatic 402 payment handling with x402 protocol
- 🔧 EIP-1271 signature support for deployed wallets
- 💎 Real-time ETH and USDC balance display
- 🔄 Manual balance refresh functionality
- 📋 Comprehensive configuration display (addresses, contracts, deployment status)
- 📊 Real-time logging and status updates

## Quick Start

### Prerequisites
- Node.js 18+
- A Crossmint server API key (starts with `sk_`)

### Setup

1. **Start the server**:
   ```bash
   cd server
   npm install
   npm run dev  # Runs on http://localhost:3100
   ```

2. **Start the client**:
   ```bash
   cd client
   npm install
   npm run dev  # Runs on http://localhost:5174
   ```

3. **Open the demo**:
   - Navigate to http://localhost:5174
   - Configure your setup:
     - Enter your Crossmint server API key (starts with `sk_`)
     - Set the test email address for wallet creation
     - Select the blockchain network (base-sepolia, base, ethereum)
     - Confirm the server URL (should match step 1)
   - Click "Initialize Wallet" to create a smart wallet
   - Click "Ping with Payment" to test 402 payment flow

## Architecture

```
┌─────────────────┐    HTTP 402     ┌─────────────────┐
│                 │ ◄──────────────► │                 │
│   React Client  │                 │  Express Server │
│                 │    x402 + USDC  │                 │
│ - Crossmint SDK │ ◄──────────────► │ - x402-express  │
│ - x402-axios    │                 │ - Payment check │
│ - EIP-712 sign  │                 │                 │
└─────────────────┘                 └─────────────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│                 │                 │                 │
│ Crossmint Wallet│                 │  x402 Facilita- │
│ - Base Sepolia  │                 │  tor (External) │
│ - Smart Contract│                 │  - Settlement   │
│ - USDC Balance  │                 │  - Verification │
└─────────────────┘                 └─────────────────┘
```

## Key Files

- `client/src/ui/App.tsx` - Main application component
- `client/src/ui/CrossmintPing.tsx` - Demo interface and wallet logic
- `client/src/x402/crossmintAdapter.ts` - Crossmint ↔ x402 integration
- `client/src/utils/walletGuards.ts` - Wallet deployment utilities
- `server/src/server.ts` - 402-protected API server

## Payment Flow

1. **Initialize**: Create Crossmint wallet with server API key
2. **Deploy** (optional): Deploy wallet to blockchain for settlement
3. **Request**: Client makes HTTP request to protected endpoint
4. **402 Response**: Server returns payment requirements
5. **Sign**: Wallet signs EIP-712 payment authorization
6. **Retry**: Client retries request with payment proof
7. **Verify**: Server verifies signature and completes request
8. **Settle**: External facilitator settles payment on-chain

## Configuration

All configuration values can be set directly in the web interface:

- **Server API Key**: Your Crossmint server API key (starts with `sk_`)
- **Test Email**: Email address for wallet creation and authentication
- **Chain**: Blockchain network (`base-sepolia`, `base`, or `ethereum`)
- **Server URL**: URL of your 402-protected server (default: `http://localhost:3100`)

### Reactive Configuration

The interface automatically handles configuration changes:

- **Email Changes**: Automatically resets wallet (new email = new wallet required)
- **Chain Changes**: Refreshes balances and updates contract addresses
- **Server URL Changes**: Updates payment endpoints for 402 requests
- **Visual Indicators**: Shows warnings when configuration is out of sync

Default values:

```typescript
const DEFAULT_CONFIG = {
    testEmail: "angela.temp+demo13@example.com",
    chain: "base-sepolia",
    serverUrl: "http://localhost:3100",
};
```

## Notes

- Primarily designed for Base Sepolia testnet (deployment detection currently hardcoded to Base Sepolia)
- Requires USDC balance for payment settlement
- Pre-deployed wallets work for payment verification but may fail settlement
- Deployed wallets support full payment flow including settlement
- Chain selection affects wallet creation and payment processing, but deployment detection uses Base Sepolia RPC

## Learn More

- [Crossmint Wallets SDK](https://docs.crossmint.com/wallets)
- [x402 Payment Protocol](https://x402.org)
- [EIP-712 Typed Data](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-1271 Smart Contract Signatures](https://eips.ethereum.org/EIPS/eip-1271)


