import React from 'react';
import type { Log, WalletInfo, Tool } from "../../types";

interface NerdPanelProps {
  walletInfo: WalletInfo | null;
  mcpConnected: boolean;
  mcpUrl: string;
  onMcpUrlChange: (url: string) => void;
  tools: Tool[];
  logs: Log[];
  transactions: any[]; // Added for transaction history
  onConnectMCP: () => void;
  onDisconnectMCP: () => void;
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
  transactions,
  onConnectMCP,
  onDisconnectMCP,
  onClearLogs,
  onExportChat,
  onExportLogs,
  onExportConfig,
  onShowTransactions
}: NerdPanelProps) {
  // Handler to copy logs to clipboard
  const handleCopyLogs = () => {
    const logsText = logs.map(log =>
      `[${log.timestamp.toLocaleTimeString()}] [${log.type.toUpperCase()}] ${log.text}`
    ).join('\n');

    navigator.clipboard.writeText(logsText).then(() => {
      console.log('Logs copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy logs:', err);
    });
  };
  return (
    <div className="nerd-pane">
      {/* MCP Configuration Section */}
      <div className="nerd-section">
        <div className="nerd-section-header">
          <h3>MCP Configuration</h3>
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
                {mcpConnected ? 'Status: Connected' : 'Enter MCP server URL to connect'}
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
              {mcpConnected ? 'Disconnect' : 'Connect MCP'}
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Info Section */}
      {walletInfo && (
        <div className="nerd-section">
          <div className="nerd-section-header">
            <h3>Wallet Information</h3>
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
                      fontSize: '0.7rem',
                      color: '#15803d',
                      fontWeight: 600,
                      background: '#dcfce7',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '4px'
                    }}>
                      DEPLOYED
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '0.7rem',
                      color: '#b45309',
                      fontWeight: 600,
                      background: '#fef3c7',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '4px'
                    }}>
                      PRE-DEPLOYED
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

      {/* Available Tools Section */}
      {mcpConnected && tools.length > 0 && (
        <div className="nerd-section">
          <div className="nerd-section-header">
            <h3>Available Tools</h3>
          </div>
          <div className="nerd-section-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tools.map((tool, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    {tool.name}
                    {tool.isPaid && (
                      <span style={{
                        background: '#3b82f6',
                        color: 'white',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        ${tool.price}
                      </span>
                    )}
                    {!tool.isPaid && (
                      <span style={{
                        background: '#22c55e',
                        color: 'white',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        free
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                    {tool.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Section */}
      <div className="nerd-section">
        <div className="nerd-section-header">
          <h3>Transaction History</h3>
        </div>
        <div className="nerd-section-body">
          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', padding: '1rem' }}>
              No transactions yet
            </div>
          ) : (
            <div style={{ fontSize: '0.8125rem' }}>
              {/* Show only the last transaction */}
              {(() => {
                const lastTx = transactions[transactions.length - 1];
                return (
                  <div style={{
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{
                        background: lastTx.type === 'payment' ? '#3b82f6' : '#f59e0b',
                        color: 'white',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        {lastTx.type}
                      </span>
                      <span style={{
                        background: lastTx.status === 'success' ? '#22c55e' : lastTx.status === 'failed' ? '#ef4444' : '#f59e0b',
                        color: 'white',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        {lastTx.status}
                      </span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                      {lastTx.timestamp.toLocaleString()}
                    </div>
                    {lastTx.type === 'payment' && lastTx.amount && (
                      <div style={{ fontWeight: 600, color: '#3b82f6', marginTop: '0.25rem' }}>
                        {lastTx.amount}
                      </div>
                    )}
                    {lastTx.txHash && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <a
                          href={`https://sepolia.basescan.org/tx/${lastTx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#3b82f6',
                            fontSize: '0.75rem',
                            textDecoration: 'none',
                            wordBreak: 'break-all'
                          }}
                        >
                          View on Explorer ↗
                        </a>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Raw Logs Section */}
      <div className="nerd-section">
        <div className="nerd-section-header">
          <h3>Console Logs</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn-secondary"
              onClick={handleCopyLogs}
              style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
            >
              Copy
            </button>
            <button
              className="btn-secondary"
              onClick={onClearLogs}
              style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
            >
              Clear
            </button>
          </div>
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
