// Shared types for the conversational UI

import type { Wallet } from "@crossmint/wallets-sdk";

export interface Tool {
  name: string;
  description: string;
  isPaid: boolean;
  price: number | null;
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  resource: string;
  description: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  timestamp: Date;
  text: string;

  // Optional inline components
  inlineComponent?: {
    type: 'wallet-card' | 'tools-list' | 'secret-result' | 'tx-link';
    data: any;
  };

  // Optional action buttons
  actions?: Array<{
    label: string;
    action: string;
    variant: 'primary' | 'secondary' | 'danger';
  }>;
}

export interface Log {
  type: 'client' | 'server' | 'system' | 'payment' | 'result' | 'error' | 'info';
  text: string;
  timestamp: Date;
}

export interface WalletInfo {
  guestAddress: string;
  hostAddress: string;
  network: string;
  guestWalletDeployed: boolean;
}

export interface Transaction {
  id: string;
  type: 'payment' | 'deployment';
  timestamp: Date;
  amount?: string;
  from?: string;
  to?: string;
  resource?: string;
  txHash?: string;
  status: 'success' | 'failed' | 'pending';
}

// Authentication & Wallet Types
export interface OTPAuthHandlers {
  sendEmailWithOtp?: () => Promise<void>;
  verifyOtp?: (otp: string) => Promise<void>;
  reject?: () => void;
}

export interface WalletState {
  wallet: Wallet<any> | null;
  isDeployed: boolean;
  deploymentTx: string;
  otpRequired: boolean;
  otpSent: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: {
    email?: string;
    userId?: string;
  } | null;
  jwt: string | null;
  isLoading: boolean;
}

// Signer types
export type SignerType = 'api-key' | 'email-otp';
