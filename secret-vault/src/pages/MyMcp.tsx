import { useState, useCallback } from "react";
import { CrossmintProvider, CrossmintAuthProvider, useAuth } from "@crossmint/client-sdk-react-ui";
import { CrossmintWallets, createCrossmint } from "@crossmint/wallets-sdk";
import "../styles.css";
import "../chat.css";

// Using Vite's import.meta.env (typed as any to avoid TS ambient issues in this file)
const VITE_ENV: any = (import.meta as any).env || {};
const CLIENT_KEY = VITE_ENV.VITE_CROSSMINT_CLIENT_KEY || VITE_ENV.VITE_CROSSMINT_API_KEY || "";

function MyMcpInner() {
  const { login, logout, user, jwt } = useAuth();

  const [wallet, setWallet] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [currentOtp, setCurrentOtp] = useState("");
  const [otpHandlers, setOtpHandlers] = useState<{ sendEmailWithOtp?: () => Promise<void>; verifyOtp?: (otp: string) => Promise<void>; reject?: () => void; }>({});
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [isStoringSecret, setIsStoringSecret] = useState(false);

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-100));

  const initializeWallet = useCallback(async () => {
    if (!CLIENT_KEY.startsWith("ck_")) {
      addLog("❌ VITE_CROSSMINT_CLIENT_KEY must be a client key (ck_)");
      return;
    }
    if (!user?.email) {
      addLog("❌ Please login with Crossmint first");
      return;
    }
    if (!jwt) {
      addLog("🔐 Login required to obtain JWT for Email OTP signer");
      return;
    }
    const ownerEmail = user.email;

    try {
      setIsProcessing(true);
      addLog("🚀 Initializing Crossmint wallet (Email OTP signer)...");

      const crossmint = createCrossmint({
        apiKey: CLIENT_KEY,
        experimental_customAuth: { jwt, email: ownerEmail }
      });
      const wallets = CrossmintWallets.from(crossmint);

      const w = await wallets.getOrCreateWallet({
        chain: "base-sepolia" as any,
        owner: `email:${ownerEmail}`,
        signer: {
          type: "email" as const,
          email: ownerEmail,
          onAuthRequired: async (needsAuth, sendEmailWithOtp, verifyOtp, reject) => {
            addLog(`🔐 Email OTP auth ${needsAuth ? "required" : "not required"}`);
            if (!needsAuth) {
              setOtpRequired(false);
              setOtpSent(false);
              setOtpHandlers({});
              return;
            }
            setOtpRequired(true);
            setOtpSent(false);
            setOtpHandlers({ sendEmailWithOtp, verifyOtp, reject });
          }
        }
      });

      setWallet(w);
      addLog(`✅ Wallet ready: ${w.address}`);
    } catch (e: any) {
      addLog(`❌ Wallet init failed: ${e?.message || String(e)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [CLIENT_KEY, user?.email, jwt]);

  const sendOtp = useCallback(async () => {
    try {
      await otpHandlers.sendEmailWithOtp?.();
      setOtpSent(true);
      addLog("📧 OTP sent. Check your email");
    } catch (e: any) {
      addLog(`❌ Send OTP failed: ${e?.message || String(e)}`);
    }
  }, [otpHandlers.sendEmailWithOtp]);

  const submitOtp = useCallback(async () => {
    try {
      await otpHandlers.verifyOtp?.(currentOtp);
      setOtpRequired(false);
      setOtpSent(false);
      setOtpHandlers({});
      setCurrentOtp("");
      addLog("✅ OTP verified");
    } catch (e: any) {
      addLog(`❌ Verify OTP failed: ${e?.message || String(e)}`);
    }
  }, [otpHandlers.verifyOtp, currentOtp]);

  const WORKER_BASE = (VITE_ENV.VITE_WORKER_BASE_URL as string) || "https://secret-vault.angela-temp.workers.dev";

  const createMcp = useCallback(async () => {
    if (!user?.email || !wallet) return;
    const res = await fetch(`${WORKER_BASE}/api/users/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: `email:${user.email}`, walletAddress: wallet.address })
    });
    if (!res.ok) {
      addLog(`❌ Create MCP failed: ${await res.text()}`);
      return;
    }
    const data = (await res.json()) as { mcpUrl?: string };
    setMcpUrl(data.mcpUrl || null);
    addLog(`✅ MCP ready at ${data.mcpUrl}`);
  }, [user?.email, wallet]);

  const storeSecret = useCallback(async () => {
    if (!user?.email || !wallet || !secretName || !secretValue) {
      addLog("❌ Please enter secret name and value");
      return;
    }

    try {
      setIsStoringSecret(true);
      addLog(`🔐 Storing secret: ${secretName}...`);

      const res = await fetch(`${WORKER_BASE}/api/users/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: `email:${user.email}`,
          walletAddress: wallet.address,
          secretName,
          secretValue
        })
      });

      if (!res.ok) {
        const error = (await res.json()) as { error?: string };
        addLog(`❌ Failed to store secret: ${error?.error || "Unknown error"}`);
        return;
      }

      const data = (await res.json()) as { secretId?: string };
      addLog(`✅ Secret stored successfully! ID: ${data.secretId}`);
      setSecretName("");
      setSecretValue("");
    } catch (error) {
      addLog(`❌ Error storing secret: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsStoringSecret(false);
    }
  }, [user?.email, wallet, secretName, secretValue]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addLog(`📋 Copied ${label} to clipboard`);
  };

  const completedSteps = [
    user,
    wallet,
    mcpUrl
  ].filter(Boolean).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '1.25rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a', fontWeight: 600 }}>
            My MCP Setup
          </h1>
          <span style={{
            background: '#f1f5f9',
            color: '#64748b',
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600
          }}>
            Step {completedSteps} of 3
          </span>
        </div>
        <a
          href="/"
          style={{
            padding: '0.625rem 1.25rem',
            background: 'white',
            color: '#3b82f6',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.875rem',
            transition: 'all 0.2s',
            border: '1px solid #e2e8f0',
            cursor: 'pointer'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
          onMouseOut={(e) => e.currentTarget.style.background = 'white'}
        >
          ← Back to App
        </a>
      </div>

      {/* Main Content - Split Layout */}
      <div style={{ display: 'flex', height: 'calc(100vh - 73px)', overflow: 'hidden' }}>
        {/* Left: Setup Steps */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '3rem 2rem 4rem', maxWidth: '720px', margin: '0 auto' }}>
          {/* Hero Section */}
          <div style={{
            marginBottom: '3rem',
            textAlign: 'center'
          }}>
            <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '2rem', color: '#0f172a', fontWeight: 700, letterSpacing: '-0.025em' }}>
              Create Your Personal MCP Server
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '1.0625rem', lineHeight: '1.6' }}>
              Set up your own Model Context Protocol server with email-authenticated wallet and secure secret storage
            </p>
          </div>

        {/* Error Banner */}
        {!CLIENT_KEY || !CLIENT_KEY.startsWith("ck_") ? (
          <div style={{
            padding: '1.25rem',
            background: '#fffbeb',
            border: '1px solid #fbbf24',
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.5rem', fontSize: '0.9375rem' }}>
              Configuration Required
            </div>
            <div style={{ color: '#78350f', fontSize: '0.875rem', lineHeight: '1.5' }}>
              Set a client API key (ck_) in <code style={{ background: '#fef3c7', padding: '0.125rem 0.375rem', borderRadius: '4px', fontFamily: 'monospace' }}>.dev.vars</code> as <code style={{ background: '#fef3c7', padding: '0.125rem 0.375rem', borderRadius: '4px', fontFamily: 'monospace' }}>VITE_CROSSMINT_CLIENT_KEY=ck_staging_...</code> and restart.
            </div>
          </div>
        ) : null}

        {/* Step 1: Login with Crossmint */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '2rem',
          marginBottom: '1.5rem',
          border: user ? '1px solid #22c55e' : '1px solid #e2e8f0',
          transition: 'border-color 0.3s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              background: user ? '#22c55e' : '#cbd5e1',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '0.875rem',
              flexShrink: 0
            }}>
              {user ? '✓' : '1'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
                Login with Crossmint
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                Authenticate with your email to get started
              </p>
            </div>
          </div>

          {user ? (
            <div style={{
              padding: '1.25rem',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: '0.375rem' }}>
                  Logged in as
                </div>
                <div style={{ fontSize: '0.9375rem', color: '#0f172a', fontWeight: 500 }}>
                  {user.email}
                </div>
              </div>
              <button
                onClick={logout}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'white',
                  color: '#ef4444',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.color = '#ef4444';
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              style={{
                width: '100%',
                padding: '0.875rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.9375rem',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
              onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
            >
              Login with Crossmint
            </button>
          )}
        </div>

        {/* Step 2: Initialize Wallet */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '2rem',
          marginBottom: '1.5rem',
          border: wallet ? '1px solid #22c55e' : '1px solid #e2e8f0',
          opacity: !user ? 0.5 : 1,
          transition: 'opacity 0.3s, border-color 0.3s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              background: wallet ? '#22c55e' : '#cbd5e1',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '0.875rem',
              flexShrink: 0
            }}>
              {wallet ? '✓' : '2'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
                Initialize Wallet
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                Create your email-authenticated smart wallet
              </p>
            </div>
          </div>

          <button
            onClick={initializeWallet}
            disabled={isProcessing || !!wallet || !user}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '0.875rem',
              background: wallet ? '#22c55e' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: isProcessing || !!wallet || !user ? 'not-allowed' : 'pointer',
              fontSize: '0.9375rem',
              opacity: isProcessing || !!wallet || !user ? 0.6 : 1,
              transition: 'background 0.2s, opacity 0.2s'
            }}
          >
            {wallet ? '✓ Wallet Ready' : isProcessing ? 'Initializing Wallet...' : 'Initialize Wallet'}
          </button>

          {otpRequired && (
            <div style={{
              marginTop: '1rem',
              padding: '1.25rem',
              background: '#fffbeb',
              border: '1px solid #fbbf24',
              borderRadius: '8px'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#92400e', fontSize: '0.9375rem' }}>
                Email OTP Verification Required
              </div>
              {!otpSent ? (
                <button
                  onClick={sendOtp}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Send OTP to Email
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    value={currentOtp}
                    onChange={(e) => setCurrentOtp(e.target.value)}
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '2px solid #fbbf24',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      textAlign: 'center',
                      letterSpacing: '0.5rem'
                    }}
                  />
                  <button
                    onClick={submitOtp}
                    disabled={currentOtp.length !== 6}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: currentOtp.length === 6 ? '#22c55e' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      cursor: currentOtp.length === 6 ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Verify
                  </button>
                </div>
              )}
            </div>
          )}

          {wallet && (
            <div style={{
              marginTop: '1rem',
              padding: '1.25rem',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: '0.375rem' }}>
                  Wallet Address
                </div>
                <div style={{ fontSize: '0.875rem', color: '#0f172a', fontFamily: 'monospace' }}>
                  {wallet.address}
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(wallet.address, 'wallet address')}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'white',
                  color: '#3b82f6',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#3b82f6';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.color = '#3b82f6';
                }}
              >
                Copy
              </button>
            </div>
          )}
        </div>

        {/* Step 3: Create MCP */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '2rem',
          marginBottom: '1.5rem',
          border: mcpUrl ? '1px solid #22c55e' : '1px solid #e2e8f0',
          opacity: !wallet ? 0.5 : 1,
          transition: 'opacity 0.3s, border-color 0.3s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              background: mcpUrl ? '#22c55e' : '#cbd5e1',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '0.875rem',
              flexShrink: 0
            }}>
              {mcpUrl ? '✓' : '3'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
                Create MCP Server
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                Generate your personal MCP endpoint
              </p>
            </div>
          </div>

          <button
            onClick={createMcp}
            disabled={!wallet || !!mcpUrl}
            style={{
              width: '100%',
              padding: '0.875rem',
              background: mcpUrl ? '#22c55e' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: !wallet || !!mcpUrl ? 'not-allowed' : 'pointer',
              fontSize: '0.9375rem',
              opacity: !wallet || !!mcpUrl ? 0.6 : 1
            }}
          >
            {mcpUrl ? '✓ MCP Created' : 'Create My MCP'}
          </button>

          {mcpUrl && (
            <div style={{
              marginTop: '1rem',
              padding: '1.25rem',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                  Your MCP URL
                </div>
                <button
                  onClick={() => copyToClipboard(mcpUrl, 'MCP URL')}
                  style={{
                    padding: '0.375rem 0.875rem',
                    background: 'white',
                    color: '#3b82f6',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#3b82f6';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.color = '#3b82f6';
                  }}
                >
                  Copy
                </button>
              </div>
              <code style={{
                display: 'block',
                padding: '0.875rem',
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                color: '#0f172a',
                wordBreak: 'break-all',
                lineHeight: '1.5'
              }}>
                {mcpUrl}
              </code>
            </div>
          )}
        </div>

        {/* Secret Storage (Optional) */}
        {mcpUrl && (
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '2rem',
            marginBottom: '1.5rem',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
                Store a Secret (Optional)
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: '1.5' }}>
                Store secrets in your MCP. Only you (the MCP owner) can add secrets via this authenticated interface.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label>
                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
                  Secret Name
                </span>
                <input
                  type="text"
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                  placeholder="e.g., OPENAI_API_KEY"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '0.875rem'
                  }}
                />
              </label>

              <label>
                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
                  Secret Value
                </span>
                <input
                  type="password"
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="sk-..."
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontFamily: 'monospace'
                  }}
                />
              </label>

              <button
                onClick={storeSecret}
                disabled={isStoringSecret || !secretName || !secretValue}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  background: isStoringSecret || !secretName || !secretValue ? '#cbd5e1' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: isStoringSecret || !secretName || !secretValue ? 'not-allowed' : 'pointer',
                  fontSize: '0.9375rem',
                  transition: 'background 0.2s'
                }}
              >
                {isStoringSecret ? 'Storing Secret...' : 'Store Secret'}
              </button>
            </div>
          </div>
        )}

          {/* Footer */}
          <div style={{
            textAlign: 'center',
            padding: '2rem 0 1rem',
            color: '#94a3b8',
            fontSize: '0.8125rem'
          }}>
            <p style={{ margin: 0 }}>
              Powered by Crossmint · x402 · MCP
            </p>
          </div>
        </div>

        {/* Right: Console Logs Sidebar */}
        <div style={{
          width: '450px',
          borderLeft: '1px solid #e2e8f0',
          background: 'white',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0
        }}>
          <div style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc'
          }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
              Console Logs
            </h3>
            <button
              onClick={() => setLogs([])}
              style={{
                padding: '0.375rem 0.875rem',
                background: 'white',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              Clear
            </button>
          </div>

          {logs.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              fontSize: '0.875rem',
              padding: '2rem',
              textAlign: 'center',
              lineHeight: '1.6'
            }}>
              Console logs will appear here as you complete the setup steps
            </div>
          ) : (
            <div style={{
              flex: 1,
              overflowY: 'auto',
              background: '#0f172a',
              fontFamily: 'SF Mono, Consolas, Monaco, monospace'
            }}>
              {logs.map((l, i) => {
                const isError = l.includes('❌');
                const isSuccess = l.includes('✅');
                const isInfo = l.includes('📧') || l.includes('🔐') || l.includes('🚀') || l.includes('📋');

                return (
                  <div
                    key={i}
                    style={{
                      padding: '0.625rem 1rem',
                      fontSize: '0.8125rem',
                      color: isError ? '#fca5a5' : isSuccess ? '#86efac' : isInfo ? '#93c5fd' : '#cbd5e1',
                      borderBottom: i < logs.length - 1 ? '1px solid #1e293b' : 'none',
                      fontFamily: 'inherit',
                      lineHeight: '1.5'
                    }}
                  >
                    {l}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyMcp() {
  return (
    <CrossmintProvider apiKey={CLIENT_KEY}>
      <CrossmintAuthProvider loginMethods={["email"]}>
        <MyMcpInner />
      </CrossmintAuthProvider>
    </CrossmintProvider>
  );
}


