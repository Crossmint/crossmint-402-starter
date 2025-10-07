import React from 'react';
import type { Log, WalletInfo, Tool } from "../../types";

interface NerdPanelProps {
  walletInfo: WalletInfo | null;
  mcpConnected: boolean;
  mcpUrl: string;
  onMcpUrlChange: (url: string) => void;
  tools: Tool[];
  logs: Log[];
  onConnectMCP: () => void;
  onDisconnectMCP: () => void;
  onListSecrets: () => void;
  onClearLogs: () => void;
  onExportChat: () => void;
  onExportLogs: () => void;
  onExportConfig: () => void;
  onShowTransactions: () => void;
}

export function NerdPanel({
  walletInfo,
  mcpConnected,
  mcpUrl,
  onMcpUrlChange,
  tools,
  logs,
  onConnectMCP,
  onDisconnectMCP,
  onListSecrets,
  onClearLogs,
  onExportChat,
  onExportLogs,
  onExportConfig,
  onShowTransactions
}: NerdPanelProps) {
  return (
    <div className="nerd-pane">
      {/* MCP Configuration Section */}
      <div className="nerd-section">
        <div className="nerd-section-header">
          <h3>🔌 MCP Configuration</h3>
        </div>
        <div className="nerd-section-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                color: '#475569'
              }}>
                MCP Server URL
              </label>
              <input
                type="text"
                placeholder="http://localhost:5173/mcp"
                value={mcpUrl}
                onChange={(e) => onMcpUrlChange(e.target.value)}
                disabled={mcpConnected}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  background: mcpConnected ? '#f8fafc' : 'white',
                  cursor: mcpConnected ? 'not-allowed' : 'text'
                }}
              />
              <div style={{
                fontSize: '0.75rem',
                color: '#64748b',
                marginTop: '0.375rem'
              }}>
                {mcpConnected ? '✅ Connected' : 'Enter MCP server URL to connect'}
              </div>
            </div>

            <button
              className="quick-action-btn"
              onClick={mcpConnected ? onDisconnectMCP : onConnectMCP}
              style={{
                background: mcpConnected ? '#ef4444' : '#3b82f6',
                color: 'white',
                border: 'none'
              }}
            >
              {mcpConnected ? '🔌 Disconnect' : '🔌 Connect MCP'}
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Info Section */}
      {walletInfo && (
        <div className="nerd-section">
          <div className="nerd-section-header">
            <h3>💰 Wallet Information</h3>
          </div>
          <div className="nerd-section-body">
            <div style={{ fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#475569' }}>
                  Guest Wallet (Payer)
                </div>
                <div className="mono" style={{ fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all' }}>
                  {walletInfo.guestAddress}
                </div>
                <div style={{ marginTop: '0.25rem' }}>
                  {walletInfo.guestWalletDeployed ? (
                    <span style={{
                      fontSize: '0.75rem',
                      color: '#15803d',
                      fontWeight: 500
                    }}>
                      ✨ Deployed
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '0.75rem',
                      color: '#b45309',
                      fontWeight: 500
                    }}>
                      ⚡ Pre-deployed
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#475569' }}>
                  Host Wallet (Recipient)
                </div>
                <div className="mono" style={{ fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all' }}>
                  {walletInfo.hostAddress}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#475569' }}>
                  Network
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  {walletInfo.network}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Section */}
      <div className="nerd-section">
        <div className="nerd-section-header">
          <h3>🛠️ Quick Actions</h3>
        </div>
        <div className="nerd-section-body">
          <div className="quick-actions-grid">
            <button
              className="quick-action-btn"
              onClick={onListSecrets}
              disabled={!mcpConnected}
            >
              List Secrets
            </button>
          </div>
        </div>
      </div>

      {/* Export & History Section */}
      <div className="nerd-section">
        <div className="nerd-section-header">
          <h3>💾 Export & History</h3>
        </div>
        <div className="nerd-section-body">
          <div className="quick-actions-grid">
            <button
              className="quick-action-btn"
              onClick={onExportChat}
            >
              📄 Export Chat
            </button>
            <button
              className="quick-action-btn"
              onClick={onExportLogs}
            >
              📜 Export Logs
            </button>
            <button
              className="quick-action-btn"
              onClick={onExportConfig}
            >
              ⚙️ Export Config
            </button>
            <button
              className="quick-action-btn"
              onClick={onShowTransactions}
            >
              💸 Transactions
            </button>
          </div>
        </div>
      </div>

      {/* Raw Logs Section */}
      <div className="nerd-section">
        <div className="nerd-section-header">
          <h3>📜 Raw Logs</h3>
          <button
            className="btn-secondary"
            onClick={onClearLogs}
            style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
          >
            Clear
          </button>
        </div>
        <div className="nerd-section-body" style={{ padding: 0 }}>
          <div className="raw-logs-container">
            {logs.length === 0 && (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>
                No logs yet
              </div>
            )}
            {logs.slice(-50).map((log, idx) => (
              <div key={idx} className="raw-log-entry">
                <div>
                  <span className="raw-log-time">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={`raw-log-badge ${log.type}`}>
                    {log.type}
                  </span>
                </div>
                <div className="raw-log-content">
                  {log.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
