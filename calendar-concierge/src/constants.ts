/**
 * Application constants and configuration
 */

// USDC contract address on Base Sepolia
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// x402 facilitator server
export const FACILITATOR_URL = "https://x402.org/facilitator";

// Network configuration
export const NETWORK = "base-sepolia";
export const CHAIN_ID = 84532;

// Wallet locators for consistent agent identities
export const HOST_WALLET_LOCATOR = "userId:secret-host-agent:evm:smart";
export const GUEST_WALLET_LOCATOR = "userId:crossmint-pay-agent-1:evm:smart";

// Helper to convert USD string to atomic units (USDC has 6 decimals)
export function usdToAtomicUnits(usdAmount: string): string {
  const amount = parseFloat(usdAmount);
  return Math.floor(amount * 1_000_000).toString();
}

// Helper to convert atomic units back to USD
export function atomicUnitsToUsd(atomicUnits: string): string {
  const amount = parseInt(atomicUnits);
  return (amount / 1_000_000).toFixed(6);
}
