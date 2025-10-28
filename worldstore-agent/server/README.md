# x402 Facilitator Server

A custom x402 payment facilitator that enables gasless onchain payments for [XMTP](https://docs.xmtp.org/) messaging applications

## What It Solves

The usual payment flow
1. Connect wallet (3 clicks)
2. Approve spending (transaction + gas)
3. Wait for confirmation (confirmation wait times)
4. Actually pay (another transaction + more gas)
5. Risk of merchant system timeouts

**This server eliminates all of that.** Users sign once, gaslessly. The facilitator handles everything else.

## How x402 Actually Works

The x402 protocol is quite simple:
1. **Client requests payment** → Server responds with 402 Payment Required
2. **Client signs authorization** → No blockchain interaction, just a signature
3. **Client retries with signature** → Server executes payment and fulfills order

> **Multi-Currency Payment Support**
>
> **Current limitation**: x402 protocol currently supports EIP-3009 compatible tokens, primarily USDC. For multi-currency support, you'll need to bypass x402.
>
> **The details**:
> - x402 enables gasless payments but only supports USDC
> - Crossmint APIs are chain/token agnostic—they work with any token you throw at them
> - To accept other tokens: remove the 402 server response code and let API calls go through directly
>
> **Implementation**: Skip the x402 middleware for multi-currency flows. Your users will handle gas fees, but you gain full token flexibility.
>
> **Need help with this setup?** [Contact our team](https://t.me/crossmintdevs) - we've helped other developers implement multi-currency flows and can walk you through the specifics.

```
Traditional Onchain Payment:         x402 Payment:

User → MetaMask popup                User → Sign once (gasless)
User → Approve transaction           Server → Execute when ready
User → Pay transaction               Server → Fulfill order
User → Wait for confirmations        User → Get product
User → Hope it works
```

## Why Build a Custom Facilitator?

The official x402 facilitator works well with Base and USDC. The custom facilitator extends functionality with these additional features:

- **Multi-network support** (Base, Ethereum, Polygon, Arbitrum)
- **Direct e-commerce integration** (Crossmint → Amazon)
- **Flexible fee structures** (because business models matter)
- **Production-ready error handling** (because things break)

> **Network Simplification:** While the payment server supports multiple networks, the XMTP agent is configured to work primarily with Base Sepolia and USDC on Base Sepolia for simplicity. This reduces complexity in wallet operations and balance checks while maintaining the core functionality. Additional networks can be added by extending the onchain tools and wallet configuration.

## Architecture

```
src/
├── config/          # Environment management (not another config framework)
├── routes/          # Express endpoints (REST API that works)
├── services/        # Business logic (Crossmint integration)
└── utils/           # Logging and helpers (actual useful utilities)
```

Clean, reliable, and maintainable architecture for production payment processing.

## Server Setup

### Prerequisites
- **Node.js 20+** (`node --version`)
- **Crossmint account** with API access (sign up at crossmint.com)
- **Crossmint treasury wallet** created and funded
- **Basic understanding of EIP-3009** (gasless USDC payments)

### Quick Start

```bash
# Install dependencies (from server directory)
pnpm install

# Copy and configure environment
cp .env.template .env
# Edit .env with your Crossmint credentials

# Start the server
pnpm dev  # Development with auto-reload
pnpm start  # Production mode
```

### Environment Configuration

**Critical Environment Variables:**

```bash
# Crossmint Integration (required)
CROSSMINT_API_KEY=sk_staging_...  # From Crossmint dashboard
CROSSMINT_ENVIRONMENT=staging  # or production
CROSSMINT_WALLET_ADDRESS=0x...  # Your treasury wallet address
CROSSMINT_WALLET_LOCATOR=email:user@domain.com:evm-smart-wallet

# Payment Configuration
CUSTOM_MIDDLEWARE_NETWORKS=ethereum-sepolia,base-sepolia  # Supported chains
CUSTOM_MIDDLEWARE_CURRENCIES=usdc  # Supported currencies
ORDER_FEE_PERCENTAGE=0  # Additional fee (0% = no markup)
ORDER_PAYMENT_TIMEOUT_MINUTES=10  # Payment validity window

# Server Configuration
PORT=3000
NODE_ENV=development
DEBUG=false  # Set true for detailed logging
```

**How to get Crossmint credentials:**
1. Sign up at [crossmint.com](https://crossmint.com)
2. Create API key in dashboard
3. Set up treasury wallet (for receiving payments)
4. Fund treasury wallet on your target networks

### Verify Server Setup

```bash
# Check server health
curl http://localhost:3000/api/orders/facilitator/health

# Should return status info including:
# - Supported networks
# - Supported currencies
# - Treasury wallet status

# Test with environment validation
pnpm start  # Will exit with clear error if env vars missing
```

**Server startup logs should show:**
```
Configuration:
   Networks: ethereum-sepolia, base-sepolia
   Currencies: usdc

[OK] Server running on port 3000
[OK] Treasury wallet configured: 0x...
[OK] Ready to process x402 payments
```

## The x402 Payment Dance

This is a two-step protocol that feels like one seamless flow:

### Step 1: Payment Requirements (402 Response)
Client asks to buy something, server responds with "Payment Required" and tells them exactly what to sign.

### Step 2: Payment Execution
Client comes back with a signature, server executes the payment and fulfills the order.

This streamlined flow reduces friction while maintaining security.

## API Reference: The Important Parts

### Product Locators (What You Can Buy)

The API accepts flexible product references:

```
Amazon Products:
- amazon:B08N5WRWNW                                    # Direct ASIN
- amazon:https://www.amazon.com/dp/B01DFKC2SO          # Full URL

Shopify Products (future):
- shopify:https://store.com/products/item:variant-id   # Product + variant
```

### Order Creation: The 402 Flow

**POST** `/api/orders` (without X-PAYMENT header)

```json
{
  "productLocator": "amazon:B08N5WRWNW",
  "email": "user@example.com",
  "physicalAddress": {
    "name": "John Doe",
    "line1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "US"
  },
  "payment": {
    "method": "ethereum-sepolia",
    "currency": "usdc"
  }
}
```

**Response: 402 Payment Required**
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "ethereum-sepolia",
    "maxAmountRequired": "1800000",  // 1.80 USDC (6 decimals)
    "payTo": "0x462...b87",          // Treasury wallet
    "asset": "0x1c7...238",          // USDC contract
    "maxTimeoutSeconds": 600,        // 10 minute timeout
    "extra": {
      "orderId": "cm_order_abc123"   // Track this order
    }
  }]
}
```

### Payment Execution: The Success

**POST** `/api/orders` (with X-PAYMENT header)

**Headers:**
```
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoi...  # Base64 payload
```

**X-PAYMENT Payload (before base64 encoding):**
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "ethereum-sepolia",
  "payload": {
    "authorization": {
      "from": "0x1234...",           // User's wallet
      "to": "0x462...b87",           // Treasury wallet
      "value": "1800000",            // Exact USDC amount
      "validAfter": "0",             // Valid immediately
      "validBefore": "1703127056",   // Expires in 10 min
      "nonce": "0xabc123..."         // Unique nonce
    },
    "signature": "0xdef456..."       // EIP-712 signature
  },
  "extra": {
    "orderId": "cm_order_abc123"     // Match from 402 response
  }
}
```

