import React from 'react';
import type { ChatMessage } from "../../types";

interface MessageProps {
  message: ChatMessage;
  onAction?: (action: string) => void;
}

export function Message({ message, onAction }: MessageProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className={`message ${message.sender}`}>
      <div className="message-bubble">
        {message.text}
      </div>

      {message.inlineComponent && (
        <div className="message-inline-component">
          {/* Inline components will be rendered here */}
          {message.inlineComponent.type === 'wallet-card' && (
            <WalletCard data={message.inlineComponent.data} />
          )}
          {message.inlineComponent.type === 'tools-list' && (
            <ToolsList data={message.inlineComponent.data} />
          )}
        </div>
      )}

      {message.actions && message.actions.length > 0 && (
        <div className="message-actions">
          {message.actions.map((action, idx) => (
            <button
              key={idx}
              className={`message-action-btn ${action.variant}`}
              onClick={() => onAction?.(action.action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="message-timestamp">
        {formatTime(message.timestamp)}
      </div>
    </div>
  );
}

// Inline component: Wallet Card
function WalletCard({ data }: { data: any }) {
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        💰 Wallet Information
      </div>
      <div style={{ fontSize: '0.8125rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div>
          <strong>Guest:</strong>
          <div className="mono" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {data.guestAddress}
            {data.deployed && <span style={{ marginLeft: '0.5rem' }}>✨ Deployed</span>}
            {!data.deployed && <span style={{ marginLeft: '0.5rem' }}>⚡ Pre-deployed</span>}
          </div>
        </div>
        <div>
          <strong>Host:</strong>
          <div className="mono" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {data.hostAddress}
          </div>
        </div>
        <div>
          <strong>Network:</strong> {data.network}
        </div>
      </div>
    </div>
  );
}

// Inline component: Tools List
function ToolsList({ data }: { data: any }) {
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        🛠️ Available Tools
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {data.tools?.map((tool: any, idx: number) => (
          <div
            key={idx}
            style={{
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '8px',
              fontSize: '0.8125rem'
            }}
          >
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
            <div style={{ color: '#64748b', marginTop: '0.25rem' }}>
              {tool.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
