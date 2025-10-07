import "./styles.css";
import "./chat.css";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useState } from "react";
import { ChatHeader } from "./components/Chat/ChatHeader";
import { MessageList } from "./components/Chat/MessageList";
import { ChatInput } from "./components/Chat/ChatInput";
import { NerdPanel } from "./components/NerdMode/NerdPanel";
import { TransactionHistory } from "./components/TransactionHistory";
import type { ChatMessage, Log, Tool, PaymentRequirement, WalletInfo, Transaction } from "./types";
import { detectIntent, getSuggestedActions } from "./utils/intentDetection";
import { exportChatAsMarkdown, exportLogsAsJSON, exportWalletConfig } from "./utils/exportUtils";

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

interface ClientAppProps {
  apiKey: string;
}

export function ClientApp({ apiKey }: ClientAppProps) {
  // UI State
  const [nerdMode, setNerdMode] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [mcpUrl, setMcpUrl] = useState("https://calendar-concierge.angela-temp.workers.dev/mcp");
  const [showTransactions, setShowTransactions] = useState(false);

  // Agent State
  const [mcpConnected, setMcpConnected] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Payment State
  const [showPayment, setShowPayment] = useState(false);
  const [paymentReq, setPaymentReq] = useState<PaymentRequirement | null>(null);
  const [confirmationId, setConfirmationId] = useState("");

  // Always connect directly to workers.dev over secure WSS in browser
  const agent = useAgent({
    agent: "guest",
    name: "default",
    host: "calendar-concierge.angela-temp.workers.dev",
    secure: true
  });

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date()
    }]);
  }, []);

  const addLog = useCallback((type: Log['type'], text: string) => {
    setLogs(prev => [...prev, {
      type,
      text,
      timestamp: new Date()
    }]);
  }, []);

  // Wallet state (received from agent, not initialized client-side)
  const [walletState, setWalletState] = useState<{ wallet: any | null }>({ wallet: null });

  const addTransaction = useCallback((transaction: Omit<Transaction, 'id' | 'timestamp'>) => {
    setTransactions(prev => [...prev, {
      ...transaction,
      id: crypto.randomUUID(),
      timestamp: new Date()
    }]);
  }, []);

  // Wallet is initialized by the agent, not the client
  // Client just receives wallet info from agent via wallet_info message

  // Export handlers
  const handleExportChat = useCallback(() => {
    exportChatAsMarkdown(messages);
  }, [messages]);

  const handleExportLogs = useCallback(() => {
    exportLogsAsJSON(logs);
  }, [logs]);

  const handleExportConfig = useCallback(() => {
    exportWalletConfig(walletInfo);
  }, [walletInfo]);

  // Handle user sending messages
  const handleSendMessage = useCallback((userMessage: string) => {
    // Add user message to chat
    addMessage({
      sender: 'user',
      text: userMessage
    });

    addLog('client', `User: ${userMessage}`);

    // Detect intent
    const intent = detectIntent(userMessage);

    // Handle different intents
    switch (intent.type) {
      case 'connect':
        if (!agent) {
          addMessage({
            sender: 'agent',
            text: '⚠️ Agent not available. Please refresh the page.'
          });
          return;
        }
        addMessage({
          sender: 'system',
          text: `🔌 Connecting to MCP server at ${mcpUrl}...`
        });
        agent.send(JSON.stringify({ type: "connect_mcp", url: mcpUrl }));
        break;

      case 'list':
        if (!mcpConnected) {
          addMessage({
            sender: 'agent',
            text: '⚠️ Please connect to MCP first. Say "connect" to get started.'
          });
          return;
        }
        if (!agent) return;
        addMessage({
          sender: 'system',
          text: '📋 Listing secrets...'
        });
        agent.send(JSON.stringify({
          type: "call_tool",
          tool: "listSecrets",
          arguments: {}
        }));
        break;

      case 'help':
        addMessage({
          sender: 'agent',
          text: `I can help you with:\n\n• "connect" - Connect to the Secret Vault\n• "list secrets" - View all stored secrets\n• "store a secret" - Store a new secret\n• "retrieve secret <id>" - Retrieve a secret (requires payment)\n• "wallet status" - Check wallet information\n\nWhat would you like to do?`
        });
        break;

      case 'status':
        if (walletInfo) {
          addMessage({
            sender: 'agent',
            text: '💰 Here\'s your wallet information:',
            inlineComponent: {
              type: 'wallet-card',
              data: {
                guestAddress: walletInfo.guestAddress,
                hostAddress: walletInfo.hostAddress,
                network: walletInfo.network,
                deployed: walletInfo.guestWalletDeployed
              }
            }
          });
        } else {
          addMessage({
            sender: 'agent',
            text: '⚠️ Wallet information not available yet. Please wait for initialization.'
          });
        }
        break;

      case 'retrieve':
        if (!mcpConnected) {
          addMessage({
            sender: 'agent',
            text: '⚠️ Please connect to MCP first. Say "connect" to get started.'
          });
          return;
        }
        if (!agent) return;

        if (intent.extractedData?.secretId) {
          addMessage({
            sender: 'system',
            text: `🔐 Retrieving secret ${intent.extractedData.secretId}...`
          });
          agent.send(JSON.stringify({
            type: "call_tool",
            tool: "retrieveSecret",
            arguments: { secretId: intent.extractedData.secretId }
          }));
        } else {
          addMessage({
            sender: 'agent',
            text: '⚠️ Please provide a secret ID. For example: "retrieve secret <id>"'
          });
        }
        break;

      case 'store':
        if (!mcpConnected) {
          addMessage({
            sender: 'agent',
            text: '⚠️ Please connect to MCP first. Say "connect" to get started.'
          });
          return;
        }
        addMessage({
          sender: 'agent',
          text: '📝 To store a secret, I\'ll need to implement a form or multi-step conversation. For now, you can use the old UI at /client-old.html'
        });
        break;

      default:
        addMessage({
          sender: 'agent',
          text: `I'm not sure I understand. Try saying "help" to see what I can do!`
        });
    }
  }, [agent, mcpConnected, walletInfo, addMessage, addLog, walletState]);

  // MCP handlers
  const handleConnectMCP = useCallback(() => {
    if (!agent) {
      addMessage({
        sender: 'agent',
        text: '⚠️ Agent not available. Please refresh the page.'
      });
      return;
    }

    addMessage({
      sender: 'system',
      text: `🔌 Connecting to MCP server at ${mcpUrl}...`
    });
    agent.send(JSON.stringify({ type: "connect_mcp", url: mcpUrl }));
  }, [agent, mcpUrl, addMessage]);

  const handleDisconnectMCP = useCallback(() => {
    setMcpConnected(false);
    setTools([]);
    addMessage({
      sender: 'system',
      text: '🔌 Disconnected from MCP'
    });
    addLog('client', 'Disconnected from MCP');
  }, [addMessage, addLog]);

  // Payment handlers
  const confirmPayment = useCallback(() => {
    if (!agent) return;
    addLog('client', `Payment confirmed: ${confirmationId}`);
    agent.send(JSON.stringify({ type: "confirm", confirmationId }));
    setShowPayment(false);
  }, [agent, confirmationId, addLog]);

  const cancelPayment = useCallback(() => {
    if (!agent) return;
    addLog('client', `Payment cancelled: ${confirmationId}`);
    agent.send(JSON.stringify({ type: "cancel", confirmationId }));
    setShowPayment(false);
  }, [agent, confirmationId, addLog]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!agent) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        // Ignore internal cloudflare messages
        if (data.type?.startsWith("cf_")) {
          return;
        }

        addLog('server', JSON.stringify(data, null, 2));

        switch (data.type) {
          case "wallet_info":
            setWalletInfo({
              guestAddress: data.guestAddress,
              hostAddress: data.hostAddress,
              network: data.network,
              guestWalletDeployed: data.guestWalletDeployed || false
            });

            // Add welcome message on first wallet info
            if (messages.length === 0) {
              addMessage({
                sender: 'agent',
                text: '👋 Welcome to Secret Vault MCP!\n\nI\'m your personal assistant for secure, pay-per-use secret storage powered by Crossmint smart wallets.',
                inlineComponent: {
                  type: 'wallet-card',
                  data: {
                    guestAddress: data.guestAddress,
                    hostAddress: data.hostAddress,
                    network: data.network,
                    deployed: data.guestWalletDeployed || false
                  }
                }
              });
              addMessage({
                sender: 'agent',
                text: 'Let\'s get started! Say "connect" to connect to the vault.',
                actions: [
                  { label: 'Connect to Vault', action: 'connect', variant: 'primary' }
                ]
              });
            }
            break;

          case "mcp_connected":
            setMcpConnected(true);
            setTools(data.tools || []);
            addMessage({
              sender: 'system',
              text: `✅ Connected to MCP at ${data.mcpUrl || mcpUrl}! Found ${data.tools?.length || 0} tools`
            });
            addMessage({
              sender: 'agent',
              text: 'Here are the available tools:',
              inlineComponent: {
                type: 'tools-list',
                data: { tools: data.tools || [] }
              }
            });
            addMessage({
              sender: 'agent',
              text: 'Try saying "list secrets" or "store a secret"'
            });
            break;

          case "payment_required":
            addMessage({
              sender: 'system',
              text: `💳 Payment required: $${(Number(data.requirements[0].maxAmountRequired) / 1_000_000).toFixed(2)} USD`
            });
            setPaymentReq(data.requirements[0]);
            setConfirmationId(data.confirmationId);
            setShowPayment(true);
            break;

          case "tool_result":
            addMessage({
              sender: 'agent',
              text: `✅ Tool result:\n\n${data.result}`
            });
            // Track successful payment transaction
            if (paymentReq) {
              addTransaction({
                type: 'payment',
                amount: `$${(Number(paymentReq.maxAmountRequired) / 1_000_000).toFixed(2)}`,
                from: walletInfo?.guestAddress,
                to: walletInfo?.hostAddress,
                resource: paymentReq.resource,
                status: 'success'
              });
            }
            break;

          case "tool_error":
            addMessage({
              sender: 'agent',
              text: `❌ Tool error:\n\n${data.result}`
            });
            break;

          case "wallet_deployed":
            addMessage({
              sender: 'system',
              text: `✨ Wallet deployed successfully!\n\nTransaction: ${data.txHash}`
            });
            // Track deployment transaction
            addTransaction({
              type: 'deployment',
              from: walletInfo?.guestAddress,
              to: walletInfo?.guestAddress,
              txHash: data.txHash,
              status: 'success'
            });
            break;

          case "error":
            addMessage({
              sender: 'agent',
              text: `❌ Error: ${data.message}`
            });
            break;
        }
      } catch (e) {
        console.error("Error handling message:", e);
      }
    };

    agent.addEventListener("message", handleMessage);

    return () => {
      agent.removeEventListener("message", handleMessage);
    };
  }, [agent, addMessage, addLog, addTransaction, messages.length, paymentReq, walletInfo]);

  const suggestedActions = getSuggestedActions(mcpConnected, false);

  return (
    <div className="app-split">
      <PaymentPopup
        show={showPayment}
        requirements={paymentReq}
        confirmationId={confirmationId}
        onConfirm={confirmPayment}
        onCancel={cancelPayment}
      />

      {/* Left: Chat Interface */}
      <div className="chat-pane">
        <ChatHeader
          nerdMode={nerdMode}
          onToggleNerdMode={() => setNerdMode(!nerdMode)}
          mcpConnected={mcpConnected}
        />
        <MessageList
          messages={messages}
          onAction={handleSendMessage}
        />
        <ChatInput
          onSend={handleSendMessage}
          suggestedActions={suggestedActions}
        />
      </div>

      {/* Right: Nerd Mode Panel */}
      {nerdMode && (
        <NerdPanel
          walletInfo={walletInfo}
          mcpConnected={mcpConnected}
          mcpUrl={mcpUrl}
          onMcpUrlChange={setMcpUrl}
          tools={tools}
          logs={logs}
          onConnectMCP={handleConnectMCP}
          onDisconnectMCP={handleDisconnectMCP}
          onListSecrets={() => handleSendMessage('list secrets')}
          onClearLogs={() => setLogs([])}
          onExportChat={handleExportChat}
          onExportLogs={handleExportLogs}
          onExportConfig={handleExportConfig}
          onShowTransactions={() => setShowTransactions(true)}
        />
      )}

      {/* Transaction History Modal */}
      {showTransactions && (
        <TransactionHistory
          show={true}
          transactions={transactions}
          onClose={() => setShowTransactions(false)}
        />
      )}
    </div>
  );
}

// Note: Root rendering now handled by main entry point (see App.tsx)
// This file exports ClientApp which is wrapped by Crossmint providers
