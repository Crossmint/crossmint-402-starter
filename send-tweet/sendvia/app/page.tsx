'use client';

import { useState } from 'react';
import { A2AClient } from "@a2a-js/sdk/client";
import { v4 as uuidv4 } from "uuid";
import { JsonRpcProvider, Contract } from "ethers";
import { CrossmintWallets, createCrossmint, EVMWallet } from "@crossmint/wallets-sdk";

const X402_EXTENSION_URI = "https://github.com/google-a2a/a2a-x402/v0.1";
const X402_STATUS_KEY = "x402.payment.status";
const X402_REQUIRED_KEY = "x402.payment.required";
const X402_PAYLOAD_KEY = "x402.payment.payload";
const X402_RECEIPTS_KEY = "x402.payment.receipts";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const RPC_URLS: Record<string, string> = {
  "base-sepolia": "https://sepolia.base.org",
  "base": "https://mainnet.base.org",
};

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [serverUrl, setServerUrl] = useState('http://localhost:10001');
  const [tweetText, setTweetText] = useState('just a smol town gurlll, livin in a loooonelyyy world');
  const [imageUrl, setImageUrl] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [balances, setBalances] = useState<{
    userBalance: string;
    merchantBalance: string;
    network: string;
    tokenAddress: string;
    userAddress: string;
    merchantAddress: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const addLog = (m: string) => setLogs(prev => [...prev, `[${new Date().toISOString()}] ${m}`]);

  const fetchClient = async () => {
    const cardUrl = `${serverUrl}/.well-known/agent-card.json`;
    const fetchWithExtension = (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = { ...(init.headers || {}), "X-A2A-Extensions": X402_EXTENSION_URI };
      return fetch(input, { ...init, headers });
    };
    return A2AClient.fromCardUrl(cardUrl, { fetchImpl: fetchWithExtension });
  };

  const checkBalances = async () => {
    if (!apiKey || !userEmail) {
      addLog('Please enter Crossmint API key and user email');
      return;
    }
    setChecking(true);
    try {
      const client = await fetchClient();
      const params = {
        message: { messageId: uuidv4(), role: 'user' as const, parts: [{ kind: 'text' as const, text: 'balance-check' }], kind: 'message' as const },
        configuration: { blocking: true, acceptedOutputModes: ['text/plain'] },
      };
      const createdResp = await client.sendMessage(params) as any;
      const meta = createdResp?.result?.status?.message?.metadata || {};
      if (meta[X402_STATUS_KEY] !== 'payment-required') {
        addLog('No payment required.');
        return;
      }
      const selected = meta[X402_REQUIRED_KEY].accepts[0];
      const network = String(selected.network);
      const tokenAddress = String(selected.asset).toLowerCase();
      const merchantAddress = String(selected.payTo).toLowerCase();

      const crossmint = createCrossmint({ apiKey });
      const wallets = CrossmintWallets.from(crossmint);
      const cmWallet = await wallets.createWallet({ chain: network as any, signer: { type: 'api-key' as const }, owner: `email:${userEmail}` });
      const userAddress = cmWallet.address;

      const rpcUrl = RPC_URLS[network];
      if (!rpcUrl) throw new Error(`No RPC for ${network}`);
      const provider = new JsonRpcProvider(rpcUrl);
      const token = new Contract(tokenAddress, ERC20_ABI, provider);
      const [ub, mb, dRaw] = await Promise.all([token.balanceOf(userAddress), token.balanceOf(merchantAddress), token.decimals()]);
      const dec = Number(dRaw);
      const fmt = (v: bigint, decNum: number) => {
        const denom = BigInt(10) ** BigInt(decNum);
        const whole = v / denom; const frac = (v % denom).toString().padStart(decNum, '0').slice(0, 6).replace(/0+$/, '') || '0';
        return `${whole.toString()}.${frac}`;
      };
      setBalances({ userBalance: fmt(ub, dec), merchantBalance: fmt(mb, dec), network, tokenAddress, userAddress, merchantAddress });
      addLog('Balances updated');
    } catch (e: any) {
      addLog(`ERROR checking balances: ${e?.message || e}`);
    } finally {
      setChecking(false);
    }
  };

  const startPayment = async () => {
    if (!apiKey || !userEmail) {
      addLog('Please enter Crossmint API key and user email');
      return;
    }
    if (!tweetText.trim()) {
      addLog('Please enter tweet text');
      return;
    }
    setLoading(true);
    try {
      addLog('Starting flow...');
      const client = await fetchClient();
      const initial = {
        message: { messageId: uuidv4(), role: 'user' as const, parts: [{ kind: 'text' as const, text: tweetText.trim() }], kind: 'message' as const, metadata: imageUrl ? { imageUrl } : {} },
        configuration: { blocking: true, acceptedOutputModes: ['text/plain'] },
      };
      const created = await client.sendMessage(initial) as any;
      const createdTask = created?.result;
      const meta = createdTask?.status?.message?.metadata || {};
      if (meta[X402_STATUS_KEY] !== 'payment-required') {
        addLog('No payment required.');
        return;
      }
      const selected = meta[X402_REQUIRED_KEY].accepts[0];
      const network = String(selected.network);
      const asset = String(selected.asset).toLowerCase();
      const payTo = String(selected.payTo).toLowerCase();
      const amount = String(selected.maxAmountRequired);

      addLog('Initializing Crossmint wallet...');
      const crossmint = createCrossmint({ apiKey });
      const wallets = CrossmintWallets.from(crossmint);
      const cmWallet = await wallets.createWallet({ chain: network as any, signer: { type: 'api-key' as const }, owner: `email:${userEmail}` });
      const evmWallet = EVMWallet.from(cmWallet);

      addLog('Sending ERC-20 transfer...');
      const tx = await evmWallet.sendTransaction({
        abi: [
          { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] },
        ],
        to: asset,
        functionName: 'transfer',
        args: [payTo, amount],
      } as any);
      const txHash = (tx as any)?.hash as string;
      if (!txHash) throw new Error('No transaction hash');
      addLog(`Transfer submitted: ${txHash}`);

      const paymentPayload = {
        x402Version: 1,
        scheme: selected.scheme,
        network: selected.network,
        payload: { transaction: txHash, payer: cmWallet.address, asset, payTo, value: amount },
      };

      addLog('Submitting payment...');
      const submission = await client.sendMessage({
        message: { messageId: uuidv4(), taskId: createdTask.id, role: 'user' as const, parts: [{ kind: 'text' as const, text: 'Here is the payment authorization.' }], kind: 'message' as const, metadata: { [X402_STATUS_KEY]: 'payment-submitted', [X402_PAYLOAD_KEY]: paymentPayload } },
        configuration: { blocking: true, acceptedOutputModes: ['text/plain'] },
      }) as any;

      const finalMeta = submission?.result?.status?.message?.metadata || {};
      addLog(`Payment status: ${finalMeta[X402_STATUS_KEY] || 'unknown'}`);
      if (Array.isArray(finalMeta[X402_RECEIPTS_KEY])) addLog(`Receipt: ${JSON.stringify(finalMeta[X402_RECEIPTS_KEY][0])}`);
      addLog('Done.');
      setTimeout(() => checkBalances(), 2000);
    } catch (e: any) {
      addLog(`ERROR: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 840, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>sendvia</h1>
      <p>Crossmint Wallets x A2A x402 direct-transfer client for Tweet Agent</p>

      <div style={{ border: '1px solid #eee', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
        <h2>Configuration</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <input placeholder="Crossmint API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ padding: 8 }} />
          <input placeholder="User Email" type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} style={{ padding: 8 }} />
          <input placeholder="Server URL" value={serverUrl} onChange={e => setServerUrl(e.target.value)} style={{ padding: 8, gridColumn: '1 / span 2' }} />
        </div>
      </div>

      <div style={{ border: '1px solid #eee', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
        <h2>Tweet</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <textarea placeholder="Tweet text" value={tweetText} onChange={e => setTweetText(e.target.value)} rows={3} style={{ padding: 8 }} />
          <input placeholder="Image URL (optional)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} style={{ padding: 8 }} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
          <button onClick={startPayment} disabled={loading || !apiKey || !userEmail} style={{ padding: '8px 12px' }}>{loading ? 'Processing…' : 'Start Payment Flow'}</button>
          <button onClick={checkBalances} disabled={checking || !apiKey || !userEmail} style={{ padding: '8px 12px' }}>{checking ? 'Checking…' : 'Check USDC Balances'}</button>
        </div>
      </div>

      {balances && (
        <div style={{ border: '1px solid #eee', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
          <h2>USDC Balances</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Your Balance</div>
              <div>{balances.userBalance} USDC</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{balances.userAddress}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Merchant Balance</div>
              <div>{balances.merchantBalance} USDC</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{balances.merchantAddress}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
            Network: {balances.network} • Token: <span style={{ fontFamily: 'monospace' }}>{balances.tokenAddress}</span>
          </div>
        </div>
      )}

      <div style={{ border: '1px solid #eee', padding: '1rem', borderRadius: 8 }}>
        <h2>Logs</h2>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#fafafa', padding: 8, borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>{logs.join('\n')}</pre>
        <button onClick={() => setLogs([])} style={{ marginTop: 8, padding: '6px 10px' }}>Clear Logs</button>
      </div>
    </div>
  );
}


