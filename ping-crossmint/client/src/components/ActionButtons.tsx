import React from 'react';
import type { WalletState, BalanceState } from '../types';

interface ActionButtonsProps {
    walletState: WalletState;
    balanceState: BalanceState;
    apiKey: string;
    onInitializeWallet: () => void;
    onDeployWallet: () => void;
    onRefreshBalance: () => void;
    onMakePing: () => void;
    loadingStates: {
        initializeWallet: boolean;
        deployWallet: boolean;
        refreshBalance: boolean;
        makePayment: boolean;
        approvePayment: boolean;
    };
    isCriticalLoading: boolean;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
    walletState,
    balanceState,
    apiKey,
    onInitializeWallet,
    onDeployWallet,
    onRefreshBalance,
    onMakePing,
    loadingStates,
    isCriticalLoading
}) => {
    const { wallet, isDeployed } = walletState;
    const { isLoading } = balanceState;

    return (
        <>
            {!wallet && (
                <button
                    onClick={onInitializeWallet}
                    disabled={!apiKey || loadingStates.initializeWallet || isCriticalLoading}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: apiKey && !loadingStates.initializeWallet && !isCriticalLoading ? '#007bff' : '#ccc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: apiKey && !loadingStates.initializeWallet && !isCriticalLoading ? 'pointer' : 'not-allowed',
                        fontSize: '14px'
                    }}
                >
                    {loadingStates.initializeWallet ? '⏳ Initializing...' : '🚀 Initialize Wallet'}
                </button>
            )}

            {wallet && (
                <>
                    <button
                        onClick={onDeployWallet}
                        disabled={isDeployed || loadingStates.deployWallet || isCriticalLoading}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: isDeployed ? '#28a745' : (loadingStates.deployWallet || isCriticalLoading ? '#ccc' : '#ff8800'),
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: (isDeployed || loadingStates.deployWallet || isCriticalLoading) ? 'not-allowed' : 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        {loadingStates.deployWallet ? '⏳ Deploying...' : (isDeployed ? '✅ Deployed' : '🚀 Deploy Wallet')}
                    </button>

                    <button
                        onClick={onRefreshBalance}
                        disabled={isLoading || loadingStates.refreshBalance || isCriticalLoading}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: !isLoading && !loadingStates.refreshBalance && !isCriticalLoading ? '#28a745' : '#ccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: !isLoading && !loadingStates.refreshBalance && !isCriticalLoading ? 'pointer' : 'not-allowed',
                            fontSize: '14px'
                        }}
                    >
                        {loadingStates.refreshBalance ? '⏳ Refreshing...' : (isLoading ? '⏳ Loading...' : '🔄 Refresh Balance')}
                    </button>

                    <button
                        onClick={onMakePing}
                        disabled={loadingStates.makePayment || isCriticalLoading}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: !loadingStates.makePayment && !isCriticalLoading ? '#17a2b8' : '#ccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: !loadingStates.makePayment && !isCriticalLoading ? 'pointer' : 'not-allowed',
                            fontSize: '14px'
                        }}
                        title="Make a payment request to the 402-protected endpoint"
                    >
                        {loadingStates.makePayment ? '⏳ Making Ping...' : '🏓 Make Ping'}
                    </button>
                </>
            )}
        </>
    );
};