**Success Response: 200 OK**
```json
{
  "message": "Payment received and order fulfilled successfully",
  "order": {
    "orderId": "cm_order_abc123",
    "quote": {
      "totalPrice": { "amount": "1.80", "currency": "USD" }
    }
  },
  "fulfillment": {
    "success": true,
    "data": { "id": "tx_123" }
  }
}
```

### Health Check

**GET** `/api/orders/facilitator/health`

Returns server status and network connectivity. Use this for monitoring.

## Treasury Wallet

Your Crossmint treasury wallet is the financial engine of this system:

### What It Does
- **Receives user USDC payments** via `transferWithAuthorization`
- **Pays for Amazon orders** through Crossmint
- **Handles the float** between payment and fulfillment

### Critical Requirements
- **Fund it properly** on each network you support
- **Monitor balances** - orders fail when wallets are empty
- **Secure the credentials** - this wallet handles real money

## Payment Flow Deep Dive

Here's what happens when someone buys something:

1. **Order Request** → XMTP agent sends order details
2. **Price Lookup** → Server queries Crossmint for current pricing
3. **402 Response** → Server tells agent exactly what payment is needed
4. **Signature Generation** → Agent creates EIP-3009 authorization
5. **Payment Submission** → Agent retries request with X-PAYMENT header
6. **Payment Execution** → Server calls transferWithAuthorization on USDC contract
7. **Order Fulfillment** → Server places order with Crossmint → Amazon
8. **Confirmation** → User gets order ID and email confirmation

The steps 6-8 happen automatically once the signature is valid.

## Error Handling That Actually Helps

### Common Failure Modes

**Insufficient Treasury Funds:**
```json
{
  "error": "Treasury wallet insufficient balance on ethereum-sepolia",
  "details": "Need 1800000 USDC, have 500000 USDC"
}
```

**Invalid Signature:**
```json
{
  "error": "Payment authorization signature invalid",
  "details": "EIP-712 signature verification failed"
}
```

**Network Issues:**
```json
{
  "error": "Network ethereum-sepolia temporarily unavailable",
  "details": "RPC endpoint unresponsive, try base-sepolia"
}
```

**Order Fulfillment Failures:**
```json
{
  "error": "Crossmint order failed",
  "details": "Product unavailable or address invalid"
}
```

### Debug Mode

Enable detailed logging when things break:
```bash
DEBUG=true pnpm dev
```

This logs:
- x402 protocol message parsing
- EIP-3009 signature verification steps
- Crossmint API requests/responses
- Network RPC calls and responses

## Development Tools

### Payment Testing Script
```bash
# Generate a test payment signature
node scripts/generate-payment.mjs

# This creates a full x402 payment payload you can use for testing
```

### Environment Validation
```bash
# Check that all required env vars are set
npm run validate-env

# Verify treasury wallet connectivity
npm run check-wallets
```

### Production Checklist
- [ ] Treasury wallets funded on all target networks
- [ ] Crossmint API keys valid and active
- [ ] RPC endpoints configured with fallbacks
- [ ] Monitoring and alerting configured
- [ ] Error handling tested with invalid payments
- [ ] Rate limiting configured appropriately

## Why This Works

- Traditional onchain payments fail because they put blockchain complexity on users. The x402 protocol moves that complexity to servers that can handle it properly.
- Users sign once, gaslessly. Servers handle network fees, transaction timing, error recovery, and order fulfillment. The result feels like traditional payments but uses onchain settlement.
- This server is the financial infrastructure that makes onchain commerce feel normal. Your users get to focus on shopping, not blockchain mechanics.