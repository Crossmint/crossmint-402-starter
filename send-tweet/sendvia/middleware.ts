import { paymentMiddleware } from 'x402-next';
import type { Resource } from 'x402/types';
import { NextRequest, NextResponse } from 'next/server';

const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS as `0x${string}`;
const NETWORK = (process.env.X402_NETWORK || 'base-sepolia') as any;
const PRICE_USDC = process.env.PRICE_USDC || '1';
const RESOURCE_URL = process.env.NEXT_PUBLIC_APP_URL as Resource; // e.g., 'https://sendvia-demo.vercel.app'

// Validate required environment variables
if (!MERCHANT_ADDRESS) {
  throw new Error(
    '❌ MERCHANT_ADDRESS is not set in environment variables.\n' +
    'Create sendvia/.env.local from env.example and set MERCHANT_ADDRESS'
  );
}

// Create the x402 payment middleware
const x402Middleware = paymentMiddleware(
  MERCHANT_ADDRESS,
  {
    '/api/tweet': {
      price: `$${PRICE_USDC}`,
      network: NETWORK,
      config: {
        description: 'Post a tweet to X/Twitter',
        // Explicitly set resource URL for production deployments (Vercel)
        // This ensures consistent URL even behind proxies
        ...(RESOURCE_URL && { resource: `${RESOURCE_URL}/api/tweet` as Resource })
      }
    }
  },
  {
    url: 'https://x402.org/facilitator'
  }
);

// Wrapper middleware with comprehensive logging
export async function middleware(request: NextRequest) {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔵 [${timestamp}] [${requestId}] MIDDLEWARE START`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Log request details
  console.log(`📍 Request Details:`);
  console.log(`   Method: ${request.method}`);
  console.log(`   URL: ${request.url}`);
  console.log(`   Pathname: ${request.nextUrl.pathname}`);
  console.log(`   Protocol: ${request.nextUrl.protocol}`);
  console.log(`   Host: ${request.nextUrl.host}`);

  // Log proxy headers (important for Vercel)
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedFor = request.headers.get('x-forwarded-for');

  console.log(`\n🔀 Proxy Headers:`);
  console.log(`   x-forwarded-proto: ${forwardedProto || 'not set'}`);
  console.log(`   x-forwarded-host: ${forwardedHost || 'not set'}`);
  console.log(`   x-forwarded-for: ${forwardedFor || 'not set'}`);

  // Determine resource URL
  const resourceUrl = RESOURCE_URL
    ? `${RESOURCE_URL}/api/tweet`
    : forwardedProto && forwardedHost
    ? `${forwardedProto}://${forwardedHost}/api/tweet`
    : `${request.nextUrl.protocol}//${request.nextUrl.host}/api/tweet`;

  console.log(`\n🎯 Computed Resource URL: ${resourceUrl}`);

  // Log payment header if present
  const paymentHeader = request.headers.get('X-PAYMENT');
  if (paymentHeader) {
    console.log(`\n💳 Payment Header Present:`);
    console.log(`   Length: ${paymentHeader.length} chars`);
    console.log(`   Preview: ${paymentHeader.substring(0, 100)}...`);
  } else {
    console.log(`\n💳 No Payment Header (expecting 402 response)`);
  }

  // Log environment config
  console.log(`\n⚙️  Configuration:`);
  console.log(`   Merchant: ${MERCHANT_ADDRESS}`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`   Price: $${PRICE_USDC} USDC`);
  console.log(`   Facilitator: https://x402.org/facilitator`);
  console.log(`   Resource URL Env: ${RESOURCE_URL || 'not set (auto-detected)'}`);
  console.log(`   Resource URL Used: ${resourceUrl}`);

  try {
    console.log(`\n🔄 Calling x402 payment middleware...`);
    const response = await x402Middleware(request);

    console.log(`\n✅ Middleware Response:`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Status Text: ${response.statusText}`);

    // Log response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    console.log(`   Headers: ${JSON.stringify(responseHeaders, null, 2)}`);

    // If 402 response, log the payment requirements
    if (response.status === 402) {
      try {
        const clonedResponse = response.clone();
        const body = await clonedResponse.json();
        console.log(`\n💰 Payment Required Response Body:`);
        console.log(JSON.stringify(body, null, 2));
      } catch (e) {
        console.log(`   (Could not parse response body)`);
      }
    }

    console.log(`\n🔵 [${requestId}] MIDDLEWARE END - Status: ${response.status}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return response;
  } catch (error: any) {
    console.error(`\n❌ [${requestId}] MIDDLEWARE ERROR:`);
    console.error(error);
    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    throw error;
  }
}

export const config = {
  matcher: ['/api/tweet'],
  runtime: 'nodejs' // Use Node.js runtime instead of Edge
};

