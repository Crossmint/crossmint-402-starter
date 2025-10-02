# ping-crossmint

Demonstrates Crossmint smart wallet integration with the x402 payment protocol.

## What it does

A React client and Express server that show how Crossmint wallets handle HTTP 402 payment-required responses. The client creates a smart wallet, makes requests to protected endpoints, and signs payment authorizations. The server uses x402 middleware to require payment before serving content.

## Components

**Client** (React + Vite)
- Crossmint wallet creation via SDK
- Two signer types: API key (server-side) and Email OTP (client-side)
- x402 payment interceptor integration
- Wallet deployment utilities
- Balance checking (ETH, USDC)

**Server** (Express)
- x402 payment middleware
- Protected `/ping` endpoint requiring $0.001 USDC
- EIP-712 signature verification
- Health check endpoint at `/health`

## Setup

Requires Node.js 18+ and a Crossmint API key:
- Server API key (`sk_*`) for API key signer
- Client API key (`ck_*`) for Email OTP signer

**Server:**
```bash
cd server
npm install
npm run dev  # http://localhost:3100
```

**Client:**
```bash
cd client
npm install
npm run dev  # http://localhost:5174
```

## Usage

1. Open http://localhost:5174
2. Enter your Crossmint API key
3. Configure email, chain (base-sepolia/base/ethereum), and server URL
4. Click "Initialize Wallet" to create a smart wallet
5. Optionally deploy the wallet on-chain
6. Click "Make Ping" to trigger a 402 payment flow
7. Review and approve the payment request
8. Client signs payment and retries request

## Payment flow

1. Client requests protected endpoint
2. Server returns 402 with payment requirements
3. UI displays payment approval dialog
4. User approves payment
5. Crossmint wallet signs EIP-712 authorization
6. Client retries request with signature in `X-PAYMENT` header
7. Server verifies signature and returns content
8. External facilitator settles payment on-chain

## Technical details

**Signer types:**
- API key: Server-side signer using `createWallet()`, requires `sk_*` key
- Email OTP: Client-side signer using `getOrCreateWallet()`, requires `ck_*` key and JWT from `CrossmintAuthProvider`

**Signatures:**
- Pre-deployed wallets: ERC-6492 wrapped signatures
- Deployed wallets: EIP-1271 contract signatures
- Adapter handles signature format conversion for x402

**Deployment:**
- Wallets start pre-deployed (counterfactual addresses)
- Optional deployment via self-transfer (1 wei)
- Deployment check queries contract bytecode via viem

## Key files

- [client/src/hooks/useCrossmintWallet.ts](client/src/hooks/useCrossmintWallet.ts) - Wallet initialization and deployment
- [client/src/hooks/useX402Payments.ts](client/src/hooks/useX402Payments.ts) - Payment request/execution logic
- [client/src/utils/x402Adapter.ts](client/src/utils/x402Adapter.ts) - Crossmint to x402 signer adapter
- [client/src/utils/walletGuards.ts](client/src/utils/walletGuards.ts) - Deployment utilities
- [server/src/server.ts](server/src/server.ts) - Express server with x402 middleware

## Dependencies

Client: `@crossmint/wallets-sdk`, `@crossmint/client-sdk-react-ui`, `x402-axios`, `viem`, `axios`
Server: `express`, `x402-express`, `cors`

## References

- [Crossmint Wallets SDK](https://docs.crossmint.com/wallets)
- [x402 Payment Protocol](https://x402.org)
- [EIP-712: Typed Data Signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-1271: Contract Signatures](https://eips.ethereum.org/EIPS/eip-1271)
- [ERC-6492: Pre-deployed Contract Signatures](https://eips.ethereum.org/EIPS/eip-6492)


