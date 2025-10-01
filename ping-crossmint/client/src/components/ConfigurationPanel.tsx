import React from 'react';
import type { Config, SupportedChain } from '../types';
import { SUPPORTED_CHAINS } from '../constants/chains';

interface ConfigurationPanelProps {
    config: Config;
    onUpdateEmail: (email: string) => void;
    onUpdateChain: (chain: SupportedChain) => void;
    onUpdateServerUrl: (serverUrl: string) => void;
    apiKey: string;
    onUpdateApiKey: (apiKey: string) => void;
    isMinimal?: boolean;
}

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
    config,
    onUpdateEmail,
    onUpdateChain,
    onUpdateServerUrl,
    apiKey,
    onUpdateApiKey,
    isMinimal = false
}) => {
    if (isMinimal) {
        return (
            <div style={{
                maxWidth: 720,
                margin: '2rem auto',
                fontFamily: 'Inter, system-ui, sans-serif',
                padding: '0 1rem'
            }}>
                <h1>ping-crossmint</h1>
                <p>Configure your setup to get started</p>

                <div style={{ display: 'grid', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                            🔑 Crossmint Server API Key:
                        </label>
                        <input
                            type="password"
                            placeholder="sk_staging_..."
                            value={apiKey}
                            onChange={e => onUpdateApiKey(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '14px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontFamily: 'monospace'
                            }}
                        />
                        {apiKey && !apiKey.startsWith('sk_') && (
                            <div style={{ color: '#cc0000', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                ⚠️ Please use a server API key (starts with 'sk_')
                            </div>
                        )}
                    </div>

                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                            📧 Test Email:
                        </label>
                        <input
                            type="email"
                            placeholder="user@example.com"
                            value={config.testEmail}
                            onChange={e => onUpdateEmail(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '14px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                            ⛓️ Chain:
                        </label>
                        <select
                            value={config.chain}
                            onChange={e => onUpdateChain(e.target.value as SupportedChain)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '14px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        >
                            {SUPPORTED_CHAINS.map(chain => (
                                <option key={chain} value={chain}>{chain}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                            🌐 Server URL:
                        </label>
                        <input
                            type="url"
                            placeholder="http://localhost:3100"
                            value={config.serverUrl}
                            onChange={e => onUpdateServerUrl(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '14px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '14px' }}>
                        🔑 Crossmint Server API Key:
                    </label>
                    <input
                        type="password"
                        placeholder="sk_staging_..."
                        value={apiKey}
                        onChange={e => onUpdateApiKey(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '14px'
                        }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>
                            📧 Test Email:
                        </label>
                        <input
                            type="email"
                            placeholder="user@example.com"
                            value={config.testEmail}
                            onChange={e => onUpdateEmail(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px',
                                fontSize: '12px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>
                            ⛓️ Chain:
                        </label>
                        <select
                            value={config.chain}
                            onChange={e => onUpdateChain(e.target.value as SupportedChain)}
                            style={{
                                width: '100%',
                                padding: '6px',
                                fontSize: '12px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        >
                            {SUPPORTED_CHAINS.map(chain => (
                                <option key={chain} value={chain}>{chain}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>
                            🌐 Server URL:
                        </label>
                        <input
                            type="url"
                            placeholder="http://localhost:3100"
                            value={config.serverUrl}
                            onChange={e => onUpdateServerUrl(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px',
                                fontSize: '12px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};