export type SupportedChain = 'base-sepolia' | 'base' | 'ethereum';

export interface Config {
    testEmail: string;
    chain: SupportedChain;
    serverUrl: string;
}

export interface LogEntry {
    timestamp: number;
    type: 'info' | 'success' | 'error' | 'warning';
    message: string;
}

export interface WalletState {
    wallet: any | null;
    isDeployed: boolean;
    deploymentTx: string;
}

export interface BalanceState {
    eth: string | null;
    usdc: string | null;
    isLoading: boolean;
}

export interface ChainConfig {
    chain: any;
    rpc: string;
}