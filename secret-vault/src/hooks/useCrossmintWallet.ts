/**
 * Core Crossmint wallet functionality with API key signer
 * Uses server-side API key authentication
 */

import { useState, useCallback } from 'react';
import { CrossmintWallets, createCrossmint } from "@crossmint/wallets-sdk";
import { checkWalletDeployment, deployWallet } from '../x402Adapter';
import type { WalletState } from '../types';

interface UseCrossmintWalletProps {
  apiKey: string;
  email: string; // Email for wallet owner locator
  onLog: (type: 'client' | 'server' | 'system' | 'payment' | 'result' | 'error', text: string) => void;
}

export function useCrossmintWallet({ apiKey, email, onLog }: UseCrossmintWalletProps) {

  const [walletState, setWalletState] = useState<WalletState>({
    wallet: null,
    isDeployed: false,
    deploymentTx: '',
    otpRequired: false,
    otpSent: false
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const initializeWallet = useCallback(async () => {
    // Validate API key
    if (!apiKey.startsWith('sk_')) {
      onLog('error', "❌ Invalid API key. Please use a server API key (starts with 'sk_')");
      return;
    }

    if (!email) {
      onLog('error', "❌ Email is required for wallet initialization");
      return;
    }

    try {
      setIsProcessing(true);
      onLog('system', `🚀 Initializing Crossmint wallet with API key signer for ${email}...`);

      // Create Crossmint client with server API key
      const crossmint = createCrossmint({
        apiKey
      });
      const crossmintWallets = CrossmintWallets.from(crossmint);

      // Use createWallet for server-side API key signer
      const wallet = await crossmintWallets.createWallet({
        chain: "base-sepolia" as any,
        signer: { type: "api-key" as const },
        owner: `email:${email}`
      });

      onLog('system', "✅ Crossmint wallet created!");
      onLog('system', `📍 Wallet address: ${wallet.address}`);

      // Check deployment status
      const isDeployed = await checkWalletDeployment(wallet.address, "base-sepolia");
      onLog('system', `🏗️ Wallet status: ${isDeployed ? 'deployed' : 'pre-deployed'}`);

      setWalletState({
        wallet,
        isDeployed,
        deploymentTx: '',
        otpRequired: false,
        otpSent: false
      });

    } catch (error) {
      onLog('error', `❌ Wallet creation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [apiKey, email, onLog]);

  const deployWalletOnChain = useCallback(async () => {
    if (!walletState.wallet) {
      onLog('error', "❌ No wallet to deploy");
      return;
    }

    try {
      setIsProcessing(true);
      onLog('system', "🚀 Deploying wallet on-chain...");

      const txHash = await deployWallet(walletState.wallet);

      onLog('system', "✅ Wallet deployed successfully!");
      onLog('system', `📝 Transaction: ${txHash}`);

      setWalletState(prev => ({
        ...prev,
        isDeployed: true,
        deploymentTx: txHash
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onLog('error', `❌ Deployment failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [walletState.wallet, onLog]);

  const resetWallet = useCallback(() => {
    setWalletState({
      wallet: null,
      isDeployed: false,
      deploymentTx: '',
      otpRequired: false,
      otpSent: false
    });
    onLog('system', "🔄 Wallet reset");
  }, [onLog]);

  return {
    walletState,
    isProcessing,
    initializeWallet,
    deployWalletOnChain,
    resetWallet
  };
}
