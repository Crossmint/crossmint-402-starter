import { paymentMiddleware } from 'x402-next';

const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS as `0x${string}`;
const NETWORK = (process.env.X402_NETWORK || 'base-sepolia') as any;
const PRICE_USDC = process.env.PRICE_USDC || '1';

// Validate required environment variables
if (!MERCHANT_ADDRESS) {
  throw new Error(
    '❌ MERCHANT_ADDRESS is not set in environment variables.\n' +
    'Create sendvia/.env.local from env.example and set MERCHANT_ADDRESS'
  );
}

export const middleware = paymentMiddleware(
  MERCHANT_ADDRESS,
  {
    '/api/tweet': {
      price: `$${PRICE_USDC}`,
      network: NETWORK,
      config: {
        description: 'Post a tweet to X/Twitter'
      }
    }
  },
  {
    url: 'https://x402.org/facilitator'
  }
);

export const config = {
  matcher: ['/api/tweet']
};

