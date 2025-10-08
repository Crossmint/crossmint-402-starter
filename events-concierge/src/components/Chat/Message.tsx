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
          {message.inlineComponent.type === 'events-list' && (
            <EventsList data={message.inlineComponent.data} />
          )}
          {message.inlineComponent.type === 'rsvp-confirmation' && (
            <RsvpConfirmation data={message.inlineComponent.data} />
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
        Wallet Information
      </div>
      <div style={{ fontSize: '0.8125rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div>
          <strong>Guest (Payer):</strong>
          <div className="mono" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {data.guestAddress}
            {data.deployed && <span style={{
              marginLeft: '0.5rem',
              background: '#dcfce7',
              color: '#166534',
              padding: '0.125rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 600
            }}>DEPLOYED</span>}
            {!data.deployed && <span style={{
              marginLeft: '0.5rem',
              background: '#fef3c7',
              color: '#92400e',
              padding: '0.125rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 600
            }}>PRE-DEPLOYED</span>}
          </div>
        </div>
        <div>
          <strong>Host (Recipient):</strong>
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
        Available Tools
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

// Inline component: Events List
function EventsList({ data }: { data: any }) {
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {data.events?.map((event: any, idx: number) => (
          <div
            key={idx}
            style={{
              padding: '1rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.8125rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#0f172a', marginBottom: '0.25rem' }}>
                  {event.title}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  📅 {new Date(event.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              <div style={{
                background: '#eff6ff',
                color: '#3b82f6',
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: 600
              }}>
                ${event.price}
              </div>
            </div>

            <div style={{ color: '#64748b', fontSize: '0.8125rem', marginBottom: '0.5rem', lineHeight: '1.4' }}>
              {event.description}
            </div>

            <div style={{
              display: 'flex',
              gap: '1rem',
              fontSize: '0.75rem',
              color: '#64748b',
              paddingTop: '0.5rem',
              borderTop: '1px solid #f1f5f9'
            }}>
              <span>👥 {event.rsvpCount} RSVPs</span>
              {event.capacity > 0 && (
                <span>
                  {event.capacity - event.rsvpCount} spots left
                  {event.rsvpCount >= event.capacity && <span style={{ color: '#ef4444' }}> • Full</span>}
                </span>
              )}
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.2s'
                }}
                onClick={() => {
                  navigator.clipboard.writeText(event.id);
                  // Optional: Show a brief toast notification
                  const span = document.querySelector(`[data-event-id="${event.id}"]`) as HTMLElement;
                  if (span) {
                    const originalText = span.textContent;
                    span.textContent = 'Copied!';
                    span.style.color = '#10b981';
                    setTimeout(() => {
                      span.textContent = originalText;
                      span.style.color = '#94a3b8';
                    }, 1000);
                  }
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#e2e8f0';
                  e.currentTarget.style.color = '#64748b';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#f1f5f9';
                  e.currentTarget.style.color = '#94a3b8';
                }}
                data-event-id={event.id}
                title="Click to copy full event ID"
              >
                ID: {event.id}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Inline component: RSVP Confirmation
function RsvpConfirmation({ data }: { data: any }) {
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{
        background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
        border: '2px solid #22c55e',
        borderRadius: '8px',
        padding: '1.25rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
        <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>
          RSVP Confirmed!
        </div>
        <div style={{ fontSize: '0.875rem', color: '#15803d', marginBottom: '1rem' }}>
          You're registered for "{data.eventTitle}"
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          fontSize: '0.8125rem',
          color: '#166534'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Total RSVPs</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{data.rsvpCount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
