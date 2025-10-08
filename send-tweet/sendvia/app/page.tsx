'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { withPaymentInterceptor } from 'x402-axios';
import { CrossmintWallets, createCrossmint, EVMWallet } from "@crossmint/wallets-sdk";
import { createX402Signer } from './x402Adapter';
import { checkWalletDeployment, deployWallet } from './walletUtils';
import './globals.css';

const TWITTER_CHAR_LIMIT = 280;
const STORAGE_KEY = 'sendvia_config';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [serverUrl, setServerUrl] = useState('http://localhost:10001');
  const [tweetText, setTweetText] = useState('just a smol town gurlll, livin in a loooonelyyy world');
  const [imageUrl, setImageUrl] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [deploymentTx, setDeploymentTx] = useState<string>('');

  const tweetCharsRemaining = TWITTER_CHAR_LIMIT - tweetText.length;
  const isTweetTooLong = tweetCharsRemaining < 0;

  const addLog = (m: string) => setLogs(prev => [...prev, `[${new Date().toISOString()}] ${m}`]);

  // Load saved config from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        if (config.apiKey) setApiKey(config.apiKey);
        if (config.userEmail) setUserEmail(config.userEmail);
        if (config.serverUrl) setServerUrl(config.serverUrl);
      }
    } catch (e) {
      console.error('Failed to load saved config:', e);
    }
  }, []);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    try {
      const config = { apiKey, userEmail, serverUrl };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }, [apiKey, userEmail, serverUrl]);

  // Input validation helpers
  const isValidEmail = (email: string): boolean => {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidUrl = (url: string): boolean => {
    if (!url) return true; // Optional field
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const isValidServerUrl = (url: string): boolean => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const initializeWallet = async () => {
    if (!apiKey || !userEmail) {
      addLog('Please enter Crossmint API key and user email');
      return;
    }
    if (!isValidEmail(userEmail)) {
      addLog('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      addLog('Initializing Crossmint wallet...');
      const crossmint = createCrossmint({ apiKey });
      const wallets = CrossmintWallets.from(crossmint);
      const cmWallet = await wallets.createWallet({
        chain: 'base-sepolia' as any,
        signer: { type: 'api-key' as const },
        owner: `email:${userEmail}`
      });

      setWallet(cmWallet);
      setWalletAddress(cmWallet.address);
      addLog(`✅ Wallet initialized: ${cmWallet.address}`);

      // Check deployment status
      addLog('🔍 Checking wallet deployment status...');
      const deployed = await checkWalletDeployment(cmWallet.address);
      setIsDeployed(deployed);
      addLog(`🏗️ Wallet status: ${deployed ? 'deployed' : 'pre-deployed'}`);
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      addLog(`❌ Wallet initialization failed: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const deployWalletOnChain = async () => {
    if (!wallet) {
      addLog('❌ Please initialize wallet first');
      return;
    }

    if (isDeployed) {
      addLog('ℹ️ Wallet is already deployed');
      return;
    }

    setLoading(true);
    try {
      addLog('🚀 Deploying wallet on-chain...');
      const txHash = await deployWallet(wallet);
      setDeploymentTx(txHash);
      setIsDeployed(true);
      addLog(`✅ Wallet deployed successfully!`);
      addLog(`📝 Transaction: ${txHash}`);
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      addLog(`❌ Deployment failed: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const sendTweet = async () => {
    if (!wallet) {
      addLog('❌ Please initialize wallet first');
      return;
    }

    if (!isValidServerUrl(serverUrl)) {
      addLog('Please enter a valid server URL (http:// or https://)');
      return;
    }

    if (!tweetText.trim()) {
      addLog('Please enter tweet text');
      return;
    }

    if (tweetText.length > TWITTER_CHAR_LIMIT) {
      addLog(`Tweet text exceeds ${TWITTER_CHAR_LIMIT} character limit (current: ${tweetText.length})`);
      return;
    }

    if (imageUrl && !isValidUrl(imageUrl)) {
      addLog('Please enter a valid image URL');
      return;
    }

    setLoading(true);
    try {
      addLog('🚀 Sending tweet with x402 payment...');
      addLog(`📍 Using wallet: ${wallet.address}`);
      addLog(`📍 Wallet deployed: ${isDeployed}`);

      // Create x402-enabled axios instance with Crossmint signer
      const evmWallet = EVMWallet.from(wallet);
      const signer = createX402Signer(evmWallet);

      const axiosInstance = axios.create({ baseURL: serverUrl });
      withPaymentInterceptor(axiosInstance, signer as any);

      // Make the tweet request - x402 interceptor will handle payment if required
      const payload: any = { text: tweetText.trim() };
      if (imageUrl) {
        payload.imageUrl = imageUrl;
      }

      addLog('📤 Posting tweet...');
      const response = await axiosInstance.post('/tweet', payload, {
        headers: { 'Accept': 'application/vnd.x402+json' }
      });

      addLog('✅ Tweet sent successfully!');
      addLog(`🐦 Tweet ID: ${response.data.tweetId}`);
      addLog(`🔗 URL: ${response.data.tweetUrl}`);
      addLog('🎉 Payment and tweet complete!');

    } catch (error: any) {
      const errMsg = error?.message || String(error);

      if (error.response?.status === 402) {
        addLog('⚠️ Payment verification failed');
        addLog(`Details: ${JSON.stringify(error.response.data)}`);
      } else if (error.response?.status === 500) {
        addLog(`❌ Server error: ${error.response.data?.error || 'Internal Server Error'}`);
      } else if (error.response?.status === 403) {
        addLog(`❌ Twitter API error (403): Check app permissions and tokens`);
      } else {
        addLog(`❌ Failed to send tweet: ${errMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #f8fafc, #e2e8f0)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            sendvia
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#64748b', margin: 0 }}>
            Post tweets with x402 payment protocol
          </p>
        </div>

        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: '1.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '1.25rem', marginTop: 0 }}>
            ⚙️ Configuration
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label htmlFor="apiKey" style={{
                display: 'block',
                fontSize: 14,
                marginBottom: 6,
                fontWeight: 500,
                color: '#475569'
              }}>
                Crossmint API Key
              </label>
              <input
                id="apiKey"
                type="password"
                placeholder="sk_staging_..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{
                  padding: '10px 12px',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: 'monospace',
                  transition: 'border-color 0.2s'
                }}
                aria-required="true"
              />
            </div>
            <div>
              <label htmlFor="userEmail" style={{
                display: 'block',
                fontSize: 14,
                marginBottom: 6,
                fontWeight: 500,
                color: '#475569'
              }}>
                User Email
              </label>
              <input
                id="userEmail"
                placeholder="user@example.com"
                type="email"
                value={userEmail}
                onChange={e => setUserEmail(e.target.value)}
                style={{
                  padding: '10px 12px',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 14,
                  transition: 'border-color 0.2s'
                }}
                aria-required="true"
              />
            </div>
            <div style={{ gridColumn: '1 / span 2' }}>
              <label htmlFor="serverUrl" style={{
                display: 'block',
                fontSize: 14,
                marginBottom: 6,
                fontWeight: 500,
                color: '#475569'
              }}>
                Server URL
              </label>
              <input
                id="serverUrl"
                placeholder="http://localhost:10001"
                value={serverUrl}
                onChange={e => setServerUrl(e.target.value)}
                style={{
                  padding: '10px 12px',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 14,
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
            <button
              onClick={initializeWallet}
              disabled={loading || !apiKey || !userEmail || !!wallet}
              style={{
                padding: '12px 24px',
                background: (loading || !apiKey || !userEmail || !!wallet)
                  ? '#cbd5e1'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: (loading || !apiKey || !userEmail || !!wallet) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: (loading || !apiKey || !userEmail || !!wallet)
                  ? 'none'
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                width: '100%'
              }}
              aria-busy={loading}
            >
              {wallet ? '✅ Wallet Ready' : loading ? '⏳ Initializing...' : '🚀 Initialize Wallet'}
            </button>

            {walletAddress && (
              <div style={{
                marginTop: 16,
                padding: 16,
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 8 }}>
                  Wallet Address
                </div>
                <div style={{
                  fontSize: 13,
                  fontFamily: 'monospace',
                  color: '#1e293b',
                  wordBreak: 'break-all',
                  marginBottom: 12
                }}>
                  {walletAddress}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: isDeployed ? '#d4edda' : '#fff3cd',
                    color: isDeployed ? '#155724' : '#856404',
                    fontWeight: 600,
                    fontSize: 13,
                    border: `1px solid ${isDeployed ? '#c3e6cb' : '#ffeaa7'}`
                  }}>
                    {isDeployed ? '🟢 Deployed' : '🟡 Pre-deployed'}
                  </span>

                  {!isDeployed && (
                    <button
                      onClick={deployWalletOnChain}
                      disabled={loading}
                      style={{
                        padding: '6px 14px',
                        fontSize: 13,
                        background: loading ? '#cbd5e1' : '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontWeight: 500,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s'
                      }}
                      aria-busy={loading}
                    >
                      {loading ? '⏳ Deploying...' : '🚀 Deploy'}
                    </button>
                  )}
                </div>

                {deploymentTx && (
                  <div style={{
                    marginTop: 10,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: '#64748b',
                    padding: 8,
                    background: 'white',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0'
                  }}>
                    <span style={{ fontWeight: 500 }}>Tx:</span> {deploymentTx.substring(0, 20)}...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {!wallet && (
          <>
            <div style={{
              background: 'linear-gradient(135deg, #e0e7ff 0%, #fce7f3 100%)',
              borderRadius: 12,
              padding: '1.25rem',
              marginBottom: '1.5rem',
              border: '1px solid #c7d2fe'
            }}>
              <div style={{ fontSize: 14, color: '#4c1d95', lineHeight: 1.6 }}>
                <strong>💡 Getting Started:</strong> Enter your Crossmint API key and email above, then click "Initialize Wallet" to create a smart wallet. Once initialized, you can compose and send tweets with automatic x402 payment handling.
              </div>
            </div>
          </>
        )}

        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: '1.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '1.25rem', marginTop: 0 }}>
            🐦 Compose Tweet
          </h2>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label htmlFor="tweetText" style={{
                display: 'block',
                fontSize: 14,
                marginBottom: 6,
                fontWeight: 500,
                color: '#475569'
              }}>
                Tweet Text
              </label>
              <textarea
                id="tweetText"
                placeholder="What's happening?"
                value={tweetText}
                onChange={e => setTweetText(e.target.value)}
                rows={4}
                style={{
                  padding: '12px',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: isTweetTooLong ? '2px solid #dc2626' : '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 15,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  transition: 'border-color 0.2s'
                }}
                aria-required="true"
                aria-invalid={isTweetTooLong}
                aria-describedby="tweetCharCount"
              />
              <div
                id="tweetCharCount"
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  textAlign: 'right',
                  fontWeight: 500,
                  color: isTweetTooLong ? '#dc2626' : tweetCharsRemaining < 20 ? '#f59e0b' : '#64748b'
                }}
                aria-live="polite"
              >
                {tweetCharsRemaining} characters remaining
              </div>
            </div>

            <div>
              <label htmlFor="imageUrl" style={{
                display: 'block',
                fontSize: 14,
                marginBottom: 6,
                fontWeight: 500,
                color: '#475569'
              }}>
                Image URL (optional)
              </label>
              <input
                id="imageUrl"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                style={{
                  padding: '10px 12px',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 14,
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
            <button
              onClick={sendTweet}
              disabled={loading || !wallet || isTweetTooLong}
              style={{
                padding: '14px 28px',
                background: (loading || !wallet || isTweetTooLong)
                  ? '#cbd5e1'
                  : 'linear-gradient(135deg, #1DA1F2 0%, #0d8bd9 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: (loading || !wallet || isTweetTooLong) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: (loading || !wallet || isTweetTooLong)
                  ? 'none'
                  : '0 4px 6px -1px rgba(29, 161, 242, 0.3)',
                width: '100%'
              }}
              aria-busy={loading}
            >
              {loading ? '⏳ Sending...' : '🐦 Send Tweet with x402 Payment'}
            </button>
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: '1.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
              📋 Activity Logs
            </h2>
            <button
              onClick={() => setLogs([])}
              disabled={logs.length === 0}
              style={{
                padding: '6px 12px',
                background: logs.length === 0 ? '#e2e8f0' : '#64748b',
                color: logs.length === 0 ? '#94a3b8' : 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Clear
            </button>
          </div>

          {logs.length === 0 ? (
            <div style={{
              background: '#f8fafc',
              padding: '3rem 2rem',
              borderRadius: 8,
              textAlign: 'center',
              border: '2px dashed #cbd5e1'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📝</div>
              <div style={{ color: '#94a3b8', fontSize: 14, fontStyle: 'italic' }}>
                No activity yet. Initialize wallet and send a tweet to see logs.
              </div>
            </div>
          ) : (
            <div style={{
              background: '#0f172a',
              padding: 12,
              borderRadius: 8,
              maxHeight: 350,
              overflow: 'auto',
              border: '1px solid #1e293b'
            }}>
              <pre style={{
                whiteSpace: 'pre-wrap',
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                color: '#e2e8f0',
                fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace'
              }}>
                {logs.join('\n')}
              </pre>
            </div>
          )}
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: '3rem',
          paddingTop: '2rem',
          borderTop: '1px solid #cbd5e1',
          color: '#64748b',
          fontSize: 14
        }}>
          <div style={{ marginBottom: '0.5rem' }}>
            Built with <a href="https://www.crossmint.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'none', fontWeight: 500 }}>Crossmint</a> and <a href="https://x402.org" target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'none', fontWeight: 500 }}>x402</a>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            Demonstrating smart wallet payments for API access
          </div>
        </div>
      </div>
    </div>
  );
}
