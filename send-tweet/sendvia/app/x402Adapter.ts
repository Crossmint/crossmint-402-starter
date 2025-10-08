/**
 * Utility to adapt Crossmint wallets for x402 payment protocol
 * Based on ping-crossmint implementation
 */

import { EVMWallet, type Wallet } from "@crossmint/wallets-sdk";
import type { Signer } from "x402/types";

/**
 * Convert a Crossmint wallet to an x402-compatible signer
 * Handles ERC-6492 and EIP-1271 signature formats
 */
export function createX402Signer(wallet: Wallet<any>): Signer {
  const evm = EVMWallet.from(wallet);

  const signer: any = {
    account: { address: evm.address },
    chain: { id: 84532 }, // Base Sepolia
    transport: {},

    async signTypedData(params: any) {
      const { domain, message, primaryType, types } = params;

      // Sign with Crossmint wallet
      const sig = await evm.signTypedData({
        domain,
        message,
        primaryType,
        types,
        chain: evm.chain as any
      } as any);

      return processSignature(sig.signature as string);
    }
  };

  return signer as Signer;
}

/**
 * Process and normalize signature formats for x402 compatibility
 */
function processSignature(rawSignature: string): `0x${string}` {
  const signature = ensureHexPrefix(rawSignature);

  // Handle ERC-6492 wrapped signatures (for pre-deployed wallets)
  if (isERC6492Signature(signature)) {
    return signature;
  }

  // Handle EIP-1271 signatures (for deployed smart contract wallets)
  if (signature.length === 174) {
    return signature;
  }

  // Handle standard ECDSA signatures (65 bytes / 132 hex chars)
  if (signature.length === 132) {
    return signature;
  }

  // Handle non-standard lengths - try to extract standard signature
  if (signature.length > 132) {
    return ('0x' + signature.slice(-130)) as `0x${string}`;
  }

  return signature;
}

/**
 * Ensure signature has 0x prefix
 */
function ensureHexPrefix(signature: string): `0x${string}` {
  return (signature.startsWith('0x') ? signature : `0x${signature}`) as `0x${string}`;
}

/**
 * Check if signature is ERC-6492 wrapped
 */
function isERC6492Signature(signature: string): boolean {
  return signature.endsWith("6492649264926492649264926492649264926492649264926492649264926492");
}
