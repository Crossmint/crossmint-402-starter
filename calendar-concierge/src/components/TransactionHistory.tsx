import React from 'react';
import type { Transaction } from "../types";

interface TransactionHistoryProps {
  show: boolean;
  transactions: Transaction[];
  onClose: () => void;
}

export function TransactionHistory({ show, transactions, onClose }: TransactionHistoryProps) {
  if (!show) return null;

  const formatAmount = (amount?: string) => {
    if (!amount) return 'N/A';
    return `$${(Number(amount) / 1_000_000).toFixed(2)}`;
  };

  const formatAddress = (address?: string) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="payment-backdrop" onClick={onClose}>
      <div className="payment-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>💸 Transaction History</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#64748b'
            }}
          >
            ×
          </button>
        </div>

        {transactions.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
            No transactions yet
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {transactions.map((tx) => (
              <div
                key={tx.id}
                style={{
                  padding: '1rem',
                  borderBottom: '1px solid #e2e8f0',
                  fontSize: '0.875rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{
                      background: tx.type === 'payment' ? '#3b82f6' : '#f59e0b',
                      color: 'white',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      marginRight: '0.5rem'
                    }}>
                      {tx.type}
                    </span>
                    <span style={{
                      background: tx.status === 'success' ? '#22c55e' : tx.status === 'failed' ? '#ef4444' : '#f59e0b',
                      color: 'white',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {tx.status}
                    </span>
                  </div>
                  <div style={{ color: '#64748b' }}>
                    {tx.timestamp.toLocaleString()}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem', color: '#475569' }}>
                  {tx.type === 'payment' && (
                    <>
                      <div style={{ fontWeight: 500 }}>Amount:</div>
                      <div style={{ fontWeight: 600, color: '#3b82f6' }}>{formatAmount(tx.amount)}</div>

                      <div style={{ fontWeight: 500 }}>Resource:</div>
                      <div>{tx.resource || 'N/A'}</div>

                      <div style={{ fontWeight: 500 }}>From:</div>
                      <div className="mono" style={{ fontSize: '0.75rem' }}>{formatAddress(tx.from)}</div>

                      <div style={{ fontWeight: 500 }}>To:</div>
                      <div className="mono" style={{ fontSize: '0.75rem' }}>{formatAddress(tx.to)}</div>
                    </>
                  )}

                  {tx.type === 'deployment' && (
                    <>
                      <div style={{ fontWeight: 500 }}>Wallet:</div>
                      <div className="mono" style={{ fontSize: '0.75rem' }}>{formatAddress(tx.from)}</div>
                    </>
                  )}

                  {tx.txHash && (
                    <>
                      <div style={{ fontWeight: 500 }}>Tx Hash:</div>
                      <div>
                        <a
                          href={`https://sepolia.basescan.org/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#3b82f6', textDecoration: 'none' }}
                        >
                          {formatAddress(tx.txHash)} ↗
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
