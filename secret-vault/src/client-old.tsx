import "./styles.css";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

interface Tool {
  name: string;
  description: string;
  isPaid: boolean;
  price: number | null;
}

interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  resource: string;
  description: string;
}

interface PaymentPopupProps {
  show: boolean;
  requirements: PaymentRequirement | null;
  confirmationId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function PaymentPopup({ show, requirements, confirmationId, onConfirm, onCancel }: PaymentPopupProps) {
  if (!show || !requirements) return null;

  const amountUSD = (Number(requirements.maxAmountRequired) / 1_000_000).toFixed(2);

  return (
    <div className="payment-backdrop">
      <div className="payment-modal">
        <h3>💳 Payment Required</h3>
        <p className="payment-subtitle">A paid tool has been requested. Confirm to continue.</p>

        <dl className="payment-details">
          <dt>Resource</dt>
          <dd>{requirements.resource}</dd>

          <dt>Description</dt>
          <dd>{requirements.description}</dd>

          <dt>Pay to</dt>
          <dd className="mono">{requirements.payTo}</dd>

          <dt>Network</dt>
          <dd>{requirements.network}</dd>

          <dt>Amount</dt>
          <dd className="payment-amount">${amountUSD} USD</dd>

          <dt>Confirmation ID</dt>
          <dd className="mono">{confirmationId}</dd>
        </dl>

        <div className="payment-buttons">
          <button className="btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-confirm" onClick={onConfirm}>
            Confirm & Pay
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [mcpConnected, setMcpConnected] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [logs, setLogs] = useState<Array<{ type: string; text: string }>>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentReq, setPaymentReq] = useState<PaymentRequirement | null>(null);
  const [confirmationId, setConfirmationId] = useState("");
  const [selectedTool, setSelectedTool] = useState("");
  const [toolArgs, setToolArgs] = useState("{}");
  const [guestAddress, setGuestAddress] = useState<string>("");
  const [hostAddress, setHostAddress] = useState<string>("");
  const [network, setNetwork] = useState<string>("");
  const [guestWalletDeployed, setGuestWalletDeployed] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Update toolArgs when selectedTool changes
  useEffect(() => {
    if (selectedTool === "storeSecret") {
      setToolArgs('{\n  "secret": "MY-API-KEY-123",\n  "amount": "0.05",\n  "description": "My API key"\n}');
    } else if (selectedTool === "listSecrets") {
      setToolArgs('{}');
    } else if (selectedTool === "retrieveSecret") {
      setToolArgs('{\n  "secretId": "paste-secret-id-here"\n}');
    } else {
      setToolArgs('{}');
    }
  }, [selectedTool]);

  const agent = useAgent({
    agent: "guest",
    name: "default"
  });

  const addLog = useCallback((type: string, text: string) => {
    console.log(`[LOG ${type}]`, text);
    setLogs(prev => [...prev, { type, text }]);
    setTimeout(() => {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  const connectMCP = useCallback(() => {
    console.log("connectMCP called, agent:", agent);

    if (!agent) {
      console.error("Agent not available");
      addLog("error", "Agent not available");
      return;
    }

    console.log("Sending connect_mcp message");
    addLog("client", "Connecting to MCP server...");

    try {
      agent.send(JSON.stringify({ type: "connect_mcp", url: "http://localhost:5173/mcp" }));
      console.log("Message sent successfully");
    } catch (error) {
      console.error("Failed to send message:", error);
      addLog("error", `Failed to connect: ${error}`);
    }
  }, [agent, addLog]);

  const callTool = useCallback(() => {
    if (!agent || !selectedTool) return;

    let args;
    try {
      args = JSON.parse(toolArgs);
    } catch (e) {
      addLog("error", "Invalid JSON in arguments");
      return;
    }

    addLog("client", `Calling tool: ${selectedTool}`);
    agent.send(JSON.stringify({
      type: "call_tool",
      tool: selectedTool,
      arguments: args
    }));
  }, [agent, selectedTool, toolArgs, addLog]);

  const confirmPayment = useCallback(() => {
    if (!agent) return;
    addLog("client", `Payment confirmed: ${confirmationId}`);
    agent.send(JSON.stringify({ type: "confirm", confirmationId }));
    setShowPayment(false);
  }, [agent, confirmationId, addLog]);

  const cancelPayment = useCallback(() => {
    if (!agent) return;
    addLog("client", `Payment cancelled: ${confirmationId}`);
    agent.send(JSON.stringify({ type: "cancel", confirmationId }));
    setShowPayment(false);
  }, [agent, confirmationId, addLog]);

  useEffect(() => {
    if (!agent) return;

    const handleMessage = (event: MessageEvent) => {
      console.log("Received WebSocket message:", event.data);
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        // Ignore internal cloudflare messages
        if (data.type?.startsWith("cf_")) {
          console.log("Ignoring cf_ message");
          return;
        }

        console.log("Processing message type:", data.type);
        addLog("server", JSON.stringify(data, null, 2));

        switch (data.type) {
          case "wallet_info":
            console.log("Wallet info received:", data);
            setGuestAddress(data.guestAddress);
            setHostAddress(data.hostAddress);
            setNetwork(data.network);
            setGuestWalletDeployed(data.guestWalletDeployed || false);
            break;

          case "mcp_connected":
            console.log("MCP Connected! Tools:", data.tools);
            setMcpConnected(true);
            setTools(data.tools || []);
            addLog("system", `✅ Connected to MCP! Found ${data.tools?.length || 0} tools`);
            break;

          case "payment_required":
            addLog("payment", `Payment required: ${data.confirmationId}`);
            setPaymentReq(data.requirements[0]);
            setConfirmationId(data.confirmationId);
            setShowPayment(true);
            break;

          case "tool_result":
            addLog("result", `Tool result: ${data.result}`);
            break;

          case "tool_error":
            addLog("error", `Tool error: ${data.result}`);
            break;

          case "error":
            addLog("error", data.message);
            break;

          default:
            console.log("Unknown message type:", data.type);
        }
      } catch (e) {
        console.error("Error handling message:", e);
      }
    };

    // Use agent.addEventListener directly (PartySocket API)
    console.log("Setting up message listener on agent");
    agent.addEventListener("message", handleMessage);

    return () => {
      console.log("Removing message listener from agent");
      agent.removeEventListener("message", handleMessage);
    };
  }, [agent, addLog]);

  return (
    <div className="app">
      <PaymentPopup
        show={showPayment}
        requirements={paymentReq}
        confirmationId={confirmationId}
        onConfirm={confirmPayment}
        onCancel={cancelPayment}
      />

      <header className="app-header">
        <h1>🔐 Secret Vault MCP</h1>
        <p className="subtitle">Pay-per-use secret storage via x402</p>
      </header>

      <div className="container">
        {/* Wallet Info Section */}
        {guestAddress && hostAddress && (
          <section className="card">
            <div className="card-header">
              <h2>💰 Wallet Information</h2>
            </div>
            <div className="card-body">
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong>Guest Wallet (Payer):</strong>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.75em",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: guestWalletDeployed ? "#d4edda" : "#fff3cd",
                        color: guestWalletDeployed ? "#155724" : "#856404",
                        border: `1px solid ${guestWalletDeployed ? "#c3e6cb" : "#ffeaa7"}`,
                        fontWeight: "500"
                      }}
                      title={guestWalletDeployed ? "Smart wallet deployed on-chain" : "Pre-deployed smart wallet (will auto-deploy on first payment)"}
                    >
                      {guestWalletDeployed ? "✨ Deployed" : "⚡ Pre-deployed"}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: "0.85em", marginTop: "4px", wordBreak: "break-all" }}>
                    {guestAddress}
                  </div>
                </div>
                <div>
                  <strong>Host Wallet (Recipient):</strong>
                  <div className="mono" style={{ fontSize: "0.85em", marginTop: "4px", wordBreak: "break-all" }}>
                    {hostAddress}
                  </div>
                </div>
                <div>
                  <strong>Network:</strong>
                  <span style={{ marginLeft: "8px" }}>{network}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Connection Section */}
        <section className="card">
          <div className="card-header">
            <h2>🔌 MCP Connection</h2>
            <span className={`status-dot ${mcpConnected ? "connected" : "disconnected"}`}></span>
          </div>
          <div className="card-body">
            {!mcpConnected ? (
              <button className="btn-primary" onClick={connectMCP}>
                Connect to Secret Vault MCP
              </button>
            ) : (
              <div>
                <p className="success-text">✅ Connected to MCP Server</p>
                <p className="text-sm">Available tools: {tools.length}</p>
              </div>
            )}
          </div>
        </section>

        {/* Tools Section */}
        {mcpConnected && (
          <section className="card">
            <div className="card-header">
              <h2>🛠️ Available Tools</h2>
            </div>
            <div className="card-body">
              <div className="tools-list">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    className={`tool-item ${selectedTool === tool.name ? "selected" : ""}`}
                    onClick={() => setSelectedTool(tool.name)}
                  >
                    <div className="tool-name">
                      {tool.name}
                      {tool.isPaid && <span className="paid-badge">${tool.price}</span>}
                      {!tool.isPaid && <span className="free-badge">free</span>}
                    </div>
                    <div className="tool-description">{tool.description}</div>
                  </div>
                ))}
              </div>

              {selectedTool && (
                <div className="tool-call-form">
                  <h3>Call {selectedTool}</h3>
                  <label>
                    Arguments (JSON):
                    <textarea
                      value={toolArgs}
                      onChange={(e) => setToolArgs(e.target.value)}
                      placeholder={
                        selectedTool === "storeSecret"
                          ? '{\n  "secret": "MY-API-KEY-123",\n  "amount": "0.05",\n  "description": "My API key"\n}'
                          : selectedTool === "listSecrets"
                          ? '{}'
                          : selectedTool === "retrieveSecret"
                          ? '{\n  "secretId": "paste-secret-id-here"\n}'
                          : '{}'
                      }
                      rows={selectedTool === "storeSecret" ? 5 : 3}
                    />
                  </label>
                  <button className="btn-primary" onClick={callTool}>
                    Call Tool
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Console */}
        <section className="card">
          <div className="card-header">
            <h2>📋 Console</h2>
            <button className="btn-secondary" onClick={() => setLogs([])}>
              Clear
            </button>
          </div>
          <div className="card-body">
            <div className="console">
              {logs.map((log, i) => (
                <div key={i} className="log-entry">
                  <span className={`log-badge ${log.type}`}>{log.type.toUpperCase()}</span>
                  <pre>{log.text}</pre>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
