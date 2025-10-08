import React, { useState, useCallback, useEffect } from "react";
import { CrossmintProvider, CrossmintAuthProvider, useAuth } from "@crossmint/client-sdk-react-ui";
import { CrossmintWallets, createCrossmint } from "@crossmint/wallets-sdk";
import { CreateEventModal } from "../components/CreateEventModal";
import "../styles.css";
import "../chat.css";

// Using Vite's import.meta.env (typed as any to avoid TS ambient issues in this file)
const VITE_ENV: any = (import.meta as any).env || {};
const CLIENT_KEY = VITE_ENV.VITE_CROSSMINT_CLIENT_KEY || VITE_ENV.VITE_CROSSMINT_API_KEY || "";

function MyMcpInner() {
  const { login, logout, user, jwt } = useAuth();

  // Wallet & MCP state
  const [wallet, setWallet] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [currentOtp, setCurrentOtp] = useState("");
  const [otpHandlers, setOtpHandlers] = useState<{ sendEmailWithOtp?: () => Promise<void>; verifyOtp?: (otp: string) => Promise<void>; reject?: () => void; }>({});
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<'setup' | 'dashboard'>('setup');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [logsCollapsed, setLogsCollapsed] = useState(false);

  // Events state
  const [events, setEvents] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState("0.00");
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  // Logs
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-100));

  const WORKER_BASE = (VITE_ENV.VITE_WORKER_BASE_URL as string) || "https://events-concierge.angela-temp.workers.dev";

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

  const createEvent = useCallback(async (eventData: {
    title: string;
    description: string;
    date: string;
    capacity: string;
    price: string;
  }) => {
    if (!user?.email || !wallet) {
      addLog("❌ Please login and initialize wallet first");
      return;
    }

    try {
      setIsCreatingEvent(true);
      addLog(`🎉 Creating event: ${eventData.title}...`);

      const dateTimestamp = new Date(eventData.date).getTime();

      const res = await fetch(`${WORKER_BASE}/api/users/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: `email:${user.email}`,
          walletAddress: wallet.address,
          title: eventData.title,
          description: eventData.description,
          date: dateTimestamp,
          capacity: parseInt(eventData.capacity) || 0,
          price: eventData.price
        })
      });

      if (!res.ok) {
        const error = (await res.json()) as { error?: string };
        addLog(`❌ Failed to create event: ${error?.error || "Unknown error"}`);
        return;
      }

      const data = (await res.json()) as { eventId?: string };
      addLog(`✅ Event created successfully! ID: ${data.eventId}`);

      // Close modal and refresh events
      setShowCreateModal(false);
      await fetchEvents();
    } catch (error) {
      addLog(`❌ Error creating event: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreatingEvent(false);
    }
  }, [user?.email, wallet]);

  const fetchEvents = useCallback(async () => {
    if (!user?.email || !wallet) return;

    try {
      setLoadingEvents(true);
      const res = await fetch(
        `${WORKER_BASE}/api/users/events?userId=email:${encodeURIComponent(user.email)}&walletAddress=${wallet.address}`,
        { method: "GET", headers: { "Content-Type": "application/json" } }
      );

      if (!res.ok) {
        addLog(`❌ Failed to fetch events`);
        return;
      }

      const data = (await res.json()) as { events?: any[]; totalRevenue?: string };
      setEvents(data.events || []);
      setTotalRevenue(data.totalRevenue || "0.00");
      addLog(`✅ Loaded ${data.events?.length || 0} events`);
    } catch (error) {
      addLog(`❌ Error fetching events: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingEvents(false);
    }
  }, [user?.email, wallet]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addLog(`📋 Copied ${label} to clipboard`);
  };

  // Auto-initialize wallet when user logs in
  useEffect(() => {
    if (user?.email && jwt && !wallet && !isProcessing) {
      addLog("🔄 User logged in, auto-initializing wallet...");
      initializeWallet();
    }
  }, [user?.email, jwt, wallet, isProcessing, initializeWallet]);

  // Auto-fetch MCP URL when wallet is ready
  useEffect(() => {
    if (wallet && user?.email && !mcpUrl) {
      addLog("🔄 Wallet ready, checking for existing MCP...");
      createMcp();
    }
  }, [wallet, user?.email, mcpUrl, createMcp]);

  // Fetch events when MCP is loaded
  useEffect(() => {
    if (mcpUrl && wallet && user?.email) {
      fetchEvents();
    }
  }, [mcpUrl, wallet, user?.email, fetchEvents]);

  // Auto-switch to dashboard when setup is complete
  useEffect(() => {
    if (user && wallet && mcpUrl) {
      setActiveTab('dashboard');
    }
  }, [user, wallet, mcpUrl]);

  const totalRsvps = events.reduce((sum, e) => sum + (e.rsvpCount || 0), 0);
  const setupComplete = !!(user && wallet && mcpUrl);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* Header with Tabs */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{
          padding: '1.25rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a', fontWeight: 600 }}>
              Event Host Dashboard
            </h1>
            {user && (
              <span style={{
                background: '#dcfce7',
                color: '#166534',
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {user.email}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
                border: '1px solid #e2e8f0',
                transition: 'all 0.2s'
              }}
            >
              ← Back to App
            </a>
            {user && (
              <button
                onClick={logout}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'white',
                  color: '#ef4444',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Logout
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0 2rem',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <button
            onClick={() => setActiveTab('setup')}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'setup' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'setup' ? '#3b82f6' : '#64748b',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Setup {!setupComplete && '(In Progress)'}
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            disabled={!setupComplete}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'dashboard' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'dashboard' ? '#3b82f6' : '#64748b',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: setupComplete ? 'pointer' : 'not-allowed',
              opacity: setupComplete ? 1 : 0.5,
              transition: 'all 0.2s'
            }}
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {!CLIENT_KEY || !CLIENT_KEY.startsWith("ck_") ? (
        <div style={{
          padding: '1.25rem 2rem',
          background: '#fffbeb',
          border: '1px solid #fbbf24',
          margin: '1rem 2rem',
          borderRadius: '8px'
        }}>
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.5rem', fontSize: '0.9375rem' }}>
            Configuration Required
          </div>
          <div style={{ color: '#78350f', fontSize: '0.875rem', lineHeight: '1.5' }}>
            Set a client API key (ck_) in <code style={{ background: '#fef3c7', padding: '0.125rem 0.375rem', borderRadius: '4px', fontFamily: 'monospace' }}>.dev.vars</code> as <code style={{ background: '#fef3c7', padding: '0.125rem 0.375rem', borderRadius: '4px', fontFamily: 'monospace' }}>VITE_CROSSMINT_CLIENT_KEY=ck_staging_...</code> and restart.
          </div>
        </div>
      ) : null}

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>
        {/* Main Content Area (both tabs) */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          marginRight: logsCollapsed ? 0 : '400px'
        }}>
          {/* Setup Tab */}
          {activeTab === 'setup' && (
            <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
              <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f172a' }}>
                  Get Started
                </h2>
                <p style={{ color: '#64748b', marginBottom: '2rem' }}>
                  Complete these steps to create your event RSVP platform
                </p>

                {/* Compact Setup Steps */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Step 1: Login */}
                  <div style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    border: user ? '2px solid #22c55e' : '2px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: user ? '0' : '1rem' }}>
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
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
                          Login with Crossmint
                        </h3>
                        {user && (
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                            Logged in as {user.email}
                          </p>
                        )}
                      </div>
                      {!user ? (
                        <button
                          onClick={login}
                          style={{
                            padding: '0.625rem 1.25rem',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer'
                          }}
                        >
                          Login
                        </button>
                      ) : (
                        <button
                          onClick={logout}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'white',
                            color: '#64748b',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          Logout
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Wallet */}
                  <div style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    border: wallet ? '2px solid #22c55e' : '2px solid #e2e8f0',
                    opacity: !user ? 0.5 : 1
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '50%',
                        background: wallet ? '#22c55e' : isProcessing ? '#3b82f6' : '#cbd5e1',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        flexShrink: 0
                      }}>
                        {wallet ? '✓' : isProcessing ? '...' : '2'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
                          {wallet ? 'Wallet Ready' : isProcessing ? 'Initializing Wallet...' : 'Initialize Wallet'}
                        </h3>
                        {wallet && (
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                            {wallet.address}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* OTP Flow */}
                    {otpRequired && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        background: '#fffbeb',
                        border: '1px solid #fbbf24',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#92400e', fontSize: '0.875rem' }}>
                          Email OTP Required
                        </div>
                        {!otpSent ? (
                          <button
                            onClick={sendOtp}
                            style={{
                              width: '100%',
                              padding: '0.625rem',
                              background: '#f59e0b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.875rem',
                              cursor: 'pointer'
                            }}
                          >
                            Send OTP
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              value={currentOtp}
                              onChange={(e) => setCurrentOtp(e.target.value)}
                              maxLength={6}
                              placeholder="Enter OTP"
                              style={{
                                flex: 1,
                                padding: '0.625rem',
                                border: '2px solid #fbbf24',
                                borderRadius: '6px',
                                fontSize: '0.875rem',
                                textAlign: 'center'
                              }}
                            />
                            <button
                              onClick={submitOtp}
                              disabled={currentOtp.length !== 6}
                              style={{
                                padding: '0.625rem 1rem',
                                background: currentOtp.length === 6 ? '#22c55e' : '#9ca3af',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                cursor: currentOtp.length === 6 ? 'pointer' : 'not-allowed'
                              }}
                            >
                              Verify
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Step 3: MCP */}
                  <div style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    border: mcpUrl ? '2px solid #22c55e' : '2px solid #e2e8f0',
                    opacity: !wallet ? 0.5 : 1
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '50%',
                        background: mcpUrl ? '#22c55e' : wallet && !mcpUrl ? '#3b82f6' : '#cbd5e1',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        flexShrink: 0
                      }}>
                        {mcpUrl ? '✓' : wallet && !mcpUrl ? '...' : '3'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
                          {mcpUrl ? 'MCP Endpoint Created' : wallet && !mcpUrl ? 'Creating MCP...' : 'Create MCP Endpoint'}
                        </h3>
                        {mcpUrl && (
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {mcpUrl}
                          </p>
                        )}
                      </div>
                      {mcpUrl && (
                        <button
                          onClick={() => copyToClipboard(mcpUrl, 'MCP URL')}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'white',
                            color: '#3b82f6',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Success State */}
                  {setupComplete && (
                    <div style={{
                      padding: '1.5rem',
                      background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>
                        Setup Complete!
                      </div>
                      <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#15803d' }}>
                        Your event platform is ready to go
                      </p>
                      <button
                        onClick={() => setActiveTab('dashboard')}
                        style={{
                          padding: '0.75rem 1.5rem',
                          background: '#22c55e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        Go to Dashboard →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Stats Header (Sticky) */}
              <div style={{
                background: 'white',
                borderBottom: '1px solid #e2e8f0',
                padding: '1.5rem 2rem',
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <div style={{
                  flex: 1,
                  minWidth: '200px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  padding: '1.5rem',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>Total Earnings</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>${totalRevenue}</div>
                </div>

                <div style={{
                  flex: 1,
                  minWidth: '150px',
                  background: 'white',
                  border: '2px solid #e2e8f0',
                  padding: '1.5rem',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Events Created</div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a' }}>{events.length}</div>
                </div>

                <div style={{
                  flex: 1,
                  minWidth: '150px',
                  background: 'white',
                  border: '2px solid #e2e8f0',
                  padding: '1.5rem',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Total RSVPs</div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a' }}>{totalRsvps}</div>
                </div>
              </div>

              {/* Events Grid Section */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '2rem',
                background: '#f8fafc'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem'
                }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#0f172a' }}>
                    Your Events
                  </h2>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
                  >
                    <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>+</span>
                    Create Event
                  </button>
                </div>

                {loadingEvents ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto 1rem' }}></div>
                    Loading events...
                  </div>
                ) : events.length === 0 ? (
                  <div style={{
                    background: 'white',
                    border: '2px dashed #cbd5e1',
                    borderRadius: '12px',
                    padding: '3rem',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📅</div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600, color: '#0f172a' }}>
                      No Events Yet
                    </h3>
                    <p style={{ margin: '0 0 1.5rem 0', color: '#64748b', fontSize: '0.875rem' }}>
                      Create your first event to start earning from RSVPs
                    </p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer'
                      }}
                    >
                      Create Your First Event
                    </button>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '1rem'
                  }}>
                    {events.map((event) => (
                      <div
                        key={event.id}
                        style={{
                          background: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '1.5rem',
                          transition: 'all 0.2s',
                          cursor: 'pointer'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'start',
                          marginBottom: '1rem'
                        }}>
                          <div style={{ flex: 1, paddingRight: '1rem' }}>
                            <h4 style={{
                              margin: '0 0 0.5rem 0',
                              fontSize: '1.125rem',
                              fontWeight: 600,
                              color: '#0f172a',
                              lineHeight: '1.3'
                            }}>
                              {event.title}
                            </h4>
                            <div style={{
                              fontSize: '0.8125rem',
                              color: '#64748b',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.25rem'
                            }}>
                              <div>📅 {new Date(event.date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</div>
                              <div>👥 {event.capacity === 0 ? 'Unlimited capacity' : `${event.capacity} spots`}</div>
                            </div>
                          </div>
                          <div style={{
                            textAlign: 'right',
                            background: '#f0fdf4',
                            padding: '0.75rem',
                            borderRadius: '8px'
                          }}>
                            <div style={{ fontSize: '0.75rem', color: '#15803d', marginBottom: '0.25rem' }}>
                              Revenue
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>
                              ${event.revenue}
                            </div>
                          </div>
                        </div>

                        <p style={{
                          margin: '0 0 1rem 0',
                          fontSize: '0.875rem',
                          color: '#64748b',
                          lineHeight: '1.5'
                        }}>
                          {event.description}
                        </p>

                        <div style={{
                          display: 'flex',
                          gap: '1rem',
                          paddingTop: '1rem',
                          borderTop: '1px solid #f1f5f9',
                          fontSize: '0.8125rem',
                          color: '#64748b'
                        }}>
                          <div style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{event.rsvpCount}</span>
                            <span>RSVP{event.rsvpCount !== 1 ? 's' : ''}</span>
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <span>💰</span>
                            <span style={{ fontWeight: 600 }}>${event.price}</span>
                            <span>/RSVP</span>
                          </div>
                          {event.capacity > 0 && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              color: event.rsvpCount >= event.capacity ? '#ef4444' : '#64748b'
                            }}>
                              {event.rsvpCount}/{event.capacity}
                              {event.rsvpCount >= event.capacity && ' • Full'}
                            </div>
                          )}
                        </div>

                        {/* Event ID - Copyable */}
                        <div style={{
                          marginTop: '0.75rem',
                          paddingTop: '0.75rem',
                          borderTop: '1px solid #f1f5f9',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span style={{
                            fontSize: '0.75rem',
                            color: '#94a3b8',
                            fontFamily: 'monospace'
                          }}>
                            Event ID:
                          </span>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.7rem',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              transition: 'all 0.2s',
                              maxWidth: '200px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            onClick={() => {
                              navigator.clipboard.writeText(event.id);
                              // Show brief feedback
                              const span = document.querySelector(`[data-host-event-id="${event.id}"]`) as HTMLElement;
                              if (span) {
                                const originalText = span.textContent;
                                span.textContent = 'Copied!';
                                span.style.color = '#10b981';
                                setTimeout(() => {
                                  span.textContent = originalText;
                                  span.style.color = '#64748b';
                                }, 1000);
                              }
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.background = '#f1f5f9';
                              e.currentTarget.style.color = '#475569';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = '#f8fafc';
                              e.currentTarget.style.color = '#64748b';
                            }}
                            data-host-event-id={event.id}
                            title="Click to copy full event ID"
                          >
                            {event.id}
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Create Event Card */}
                    <div
                      onClick={() => setShowCreateModal(true)}
                      style={{
                        background: 'white',
                        border: '2px dashed #cbd5e1',
                        borderRadius: '12px',
                        padding: '3rem 1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        minHeight: '200px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.background = '#eff6ff';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.background = 'white';
                      }}
                    >
                      <div style={{
                        width: '3rem',
                        height: '3rem',
                        borderRadius: '50%',
                        background: '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '1rem',
                        fontSize: '1.5rem',
                        color: '#3b82f6'
                      }}>
                        +
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#475569' }}>
                        Create New Event
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Dev Tools: Console Logs Panel (Fixed Right Side) */}
        {!logsCollapsed && (
          <div style={{
            position: 'fixed',
            right: 0,
            top: '73px', // Below header
            bottom: 0,
            width: '400px',
            background: '#0f172a',
            borderLeft: '2px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 90,
            boxShadow: '-4px 0 12px rgba(0,0,0,0.1)'
          }}>
            {/* Dev Tools Header */}
            <div style={{
              padding: '0.75rem 1rem',
              background: '#1e293b',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#94a3b8', fontWeight: 600 }}>
                  🛠️ DEV CONSOLE
                </span>
                <span style={{
                  fontSize: '0.625rem',
                  color: '#64748b',
                  background: '#334155',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace'
                }}>
                  {logs.length}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setLogs([])}
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: '#334155',
                    color: '#e2e8f0',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#475569'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#334155'}
                >
                  Clear
                </button>
                <button
                  onClick={() => setLogsCollapsed(true)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: '#334155',
                    color: '#e2e8f0',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#475569'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#334155'}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Logs Content */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              fontFamily: 'SF Mono, Consolas, Monaco, monospace',
              fontSize: '0.75rem'
            }}>
              {logs.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '0.875rem'
                }}>
                  Console logs will appear here...
                </div>
              ) : (
                logs.map((l, i) => {
                  const isError = l.includes('❌');
                  const isSuccess = l.includes('✅');
                  const isInfo = l.includes('📧') || l.includes('🔐') || l.includes('🚀') || l.includes('📋');

                  return (
                    <div
                      key={i}
                      style={{
                        padding: '0.625rem 1rem',
                        color: isError ? '#fca5a5' : isSuccess ? '#86efac' : isInfo ? '#93c5fd' : '#cbd5e1',
                        borderBottom: '1px solid #1e293b',
                        fontFamily: 'inherit',
                        lineHeight: '1.5'
                      }}
                    >
                      {l}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Show Console Button (when collapsed) */}
        {logsCollapsed && (
          <button
            onClick={() => setLogsCollapsed(false)}
            style={{
              position: 'fixed',
              right: '1rem',
              bottom: '1rem',
              padding: '0.75rem 1.25rem',
              background: '#0f172a',
              color: 'white',
              border: '2px solid #1e293b',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            }}
          >
            🛠️ Show Dev Console
          </button>
        )}
      </div>

      {/* Create Event Modal */}
      <CreateEventModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={createEvent}
        isCreating={isCreatingEvent}
      />
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
