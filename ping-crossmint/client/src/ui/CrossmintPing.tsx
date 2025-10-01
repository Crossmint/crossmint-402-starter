import { useState, useEffect } from 'react';
import { useConfiguration } from '../hooks/useConfiguration';
import { useCrossmintWallet } from '../hooks/useCrossmintWallet';
import { useX402Payments } from '../hooks/useX402Payments';
import { useWalletBalances } from '../hooks/useWalletBalances';
import { ConfigurationPanel, WalletDisplay, ActionButtons, ActivityLogs, ServerStatus, PaymentApproval } from '../components';
import type { LogEntry } from '../types';


interface CrossmintPingProps {
    apiKey: string;
    setApiKey: (key: string) => void;
}

export function CrossmintPing({ apiKey, setApiKey }: CrossmintPingProps) {
    // Configuration management
    const { config, configHash, updateEmail, updateChain, updateServerUrl } = useConfiguration();

    // State management
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [paymentRequest, setPaymentRequest] = useState<{
        amount: string;
        currency: string;
        recipient: string;
        network: string;
        rawResponse: any;
    } | null>(null);
    const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(true);

    // Individual loading states for each action
    const [loadingStates, setLoadingStates] = useState({
        initializeWallet: false,
        deployWallet: false,
        refreshBalance: false,
        makePayment: false,
        approvePayment: false
    });

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        setLogs(prev => [...prev, { timestamp: Date.now(), type, message }]);
    };

    const clearLogs = () => setLogs([]);

    // Helper function to manage individual loading states
    const setLoading = (action: keyof typeof loadingStates, isLoading: boolean) => {
        setLoadingStates(prev => ({ ...prev, [action]: isLoading }));
    };

    // Check if any critical action is loading (prevents concurrent operations)
    const isCriticalLoading = loadingStates.initializeWallet || loadingStates.deployWallet || loadingStates.approvePayment;

    // Core Crossmint wallet functionality
    const {
        walletState,
        initializeWallet: initializeWalletHook,
        deployWalletOnChain: deployWalletHook,
        resetWallet
    } = useCrossmintWallet({
        apiKey,
        email: config.testEmail,
        chain: config.chain,
        onLog: addLog
    });

    // X402 payment functionality
    const {
        requestPayment: requestPaymentHook,
        executePayment: executePaymentHook
    } = useX402Payments({
        serverUrl: config.serverUrl,
        onLog: addLog
    });

    // Wallet balance management
    const {
        balanceState,
        fetchBalances: fetchBalancesHook,
        resetBalances
    } = useWalletBalances({
        walletAddress: walletState.wallet?.address || null,
        chain: config.chain,
        onLog: addLog
    });

    // Reset wallet when configuration changes (email requires new wallet)
    useEffect(() => {
        if (walletState.wallet) {
            resetWallet();
            resetBalances();
            setPaymentRequest(null); // Clear any pending payment requests
        }
    }, [configHash]);

    // Wrapper functions with individual loading states
    const initializeWallet = async () => {
        setLoading('initializeWallet', true);
        try {
            await initializeWalletHook();
        } finally {
            setLoading('initializeWallet', false);
        }
    };

    const deployWallet = async () => {
        setLoading('deployWallet', true);
        try {
            await deployWalletHook();
        } finally {
            setLoading('deployWallet', false);
        }
    };

    const fetchWalletBalances = async () => {
        setLoading('refreshBalance', true);
        try {
            await fetchBalancesHook();
        } finally {
            setLoading('refreshBalance', false);
        }
    };

    // Handle making a payment request (step to get 402 response)
    const handlePaymentRequest = async () => {
        if (!walletState.wallet) {
            addLog("❌ No wallet available. Please initialize wallet first.", 'error');
            return;
        }

        setLoading('makePayment', true);
        try {
            const paymentDetails = await requestPaymentHook(walletState.wallet);
            if (paymentDetails) {
                setPaymentRequest(paymentDetails);
                addLog("💳 Payment required! Please review and approve the payment.", 'warning');
            }
        } finally {
            setLoading('makePayment', false);
        }
    };

    // Handle approving a payment
    const handleApprovePayment = async () => {
        if (!walletState.wallet || !paymentRequest) {
            addLog("❌ No wallet or payment request available", 'error');
            return;
        }

        setLoading('approvePayment', true);
        try {
            addLog("✅ Payment approved by user - executing payment...", 'success');
            await executePaymentHook(walletState.wallet, paymentRequest);
            setPaymentRequest(null); // Clear the payment request
        } finally {
            setLoading('approvePayment', false);
        }
    };

    // Handle declining a payment
    const handleDeclinePayment = () => {
        addLog("❌ Payment declined by user", 'warning');
        setPaymentRequest(null); // Clear the payment request
    };

    // Auto-refresh balances when chain changes (if wallet exists)
    useEffect(() => {
        if (walletState.wallet) {
            fetchWalletBalances();
            addLog(`🔄 Chain changed to ${config.chain} - refreshing balances`, 'info');
        }
    }, [config.chain]);

    // Fetch balances after wallet initialization
    useEffect(() => {
        if (walletState.wallet) {
            fetchWalletBalances();
        }
    }, [walletState.wallet]);

    // Auto-collapse instructions when wallet is displayed
    useEffect(() => {
        if (walletState.wallet && isInstructionsExpanded) {
            setIsInstructionsExpanded(false);
        }
    }, [walletState.wallet]);



    const isApiKeyValid = apiKey.startsWith('sk_');

    return (
        <div style={{
            maxWidth: 1200,
            margin: '2rem auto',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: '0 1rem'
        }}>
            <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>
                Crossmint Wallet + 402 Payment Demo
            </h1>

            {/* Two-column layout */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '2rem',
                alignItems: 'start',
                minHeight: '700px'
            }}>
                {/* Left Column - Configuration & Info */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    height: 'fit-content',
                    position: 'sticky',
                    top: '1rem'
                }}>
                    {/* Configuration */}
                    <ConfigurationPanel
                        config={config}
                        onUpdateEmail={updateEmail}
                        onUpdateChain={updateChain}
                        onUpdateServerUrl={updateServerUrl}
                        apiKey={apiKey}
                        onUpdateApiKey={setApiKey}
                        isMinimal={false}
                    />

                    {/* Server Status */}
                    <ServerStatus
                        serverUrl={config.serverUrl}
                        autoRefresh={true}
                        refreshInterval={30000}
                    />

                    {/* API Key validation message */}
                    {!isApiKeyValid && (
                        <div style={{
                            background: '#e7f3ff',
                            border: '1px solid #b8daff',
                            borderRadius: '8px',
                            padding: '1rem',
                            textAlign: 'center'
                        }}>
                            <div style={{ color: '#004085', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                                🔑 Enter your Crossmint Server API Key to get started
                            </div>
                            <div style={{ color: '#004085', fontSize: '14px' }}>
                                Your API key should start with 'sk_' (server key). Once entered, wallet functionality will be available.
                            </div>
                        </div>
                    )}

                    {/* Wallet Overview - Info Display */}
                    {walletState.wallet && (
                        <WalletDisplay
                            walletState={walletState}
                            balanceState={balanceState}
                            config={config}
                        />
                    )}

                    {/* Instructions - Collapsible Accordion */}
                    <div style={{
                        background: '#e7f3ff',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        border: '1px solid #b8daff',
                        overflow: 'hidden',
                        transition: 'all 0.3s ease'
                    }}>
                        {/* Header - Always visible */}
                        <div
                            style={{
                                padding: '1rem',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                userSelect: 'none'
                            }}
                            onClick={() => setIsInstructionsExpanded(!isInstructionsExpanded)}
                        >
                            <h4 style={{ margin: 0 }}>ℹ️ How the Manual x402 + Crossmint flow works</h4>
                            <span style={{
                                fontSize: '18px',
                                transform: isInstructionsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s ease'
                            }}>
                                ▼
                            </span>
                        </div>

                        {/* Content - Collapsible */}
                        <div style={{
                            maxHeight: isInstructionsExpanded ? '1000px' : '0px',
                            overflow: 'hidden',
                            transition: 'max-height 0.5s ease-in-out'
                        }}>
                            <div style={{
                                padding: '0 1rem 1rem 1rem',
                                borderTop: '1px solid #b8daff'
                            }}>
                                <ol style={{ marginLeft: '1rem', lineHeight: '1.6', fontSize: '0.85rem', marginTop: '1rem' }}>
                                    <li><strong>Initialize Wallet:</strong> Creates a Crossmint smart wallet using server API key</li>
                                    <li><strong>Deploy Wallet (Optional):</strong> Deploys wallet on-chain for settlement capability</li>
                                    <li><strong>Request Protected Content:</strong> Click "Make Ping" to request /ping endpoint</li>
                                    <li><strong>Server Returns 402:</strong> Server responds with payment details ($0.001 USDC)</li>
                                    <li><strong>Payment Approval UI:</strong> Client displays payment details with Approve/Decline options</li>
                                    <li><strong>User Decision:</strong> User reviews amount, recipient, network and decides to approve or decline</li>
                                    <li><strong>Payment Execution:</strong> If approved, Crossmint wallet signs the payment authorization</li>
                                    <li><strong>Server Verifies & Responds:</strong> Server validates signature and returns protected content</li>
                                </ol>
                                <div style={{ background: '#fff3cd', padding: '0.75rem', borderRadius: '4px', margin: '1rem 0', fontSize: '0.8rem', border: '1px solid #ffeaa7' }}>
                                    <p style={{ margin: '0 0 8px 0' }}><strong>⚡ Manual Flow:</strong> This demo shows the x402 payment details before executing, giving users full control!</p>
                                    <p style={{ margin: 0 }}>The server still sets the payment amount ($0.001), but now you can see and approve each payment.</p>
                                </div>
                                <p style={{ fontSize: '0.8rem', margin: 0 }}><strong>💡 Note:</strong> This demonstrates transparent micropayments where users can review payment details before authorizing the transaction.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Interactions & Activity */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    height: '700px',
                    maxHeight: '700px'
                }}>
                    {/* Wallet functionality - only show when API key is valid */}
                    {isApiKeyValid ? (
                        <>
                            {/* Configuration Change Warning */}
                            {!walletState.wallet && logs.some(log => log.message.includes("Configuration changed")) && (
                                <div style={{
                                    background: '#fff3cd',
                                    border: '1px solid #ffeaa7',
                                    borderRadius: '8px',
                                    padding: '1rem'
                                }}>
                                    <div style={{ color: '#856404', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                                        ⚠️ Configuration Changed
                                    </div>
                                    <div style={{ color: '#856404', fontSize: '14px' }}>
                                        Your configuration has changed. Please initialize a new wallet with the updated settings.
                                    </div>
                                </div>
                            )}


                            {/* Payment approval */}
                            {paymentRequest && (
                                <PaymentApproval
                                    paymentRequest={paymentRequest}
                                    onApprove={handleApprovePayment}
                                    onDecline={handleDeclinePayment}
                                    isProcessing={loadingStates.approvePayment}
                                />
                            )}

                            {/* Action buttons */}
                            <div style={{
                                display: 'flex',
                                gap: '12px',
                                flexWrap: 'wrap',
                                alignItems: 'center'
                            }}>
                                <ActionButtons
                                    walletState={walletState}
                                    balanceState={balanceState}
                                    apiKey={apiKey}
                                    onInitializeWallet={initializeWallet}
                                    onDeployWallet={deployWallet}
                                    onRefreshBalance={fetchWalletBalances}
                                    onMakePing={handlePaymentRequest}
                                    loadingStates={loadingStates}
                                    isCriticalLoading={isCriticalLoading}
                                />
                                <button
                                    onClick={clearLogs}
                                    style={{
                                        padding: '10px 20px',
                                        backgroundColor: '#6c757d',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    🗑️ Clear Logs
                                </button>
                            </div>

                            {/* Activity Logs - Expand to fill remaining space */}
                            <div style={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'hidden'
                            }}>
                                <ActivityLogs logs={logs} />
                            </div>
                        </>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            color: '#666',
                            fontStyle: 'italic',
                            padding: '2rem'
                        }}>
                            Enter your Crossmint API key to begin the demo
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}