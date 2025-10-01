# Agentic Finance & Crossmint

1. [`ping`](./ping/): Minimal Express TypeScript server with x402 paywall. Query `/ping` -> receive 402 -> prepare signature -> receive `pong`
2. [`weather`](./weather/): Minimal Express TypeScript server with x402 paywall. Query `/weather?city=CITY` -> receive 402 -> prepare signature -> receive weather of the city
3. [`hello-eoa`](./hello-eoa-a2a/): Minimal merchant/client example using the official A2A JS SDK with the x402 payments extension.Client signs an EIP‑3009 authorization; server verifies and settles on-chain.
4. [`hello-crossmint-wallets`](./hello-crossmint-wallets-a2a/): A complete **Agent-to-Agent (A2A)** payment demo using the **x402 payments extension** and **Crossmint Wallets SDK** in a React Web interface
5. [`send-tweet`](./send-tweet-a2a/): A2A agent that sends tweets on X/Twitter for payment using the x402 payments extension. Client pays in USDC, server posts their tweet with optional image attachment.
