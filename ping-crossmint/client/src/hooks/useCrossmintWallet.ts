/**
 * Core Crossmint wallet functionality
 * Demonstrates the essential Crossmint SDK usage patterns
 */

import { useState, useCallback } from 'react';
import { CrossmintWallets, createCrossmint } from "@crossmint/wallets-sdk";
import { checkWalletDeployment, deployWallet } from '../utils/walletGuards';
import type { WalletState, SupportedChain } from '../types';

interface UseCrossmintWalletProps {
  apiKey: string;
  email: string;
  chain: SupportedChain;
  onLog: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

export function useCrossmintWallet({ apiKey, email, chain, onLog }: UseCrossmintWalletProps) {
  const [walletState, setWalletState] = useState<WalletState>({
    wallet: null,
    isDeployed: false,
    deploymentTx: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const initializeWallet = useCallback(async () => {
    if (!apiKey.startsWith('sk_')) {
      onLog("❌ Invalid API key. Please use a server API key (starts with 'sk_')", 'error');
      return;
    }

    try {
      setIsProcessing(true);
      onLog("🚀 Initializing Crossmint wallet...");

      // Core Crossmint SDK usage - this is what users need to see!
      const crossmint = createCrossmint({ apiKey });
      const crossmintWallets = CrossmintWallets.from(crossmint);

      const wallet = await crossmintWallets.createWallet({
        chain,
        signer: { type: "api-key" as const },
        owner: `email:${email}`,
      });

      onLog("✅ Crossmint wallet created!", 'success');
      onLog(`📍 Wallet address: ${wallet.address}`, 'success');

      // Check deployment status
      const isDeployed = await checkWalletDeployment(wallet.address, chain);
      onLog(`🏗️ Wallet status: ${isDeployed ? 'deployed' : 'pre-deployed'}`, 'info');

      setWalletState({
        wallet,
        isDeployed,
        deploymentTx: ''
      });

    } catch (error) {
      onLog(`❌ Wallet creation failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [apiKey, email, chain, onLog]);

  const deployWalletOnChain = useCallback(async () => {
    if (!walletState.wallet) {
      onLog("❌ No wallet to deploy", 'error');
      return;
    }

    try {
      setIsProcessing(true);
      onLog("🚀 Deploying wallet on-chain...");

      const txHash = await deployWallet(walletState.wallet);

      onLog("✅ Wallet deployed successfully!", 'success');
      onLog(`📝 Transaction: ${txHash}`, 'success');

      setWalletState(prev => ({
        ...prev,
        isDeployed: true,
        deploymentTx: txHash
      }));

    } catch (error) {
      onLog(`❌ Deployment failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [walletState.wallet, onLog]);

  const resetWallet = useCallback(() => {
    setWalletState({
      wallet: null,
      isDeployed: false,
      deploymentTx: ''
    });
    onLog("🔄 Wallet reset", 'info');
  }, [onLog]);

  return {
    walletState,
    isProcessing,
    initializeWallet,
    deployWalletOnChain,
    resetWallet
  };
}