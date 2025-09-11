import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { Wallet, hexlify, randomBytes, JsonRpcProvider } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const X402_EXTENSION_URI = 'https://github.com/google-a2a/a2a-x402/v0.1';
const X402_STATUS_KEY = 'x402.payment.status';
const X402_REQUIRED_KEY = 'x402.payment.required';
const X402_PAYLOAD_KEY = 'x402.payment.payload';
const X402_RECEIPTS_KEY = 'x402.payment.receipts';

function ensureProtocol(url) {
  if (!url) return 'http://localhost:10001';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

function getEnvConfig() {
  // Always use the production Joyce Puppet agent URL
  const agentUrl = 'https://joyce-puppet-production.up.railway.app';
  const rpcUrl = process.env.RPC_URL || '';
  const clientKey = process.env.CLIENT_PRIVATE_KEY || '';
  let payerAddress = '';
  try {
    if (clientKey) payerAddress = new Wallet(clientKey).address;
  } catch (e) {
    // ignore derivation errors here
  }
  return {
    agentUrl,
    cardUrl: `${agentUrl}/.well-known/agent-card.json`,
    rpcUrl,
    payerAddress,
  };
}

async function performJoyceFlow({ tweetText, imageUrl }) {
  const { agentUrl, cardUrl } = getEnvConfig();

  // Header for extension activation on every request
  const fetchWithExtension = (input, init = {}) => {
    const headers = { ...(init.headers || {}), 'X-A2A-Extensions': X402_EXTENSION_URI };
    return fetch(input, { ...init, headers });
  };

  const client = await A2AClient.fromCardUrl(cardUrl, { fetchImpl: fetchWithExtension });

  const initialParams = {
    message: {
      messageId: uuidv4(),
      role: 'user',
      parts: [{ kind: 'text', text: tweetText }],
      kind: 'message',
      metadata: imageUrl ? { imageUrl } : {},
    },
    configuration: { blocking: true, acceptedOutputModes: ['text/plain'] },
  };

  const createdResp = await client.sendMessage(initialParams);
  const createdTask = createdResp?.result;
  const createdMeta = createdTask?.status?.message?.metadata || {};

  if (createdMeta[X402_STATUS_KEY] !== 'payment-required') {
    return {
      createdTask,
      submission: null,
      infoFromAccept: null,
      statusText: createdTask?.status?.message?.parts?.[0]?.text || 'No payment required.',
    };
  }

  // Payment required path: sign EIP-3009 and submit
  const paymentRequired = createdMeta[X402_REQUIRED_KEY];
  const selected = paymentRequired.accepts[0];

  const payerKey = process.env.CLIENT_PRIVATE_KEY;
  if (!payerKey) {
    throw new Error('CLIENT_PRIVATE_KEY is required in .env');
  }
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC_URL is required in .env');
  }

  const net = await new JsonRpcProvider(rpcUrl).getNetwork();
  const chainId = Number(net.chainId);
  const wallet = new Wallet(payerKey);

  const asset = String(selected.asset).trim().toLowerCase();
  const payTo = String(selected.payTo).trim().toLowerCase();
  const nonce = hexlify(randomBytes(32));
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + (selected.maxTimeoutSeconds || 600);
  const serverDomain = selected.extra && selected.extra.domain;
  const domain = serverDomain && serverDomain.verifyingContract?.toLowerCase() === asset
    ? { ...serverDomain, chainId: Number(serverDomain.chainId) }
    : {
        name: 'USD Coin',
        version: '2',
        chainId,
        verifyingContract: asset,
      };

  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };
  const message = {
    from: wallet.address,
    to: payTo,
    value: selected.maxAmountRequired,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await wallet.signTypedData(domain, types, message);
  const paymentPayload = {
    x402Version: 1,
    scheme: selected.scheme,
    network: selected.network,
    payload: {
      from: message.from,
      payTo: message.to,
      asset,
      value: message.value,
      validAfter: message.validAfter,
      validBefore: message.validBefore,
      nonce: message.nonce,
      signature,
    },
  };

  const submissionResp = await client.sendMessage({
    message: {
      messageId: uuidv4(),
      taskId: createdTask.id,
      role: 'user',
      parts: [{ kind: 'text', text: 'Here is the payment authorization.' }],
      kind: 'message',
      metadata: {
        [X402_STATUS_KEY]: 'payment-submitted',
        [X402_PAYLOAD_KEY]: paymentPayload,
      },
    },
    configuration: { blocking: true, acceptedOutputModes: ['text/plain'] },
  });

  const submission = submissionResp?.result;
  const finalMeta = submission?.status?.message?.metadata || {};

  return {
    createdTask,
    submission,
    infoFromAccept: {
      asset: selected.asset,
      payTo: selected.payTo,
      maxAmountRequired: selected.maxAmountRequired,
      network: selected.network,
      domain,
      chainId,
    },
    statusText: submission?.status?.message?.parts?.[0]?.text || '',
    paymentStatus: finalMeta[X402_STATUS_KEY] || createdMeta[X402_STATUS_KEY],
    receipts: Array.isArray(finalMeta[X402_RECEIPTS_KEY]) ? finalMeta[X402_RECEIPTS_KEY] : [],
  };
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (frontend)
app.use('/', express.static(path.join(__dirname, 'public')));

// Info endpoint for UI
app.get('/api/info', async (req, res) => {
  const base = getEnvConfig();
  let chainId = null;
  try {
    if (base.rpcUrl) {
      const net = await new JsonRpcProvider(base.rpcUrl).getNetwork();
      chainId = Number(net.chainId);
    }
  } catch (e) {
    // ignore
  }
  res.json({
    ...base,
    chainId,
  });
});

// Submit tweet request
app.post('/api/submit', async (req, res) => {
  try {
    const { text, imageUrl } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Tweet text is required' });
    }
    const result = await performJoyceFlow({ tweetText: text.trim(), imageUrl: (imageUrl || '').trim() || undefined });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

const port = process.env.JOYCE_PORT || 10002;
app.listen(port, () => {
  const { agentUrl, cardUrl, rpcUrl, payerAddress } = getEnvConfig();
  console.log(`[joyce-puppet] listening on http://localhost:${port}`);
  console.log('[joyce-puppet] Agent URL:', agentUrl);
  console.log('[joyce-puppet] Card URL:', cardUrl);
  console.log('[joyce-puppet] RPC URL:', rpcUrl || '(not set)');
  console.log('[joyce-puppet] Payer Address:', payerAddress || '(not set)');
});


