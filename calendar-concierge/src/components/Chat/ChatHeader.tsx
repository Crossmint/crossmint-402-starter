import React from 'react';

interface ChatHeaderProps {
  nerdMode: boolean;
  onToggleNerdMode: () => void;
  mcpConnected: boolean;
}

export function ChatHeader({ nerdMode, onToggleNerdMode, mcpConnected }: ChatHeaderProps) {
  return (
    <div className="chat-header">
      <div className="chat-header-top">
        <h1>🔐 Secret Vault MCP</h1>
        <div className="chat-header-actions">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            color: '#64748b'
          }}>
            <span
              className={`status-dot ${mcpConnected ? 'connected' : 'disconnected'}`}
            />
            {mcpConnected ? 'Connected' : 'Disconnected'}
          </div>
          <button
            className={`nerd-toggle ${nerdMode ? '' : 'inactive'}`}
            onClick={onToggleNerdMode}
          >
            🤓 Nerd Mode
          </button>
        </div>
      </div>
      <p className="subtitle">
        Pay-per-use secret storage powered by Crossmint smart wallets & x402
      </p>
    </div>
  );
}
