'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { CrossmintWallets, createCrossmint, EVMWallet } from "@crossmint/wallets-sdk";
import { createX402Signer } from './x402Adapter';
import { fetchWalletBalances } from './utils/balances';
import './globals.css';

const TWITTER_CHAR_LIMIT = 280;
const STORAGE_KEY = 'sendvia_account';

export default function Home() {
  const [userEmail, setUserEmail] = useState('');
  const [tweetText, setTweetText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [balances, setBalances] = useState<{ eth: string; usdc: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [showDevMode, setShowDevMode] = useState(false);
  const [successTweetUrl, setSuccessTweetUrl] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');

  const tweetCharsRemaining = TWITTER_CHAR_LIMIT - tweetText.length;
  const isTweetTooLong = tweetCharsRemaining < 0;
  const hasBalance = balances && parseFloat(balances.usdc) >= 1;

  const addLog = (m: string) => setLogs(prev => [...prev, `[${new Date().toISOString()}] ${m}`]);

  const reinitializeWallet = async (email: string, address: string) => {
    try {
      addLog('Reconnecting to your account...');

      const apiKey = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY;

      if (apiKey) {
        const crossmint = createCrossmint({ apiKey });
        const wallets = CrossmintWallets.from(crossmint);
        const cmWallet = await wallets.createWallet({
          chain: 'base-sepolia' as any,
          signer: { type: 'api-key' as const },
          owner: `email:${email}`
        });

        setWallet(cmWallet);
        addLog(`✅ Wallet reconnected for signing`);
      }

      const balanceData = await fetchWalletBalances(address);
      setBalances(balanceData);
      addLog(`💰 Balance: ${balanceData.usdc} USDC`);
    } catch (e: any) {
      addLog(`⚠️ Reconnection issue: ${e?.message || String(e)}`);
      try {
        const balanceData = await fetchWalletBalances(address);
        setBalances(balanceData);
      } catch {}
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const account = JSON.parse(saved);
        if (account.email && account.walletAddress) {
          setUserEmail(account.email);
          setWalletAddress(account.walletAddress);
          reinitializeWallet(account.email, account.walletAddress);
        }
      }
    } catch (e) {
      console.error('Failed to load saved account:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createAccount = async () => {
    if (!userEmail) {
      setStatusMessage('Please enter your email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      setStatusMessage('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setStatusMessage('Creating your account...');

    try {
      addLog('Creating account...');

      const response = await axios.post('/api/wallet/init', { email: userEmail });
      const { address } = response.data;

      addLog(`✅ Account created: ${address}`);

      const apiKey = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY;

      if (!apiKey) {
        addLog('⚠️ Using wallet without client-side SDK');
        setWalletAddress(address);

        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          email: userEmail,
          walletAddress: address
        }));

        const balanceData = await fetchWalletBalances(address);
        setBalances(balanceData);
        addLog(`Balance: ${balanceData.usdc} USDC`);

        setStatusMessage('Account created, but signing may not work without API key.');
        return;
      }

      const crossmint = createCrossmint({ apiKey });
      const wallets = CrossmintWallets.from(crossmint);
      const cmWallet = await wallets.createWallet({
        chain: 'base-sepolia' as any,
        signer: { type: 'api-key' as const },
        owner: `email:${userEmail}`
      });

      setWallet(cmWallet);
      setWalletAddress(cmWallet.address);

      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        email: userEmail,
        walletAddress: cmWallet.address
      }));

      const balanceData = await fetchWalletBalances(cmWallet.address);
      setBalances(balanceData);
      addLog(`💰 Balance: ${balanceData.usdc} USDC`);

      setStatusMessage('Account ready');
      setTimeout(() => setStatusMessage(''), 3000);

    } catch (e: any) {
      const errMsg = e?.message || String(e);
      setStatusMessage('Failed to create account. Please try again.');
      addLog(`❌ Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshBalances = async () => {
    if (!walletAddress) return;

    try {
      addLog('Refreshing balance...');
      const balanceData = await fetchWalletBalances(walletAddress);
      setBalances(balanceData);
      addLog(`Balance updated: ${balanceData.usdc} USDC`);
    } catch (e: any) {
      addLog(`Failed to fetch balance: ${e?.message || String(e)}`);
    }
  };

  const logout = () => {
    // Clear all state
    setWallet(null);
    setWalletAddress(null);
    setUserEmail('');
    setBalances(null);
    setTweetText('');
    setImageUrl('');
    setSuccessTweetUrl('');
    setTxHash('');
    setStatusMessage('');

    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY);

    addLog('');
    addLog('👋 Logged out successfully');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  };

  const sendTweet = async () => {
    if (!wallet) {
      setStatusMessage('Please create an account first');
      return;
    }

    if (!tweetText.trim()) {
      setStatusMessage('Please enter tweet text');
      return;
    }

    if (tweetText.length > TWITTER_CHAR_LIMIT) {
      setStatusMessage(`Tweet is too long (${tweetText.length}/${TWITTER_CHAR_LIMIT})`);
      return;
    }

    setLoading(true);
    setStatusMessage('Sending your tweet...');
    setSuccessTweetUrl('');
    setTxHash('');

    try {
      addLog('🚀 Starting tweet send process...');
      addLog(`📍 Wallet address: ${wallet.address}`);
      addLog('');

      addLog('🔐 Step 1: Creating x402 signer from Crossmint wallet');
      const evmWallet = EVMWallet.from(wallet);
      const signer = createX402Signer(evmWallet);
      addLog('✓ x402 signer created successfully');
      addLog('');

      addLog('🔌 Step 2: Setting up payment interceptor');
      const axiosInstance = axios.create({ baseURL: '/api' });

      // Add request interceptor for logging
      axiosInstance.interceptors.request.use((config) => {
        if (config.headers?.['X-PAYMENT']) {
          addLog('🔄 Step 5: Retrying request with payment signature');
          addLog(`📝 X-PAYMENT header: ${String(config.headers['X-PAYMENT']).substring(0, 60)}...`);
        }
        return config;
      });

      // Add response interceptor for logging
      axiosInstance.interceptors.response.use(
        (response) => {
          return response;
        },
        async (error) => {
          if (error.response?.status === 402) {
            addLog('');
            addLog('💰 Step 4: Received 402 Payment Required');
            const paymentDetails = error.response.data.paymentDetails;
            if (paymentDetails) {
              addLog(`💵 Amount: ${paymentDetails.amount} (${Number(paymentDetails.amount) / 1000000} USDC)`);
              addLog(`🏦 Merchant: ${paymentDetails.merchant}`);
              addLog(`⛓️  Network: ${paymentDetails.network}`);
              addLog('');
              addLog('✍️  Signing payment authorization with wallet...');
            }
          }
          return Promise.reject(error);
        }
      );

      withPaymentInterceptor(axiosInstance, signer as any);
      addLog('✓ Payment interceptor attached to axios instance');
      addLog('');

      const payload: any = { text: tweetText.trim() };
      if (imageUrl) {
        payload.imageUrl = imageUrl;
        addLog(`📷 Including image: ${imageUrl.substring(0, 50)}...`);
      }

      addLog('📤 Step 3: Sending initial request to /api/tweet');
      addLog('⏳ Expecting 402 Payment Required response...');
      addLog('');

      const response = await axiosInstance.post('/tweet', payload, {
        headers: { 'Accept': 'application/vnd.x402+json' }
      });

      addLog('');
      addLog('✅ Step 6: Payment verified and tweet posted successfully!');
      addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      addLog(`🐦 Tweet ID: ${response.data.tweetId}`);
      addLog(`🔗 Tweet URL: ${response.data.tweetUrl}`);
      addLog('');

      setSuccessTweetUrl(response.data.tweetUrl);
      setStatusMessage('Tweet posted! Agent paid 🤖');

      // Transaction and settlement info
      addLog('💳 Payment Settlement:');
      if (response.data.txHash) {
        setTxHash(response.data.txHash);
        addLog(`⛓️  On-chain TX: ${response.data.txHash}`);
        addLog(`🔍 View on BaseScan: https://sepolia.basescan.org/tx/${response.data.txHash}`);
      } else {
        addLog('⏳ Settlement handled asynchronously by x402 facilitator');
        addLog('📡 Facilitator: https://x402.org/facilitator');
      }
      addLog('');

      setTweetText('');

      addLog('🔄 Refreshing wallet balance...');
      await refreshBalances();
      addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      addLog('🎉 Transaction complete!');

    } catch (error: any) {
      addLog('');
      addLog('❌ ERROR OCCURRED');
      addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (error.response?.status === 402) {
        addLog('💔 Payment verification failed');
        addLog(`Status: ${error.response.status} Payment Required`);
        addLog('Possible causes:');
        addLog('  • Insufficient USDC balance');
        addLog('  • Wallet not properly initialized');
        addLog('  • Signature verification failed');
        setStatusMessage('Payment failed. Check balance.');
      } else if (error.response?.status === 429) {
        addLog('⏱️  Rate limit exceeded');
        addLog(`Status: ${error.response.status} Too Many Requests`);
        addLog('Twitter API rate limit hit. Wait 15 minutes.');
        setStatusMessage('Too many tweets. Wait 15 minutes.');
      } else if (error.response?.status === 403) {
        addLog('🚫 Twitter API permission denied');
        addLog(`Status: ${error.response.status} Forbidden`);
        addLog('Check Twitter app permissions (Read & Write required)');
        setStatusMessage('Twitter connection error.');
      } else if (error.response?.status === 401) {
        addLog('🔐 Authentication failed');
        addLog(`Status: ${error.response.status} Unauthorized`);
        addLog('Twitter API credentials may be invalid');
        setStatusMessage('Authentication error.');
      } else {
        addLog(`🐛 Unexpected error: ${error?.message || String(error)}`);
        if (error.response) {
          addLog(`Status: ${error.response.status}`);
          addLog(`Response: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        }
        setStatusMessage('Something went wrong.');
      }

      addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } finally {
      setLoading(false);
      setTimeout(() => {
        if (!successTweetUrl) setStatusMessage('');
      }, 5000);
    }
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#FAFAFA'
    }}>
      {/* GitHub Ribbon */}
      <a
        href="https://github.com/Crossmint/crossmint-agentic-finance/tree/main/send-tweet"
        target="_blank"
        rel="noopener noreferrer"
        className="github-link"
      >
        GitHub →
      </a>

      {/* Developer Mode Toggle */}
      <button
        onClick={() => setShowDevMode(!showDevMode)}
        style={{
          position: 'fixed',
          top: 20,
          left: showDevMode ? 420 : 20,
          padding: '8px 16px',
          background: showDevMode ? '#1A1A1A' : '#FFFFFF',
          color: showDevMode ? '#FFFFFF' : '#6B6B6B',
          border: '1px solid #E5E5E5',
          borderRadius: 4,
          fontSize: 14,
          fontWeight: 400,
          cursor: 'pointer',
          zIndex: 1000,
          transition: 'left 0.3s ease'
        }}
      >
        {showDevMode ? 'Hide Logs' : 'Dev Logs'}
      </button>

      {/* Dev Drawer */}
      <div className={`dev-drawer ${showDevMode ? 'open' : ''}`}>
        <div className="dev-drawer-content">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <h3 style={{
              fontFamily: "'EB Garamond', serif",
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#FFFFFF',
              margin: 0
            }}>
              Developer Logs
            </h3>
            <button
              onClick={() => setLogs([])}
              style={{
                padding: '4px 12px',
                background: '#2A2A2A',
                color: '#FFFFFF',
                border: '1px solid #4A4A4A',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 400,
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>

          <div style={{
            flex: 1,
            background: '#0A0A0A',
            padding: '12px',
            borderRadius: 4,
            overflow: 'auto',
            border: '1px solid #2A2A2A',
            minHeight: 0
          }}>
            {logs.length === 0 ? (
              <div style={{
                color: '#6B6B6B',
                fontSize: 13,
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '2rem'
              }}>
                No logs yet...
              </div>
            ) : (
              <pre style={{
                whiteSpace: 'pre-wrap',
                margin: 0,
                fontSize: 11,
                lineHeight: 1.6,
                color: '#E5E5E5',
                fontFamily: "'SF Mono', Monaco, Consolas, monospace"
              }}>
                {logs.join('\n')}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content" style={{
        flex: 1,
        padding: '3rem 1.5rem'
      }}>
        <div style={{
          maxWidth: 700,
          margin: '0 auto'
        }}>
          <div>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h1 style={{
              fontFamily: "'EB Garamond', serif",
              fontSize: '3.5rem',
              fontWeight: 600,
              color: '#1A1A1A',
              marginBottom: '0.75rem',
              letterSpacing: '-0.02em'
            }}>
              sendvia
            </h1>
            <p style={{
              fontSize: '1rem',
              color: '#6B6B6B',
              margin: 0,
              lineHeight: 1.6
            }}>
              Tweet with one click. Payment happens automatically.
            </p>
          </div>

          {/* Account Setup - Show prominently if no wallet */}
          {!wallet && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: 4,
              padding: '3rem 2rem',
              border: '1px solid #E5E5E5',
              marginBottom: '1.5rem',
              textAlign: 'center',
              maxWidth: 500,
              margin: '0 auto'
            }}>
              <h2 style={{
                fontFamily: "'EB Garamond', serif",
                fontSize: '2rem',
                fontWeight: 600,
                color: '#1A1A1A',
                marginBottom: '1rem',
                marginTop: 0
              }}>
                Get Started
              </h2>
              <p style={{
                fontSize: 15,
                color: '#6B6B6B',
                marginBottom: '2rem',
                lineHeight: 1.6
              }}>
                Enter your email to create a secure payment account. Each tweet costs $0.001 USDC.
              </p>

              <input
                type="email"
                placeholder="your@email.com"
                value={userEmail}
                onChange={e => setUserEmail(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && createAccount()}
                autoFocus
                style={{
                  padding: '14px 18px',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #E5E5E5',
                  borderRadius: 4,
                  fontSize: 16,
                  marginBottom: '16px',
                  fontFamily: "'Lato', sans-serif",
                  textAlign: 'center'
                }}
              />

              <button
                onClick={createAccount}
                disabled={loading || !userEmail}
                style={{
                  padding: '14px 32px',
                  background: (loading || !userEmail) ? '#FFFFFF' : '#1A1A1A',
                  color: (loading || !userEmail) ? '#6B6B6B' : '#FFFFFF',
                  border: '1px solid #E5E5E5',
                  borderRadius: 4,
                  fontSize: 16,
                  fontWeight: 400,
                  cursor: (loading || !userEmail) ? 'not-allowed' : 'pointer',
                  width: '100%',
                  fontFamily: "'Lato', sans-serif"
                }}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>

              {statusMessage && !wallet && (
                <div style={{
                  marginTop: '16px',
                  fontSize: 14,
                  color: '#6B6B6B',
                  textAlign: 'center'
                }}>
                  {statusMessage}
                </div>
              )}
            </div>
          )}

          {/* Tweet Composer - Only show after account creation */}
          {wallet && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: 4,
              padding: '2rem',
              border: '1px solid #E5E5E5',
              marginBottom: '1.5rem'
            }}>
            <h2 style={{
              fontFamily: "'EB Garamond', serif",
              fontSize: '1.75rem',
              fontWeight: 600,
              color: '#1A1A1A',
              marginBottom: '1.5rem',
              marginTop: 0
            }}>
              What's on your mind?
            </h2>

            <textarea
              id="tweetText"
              placeholder="Share something interesting..."
              value={tweetText}
              onChange={e => setTweetText(e.target.value)}
              rows={4}
              disabled={!wallet}
              style={{
                padding: '16px',
                width: '100%',
                boxSizing: 'border-box',
                border: isTweetTooLong ? '1px solid #C53030' : '1px solid #E5E5E5',
                borderRadius: 4,
                fontSize: 15,
                fontFamily: "'Lato', sans-serif",
                resize: 'vertical',
                marginBottom: '12px',
                lineHeight: 1.6
              }}
            />

            <div style={{
              fontSize: 13,
              color: isTweetTooLong ? '#C53030' : '#6B6B6B',
              marginBottom: '16px',
              textAlign: 'right'
            }}>
              {tweetCharsRemaining} characters
            </div>

            <input
              id="imageUrl"
              placeholder="Image URL (optional)"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              disabled={!wallet}
              style={{
                padding: '12px 16px',
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #E5E5E5',
                borderRadius: 4,
                fontSize: 14,
                marginBottom: '20px',
                fontFamily: "'Lato', sans-serif"
              }}
            />

            <button
              onClick={sendTweet}
              disabled={loading || !wallet || isTweetTooLong || !tweetText.trim()}
              style={{
                padding: '14px 24px',
                background: '#FFFFFF',
                color: (loading || !wallet || isTweetTooLong || !tweetText.trim()) ? '#6B6B6B' : '#1A1A1A',
                border: '1px solid #E5E5E5',
                borderRadius: 4,
                fontSize: 15,
                fontWeight: 400,
                cursor: (loading || !wallet || isTweetTooLong || !tweetText.trim()) ? 'not-allowed' : 'pointer',
                width: '100%',
                fontFamily: "'Lato', sans-serif"
              }}
            >
              {loading ? 'Sending...' : !wallet ? 'Create account below to start' : 'Send Tweet · $0.001'}
            </button>

            {/* Status Message */}
            {statusMessage && (
              <div style={{
                marginTop: '16px',
                fontSize: 14,
                color: successTweetUrl ? '#2D7A3E' : '#6B6B6B',
                textAlign: 'center'
              }}>
                {statusMessage}
              </div>
            )}

            {/* Success State */}
            {successTweetUrl && (
              <div style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #E5E5E5',
                display: 'flex',
                gap: '12px',
                justifyContent: 'center'
              }}>
                <a
                  href={successTweetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '10px 18px',
                    background: '#1A1A1A',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    borderRadius: 4,
                    fontSize: 14,
                    fontWeight: 400,
                    border: 'none'
                  }}
                >
                  View Tweet →
                </a>
                {txHash && (
                  <a
                    href={`https://sepolia.basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '10px 18px',
                      background: '#FFFFFF',
                      color: '#1A1A1A',
                      textDecoration: 'none',
                      borderRadius: 4,
                      fontSize: 14,
                      fontWeight: 400,
                      border: '1px solid #E5E5E5'
                    }}
                  >
                    View Payment →
                  </a>
                )}
              </div>
            )}
          </div>
          )}

          {/* Account Status - Show after account creation */}
          {wallet && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: 4,
              padding: '1.5rem',
              border: '1px solid #E5E5E5'
            }}>
              <div style={{
                marginBottom: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: '4px' }}>
                      Account
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 400, color: '#1A1A1A' }}>
                      {userEmail}
                    </div>
                  </div>
                  <button
                    onClick={logout}
                    style={{
                      padding: '6px 14px',
                      background: '#FFFFFF',
                      border: '1px solid #E5E5E5',
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 400,
                      cursor: 'pointer',
                      color: '#6B6B6B'
                    }}
                  >
                    Logout
                  </button>
                </div>
                <button
                  onClick={refreshBalances}
                  style={{
                    padding: '6px 14px',
                    background: '#FFFFFF',
                    border: '1px solid #E5E5E5',
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 400,
                    cursor: 'pointer',
                    color: '#6B6B6B',
                    width: '100%'
                  }}
                >
                  Refresh Balance
                </button>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                padding: '16px',
                background: '#FAFAFA',
                borderRadius: 4,
                border: '1px solid #E5E5E5'
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: '4px' }}>
                    Balance
                  </div>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 400,
                    color: hasBalance ? '#2D7A3E' : '#C53030'
                  }}>
                    ${balances?.usdc || '0.00'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: '4px' }}>
                    Gas (ETH)
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 400, color: '#1A1A1A' }}>
                    {balances?.eth || '0.00'}
                  </div>
                </div>
              </div>

              {!hasBalance && (
                <div style={{
                  marginTop: '12px',
                  fontSize: 13,
                  color: '#C53030',
                  textAlign: 'center'
                }}>
                  Low balance. Add USDC to send tweets.
                </div>
              )}

              <details style={{ marginTop: '16px' }}>
                <summary style={{
                  fontSize: 13,
                  color: '#6B6B6B',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  Advanced Details
                </summary>
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: '#FAFAFA',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: "'SF Mono', Monaco, Consolas, monospace",
                  color: '#6B6B6B',
                  wordBreak: 'break-all',
                  border: '1px solid #E5E5E5'
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Wallet:</strong> {walletAddress}
                  </div>
                  <div>
                    <strong>Network:</strong> Base Sepolia
                  </div>
                </div>
              </details>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
