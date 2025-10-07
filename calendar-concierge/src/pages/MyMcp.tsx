import { useState, useCallback } from "react";
import { CrossmintProvider, CrossmintAuthProvider, useAuth } from "@crossmint/client-sdk-react-ui";
import { CrossmintWallets, createCrossmint } from "@crossmint/wallets-sdk";

// Using Vite's import.meta.env (typed as any to avoid TS ambient issues in this file)
const VITE_ENV: any = (import.meta as any).env || {};
const CLIENT_KEY = VITE_ENV.VITE_CROSSMINT_CLIENT_KEY || VITE_ENV.VITE_CROSSMINT_API_KEY || "";

function MyMcpInner() {
  const { login, logout, user, jwt } = useAuth();

  const [email, setEmail] = useState("");
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
  const [secrets, setSecrets] = useState<any[]>([]);
  const [isLoadingSecrets, setIsLoadingSecrets] = useState(false);

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-100));

  const initializeWallet = useCallback(async () => {
    if (!CLIENT_KEY.startsWith("ck_")) {
      addLog("❌ VITE_CROSSMINT_CLIENT_KEY must be a client key (ck_)");
      return;
    }
    const ownerEmail = user?.email || email;
    if (!ownerEmail) {
      addLog("❌ Please login or enter an email");
      return;
    }
    if (!jwt) {
      addLog("🔐 Login required to obtain JWT for Email OTP signer");
      return;
    }

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
  }, [CLIENT_KEY, email, user?.email, jwt]);

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

  const WORKER_BASE = (VITE_ENV.VITE_WORKER_BASE_URL as string) || "https://calendar-concierge.angela-temp.workers.dev";

  const createMcp = useCallback(async () => {
    const ownerEmail = user?.email || email;
    if (!ownerEmail || !wallet) return;
    const res = await fetch(`${WORKER_BASE}/api/users/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: `email:${ownerEmail}`, walletAddress: wallet.address })
    });
    if (!res.ok) {
      addLog(`❌ Create MCP failed: ${await res.text()}`);
      return;
    }
    const data = (await res.json()) as { mcpUrl?: string };
    setMcpUrl(data.mcpUrl || null);
    addLog(`✅ MCP ready at ${data.mcpUrl}`);
  }, [user?.email, email, wallet]);

  const storeSecret = useCallback(async () => {
    const ownerEmail = user?.email || email;
    if (!ownerEmail || !wallet || !secretName || !secretValue) {
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
          userId: `email:${ownerEmail}`,
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
  }, [user?.email, email, wallet, secretName, secretValue]);

  const listSecrets = useCallback(async () => {
    const ownerEmail = user?.email || email;
    if (!ownerEmail || !wallet) {
      addLog("❌ Please initialize wallet first");
      return;
    }

    try {
      setIsLoadingSecrets(true);
      addLog("📋 Listing secrets...");

      // Extract urlSafeId from the MCP URL (the part after /users/)
      const urlMatch = mcpUrl?.match(/\/users\/([^\/]+)/);
      if (!urlMatch) {
        addLog("❌ Invalid MCP URL format");
        return;
      }
      const urlSafeId = urlMatch[1];

      // Call the MCP server directly to list secrets
      const response = await fetch(`${WORKER_BASE}/mcp/users/${urlSafeId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-scope-id": urlSafeId
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "listSecrets",
            arguments: {}
          }
        })
      });

      if (!response.ok) {
        addLog(`❌ Failed to list secrets: ${response.status} ${response.statusText}`);
        return;
      }

      const result = await response.json() as any;
      if (result.error) {
        addLog(`❌ MCP error: ${result.error.message}`);
        return;
      }

      // Parse the result content
      const content = result.result?.content?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        setSecrets(parsed.secrets || []);
        addLog(`✅ Found ${parsed.count || 0} secret(s)`);
      } else {
        addLog("❌ No content in response");
      }
    } catch (error) {
      addLog(`❌ Error listing secrets: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingSecrets(false);
    }
  }, [user?.email, email, wallet, mcpUrl]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>My MCP (Email OTP)</h1>
      <div style={{ display: "grid", gap: 16 }}>
        {!CLIENT_KEY || !CLIENT_KEY.startsWith("ck_") ? (
          <div style={{ padding: 12, background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, color: "#92400e" }}>
            Set a client API key (ck_) in <code>.dev.vars</code> as <code>VITE_CROSSMINT_CLIENT_KEY=ck_staging_...</code> and restart.
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ flex: 1 }}>
            Owner Email
            <input
              type="email"
              value={user?.email || email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={!!user?.email}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
            />
          </label>
          {user ? (
            <button onClick={logout}>Logout</button>
          ) : (
            <button onClick={login}>Login</button>
          )}
        </div>

        <button onClick={initializeWallet} disabled={isProcessing || !!wallet}>
          {wallet ? "Wallet Ready" : "Initialize Wallet"}
        </button>

        {otpRequired && (
          <div style={{ padding: 12, background: "#fff9f0", border: "1px solid #ffeaa7", borderRadius: 8 }}>
            <div style={{ marginBottom: 8 }}>📧 Email OTP Verification</div>
            {!otpSent ? (
              <button onClick={sendOtp}>Send OTP</button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input value={currentOtp} onChange={(e) => setCurrentOtp(e.target.value)} maxLength={6} placeholder="Enter 6-digit OTP" />
                <button onClick={submitOtp} disabled={currentOtp.length !== 6}>Verify</button>
              </div>
            )}
          </div>
        )}

        {wallet && (
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Wallet: {wallet.address}
          </div>
        )}

        <button onClick={createMcp} disabled={!wallet}>
          Create My MCP
        </button>

        {mcpUrl && (
          <div>
            <strong>Your MCP URL:</strong> <code>{mcpUrl}</code>
            <div style={{ marginTop: 8 }}>
              <button
                onClick={listSecrets}
                disabled={isLoadingSecrets}
                style={{ padding: 8, marginRight: 8 }}
              >
                {isLoadingSecrets ? "Loading..." : "📋 List Secrets"}
              </button>
            </div>
          </div>
        )}

        {mcpUrl && (
          <div style={{ marginTop: 24, padding: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>Store a Secret</h3>
            <p style={{ fontSize: 14, color: "#64748b" }}>
              Store secrets in your MCP. Only you (the MCP owner) can add secrets via this authenticated interface.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <label>
                Secret Name
                <input
                  type="text"
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                  placeholder="e.g., OPENAI_API_KEY"
                  style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
                />
              </label>
              <label>
                Secret Value
                <input
                  type="password"
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="sk-..."
                  style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
                />
              </label>
              <button
                onClick={storeSecret}
                disabled={isStoringSecret || !secretName || !secretValue}
                style={{ padding: 8 }}
              >
                {isStoringSecret ? "Storing..." : "Store Secret"}
              </button>
            </div>
          </div>
        )}

        {/* Secrets List Section */}
        {secrets.length > 0 && (
          <div style={{ marginTop: 24, padding: 16, background: "#f0f9ff", border: "1px solid #0ea5e9", borderRadius: 8 }}>
            <h3 style={{ marginTop: 0, color: "#0c4a6e" }}>📋 Your Secrets ({secrets.length})</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {secrets.map((secret, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    background: "white",
                    border: "1px solid #e0f2fe",
                    borderRadius: 6,
                    fontSize: 14
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {secret.description || `Secret ${idx + 1}`}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    <div>ID: <code>{secret.id}</code></div>
                    <div>Amount: ${secret.amount}</div>
                    <div>Retrievals: {secret.retrievalCount}</div>
                    <div>Created: {new Date(secret.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div style={{ background: "#0f172a", color: "#e2e8f0", padding: 12, borderRadius: 8, fontFamily: "SF Mono, monospace", fontSize: 12, maxHeight: 200, overflowY: "auto" }}>
            {logs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
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


