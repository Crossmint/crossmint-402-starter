import { useState } from 'react';
import { CrossmintProvider, CrossmintAuthProvider, CrossmintWalletProvider } from '@crossmint/client-sdk-react-ui';
import { CrossmintPing } from './CrossmintPing';

export function App() {
  const [apiKey, setApiKey] = useState('');

  // Don't render providers until we have a valid API key
  if (!apiKey.startsWith('sk_')) {
    return <CrossmintPing apiKey={apiKey} setApiKey={setApiKey} />;
  }

  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintAuthProvider>
        <CrossmintWalletProvider createOnLogin={{ chain: 'base-sepolia' as any, signer: { type: 'email' } }}>
          <CrossmintPing apiKey={apiKey} setApiKey={setApiKey} />
        </CrossmintWalletProvider>
      </CrossmintAuthProvider>
    </CrossmintProvider>
  );
}


