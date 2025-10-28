import { ethers } from 'ethers';

// 🔧 CONFIGURATION - MODIFY THESE VALUES 👇
const CONFIG = {
  // Your private key (replace with your actual private key)
  PRIVATE_KEY: "<YOUR_PRIVATE_KEY>",
  
  // Paste the 402 response payload here (the entire JSON response from the API)
  // This should be the response from POST /api/orders without X-PAYMENT header
  PAYLOAD_402: {
    "x402Version": 1,
    "error": "X-PAYMENT header is required",
    "accepts": [
      {
        "scheme": "exact",
        "network": "ethereum-sepolia",
        "maxAmountRequired": "1800000",
        "resource": "/api/orders",
        "description": "Product purchase via Crossmint",
        "mimeType": "application/json",
        "payTo": "0x462A377C745451B0FA24F5DCC13094D0b6BBfb87",
        "maxTimeoutSeconds": 3600,
        "asset": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        "extra": {
          "name": "USDC",
          "version": "2",
          "orderId": "cm_order_abc123"
        }
      }
    ]
  }
};

// Network configuration (auto-detected from payload)
const NETWORKS = {
  // Testnets
  'ethereum-sepolia': {
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com'
  },
  'base-sepolia': {
    chainId: 84532,
    rpcUrl: 'https://base-sepolia-rpc.publicnode.com'
  },
  'polygon-mumbai': {
    chainId: 80001,
    rpcUrl: 'https://polygon-mumbai-rpc.publicnode.com'
  },
  'arbitrum-sepolia': {
    chainId: 421614,
    rpcUrl: 'https://arbitrum-sepolia-rpc.publicnode.com'
  },
  // Mainnets
  'ethereum': {
    chainId: 1,
    rpcUrl: 'https://ethereum.publicnode.com'
  },
  'polygon': {
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com'
  },
  'base': {
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org'
  },
  'arbitrum': {
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc'
  }
};

/**
 * Generate a payment header for x402 protocol
 * @returns {Promise<string>} Base64 encoded payment header
 */
async function generatePaymentHeader() {
  try {
    // Handle both old and new response formats
    let paymentRequirements;
    
    if (CONFIG.PAYLOAD_402.accepts && CONFIG.PAYLOAD_402.accepts[0]) {
      // New format (our custom implementation)
      paymentRequirements = CONFIG.PAYLOAD_402.accepts[0];
    } else if (CONFIG.PAYLOAD_402.paymentRequirements) {
      // Old format (original x402)
      paymentRequirements = CONFIG.PAYLOAD_402.paymentRequirements;
    } else {
      throw new Error('Invalid payload format: missing paymentRequirements or accepts array');
    }
    
    // Validate required fields in payload
    const requiredFields = ['network', 'maxAmountRequired', 'payTo', 'asset', 'scheme'];
    for (const field of requiredFields) {
      if (!paymentRequirements[field]) {
        throw new Error(`Invalid payload: missing ${field} in paymentRequirements`);
      }
    }
    
    // Get network configuration
    const network = NETWORKS[paymentRequirements.network];
    if (!network) {
      throw new Error(`Unsupported network: ${paymentRequirements.network}. Supported networks: ${Object.keys(NETWORKS).join(', ')}`);
    }

    // Connect to provider
    const provider = new ethers.JsonRpcProvider(network.rpcUrl);
    const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    const userAddress = await signer.getAddress();
    
    // Query contract for name and version
    const usdcContract = new ethers.Contract(paymentRequirements.asset, [
      'function name() view returns (string)',
      'function version() view returns (string)'
    ], provider);
    
    let contractName = "USDC";
    let contractVersion = "2";
    
    try {
      contractName = await usdcContract.name();
      contractVersion = await usdcContract.version();
    } catch (error) {
      // Use defaults
    }
    
    // Create EIP-712 domain with actual contract details
    const domain = {
      name: contractName,
      version: contractVersion,
      chainId: network.chainId,
      verifyingContract: paymentRequirements.asset
    };
    
    // Generate a proper 32-byte nonce as hex string
    const nonceBytes = ethers.randomBytes(32);
    const nonceHex = ethers.hexlify(nonceBytes);
    
    // Create authorization message with proper timing and data types
    const now = Math.floor(Date.now() / 1000);
    const authorization = {
      from: userAddress,
      to: paymentRequirements.payTo,  
      value: ethers.toBigInt(paymentRequirements.maxAmountRequired),
      validAfter: ethers.toBigInt(0),
      validBefore: ethers.toBigInt(now + (paymentRequirements.maxTimeoutSeconds || 3600)),
      nonce: nonceHex
    };
    
    // EIP-712 types for USDC transferWithAuthorization
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" }
      ]
    };
    
    // Sign the authorization using EIP-712
    const signature = await signer.signTypedData(domain, types, authorization);
    
    // Create PaymentPayload with proper structure matching the orders route expectations
    const paymentPayload = {
      x402Version: 1,
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      payload: {
        signature: signature,
        authorization: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value.toString(),
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
          nonce: authorization.nonce
        }
      },
      extra: {
        orderId: paymentRequirements.extra?.orderId
      }
    };
    
    // Generate base64 header
    const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
    
    // Output only the base64 string
    console.log(paymentHeader);
    
    return paymentHeader;
    
  } catch (error) {
    // Only print error message
    console.error(error.message);
    process.exit(1);
  }
}

// Run the script
generatePaymentHeader(); 