require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    debug: process.env.DEBUG === 'true'
  },
  
  crossmint: {
    apiKey: process.env.CROSSMINT_API_KEY,
    environment: process.env.CROSSMINT_ENVIRONMENT,
    get baseUrl() {
      if (!this.environment) {
        throw new Error('CROSSMINT_ENVIRONMENT must be set to "staging" or "production"');
      }
      if (this.environment === 'production') {
        return 'https://www.crossmint.com/';
      } else if (this.environment === 'staging') {
        return 'https://staging.crossmint.com/';
      } else {
        throw new Error(`Invalid CROSSMINT_ENVIRONMENT: "${this.environment}". Must be "staging" or "production"`);
      }
    },
    walletAddress: process.env.CROSSMINT_WALLET_ADDRESS,
    walletLocator: process.env.CROSSMINT_WALLET_LOCATOR
  },
  
  x402: {
    // Order settings
    orderFeePercentage: parseFloat(process.env.ORDER_FEE_PERCENTAGE) || 0,
    orderPaymentTimeoutMinutes: parseInt(process.env.ORDER_PAYMENT_TIMEOUT_MINUTES) || 10,
    
    // Custom middleware currencies (comma-separated list, e.g., "usdc,eth")
    get customMiddlewareCurrencies() {
      if (!process.env.CUSTOM_MIDDLEWARE_CURRENCIES) {
        return ['usdc']; // Default to USDC only
      }
      return process.env.CUSTOM_MIDDLEWARE_CURRENCIES.split(',').map(c => c.trim().toLowerCase());
    },
    
    // Custom middleware networks (comma-separated list, e.g., "ethereum-sepolia,base-sepolia")
    get customMiddlewareNetworks() {
      if (!process.env.CUSTOM_MIDDLEWARE_NETWORKS) {
        return ['ethereum-sepolia', 'base-sepolia']; // Default networks
      }
      return process.env.CUSTOM_MIDDLEWARE_NETWORKS.split(',').map(n => n.trim().toLowerCase());
    },
    
    // Get all supported networks based on configuration
    get supportedNetworks() {
      return this.customMiddlewareNetworks;
    },
    
    // Get all supported currencies based on configuration
    get supportedCurrencies() {
      return this.customMiddlewareCurrencies;
    },
    
    // Get default network (first in the list)
    get defaultNetwork() {
      return this.supportedNetworks[0];
    },
    
    // Contract addresses by network and currency
    getContractAddress(chain, currency = 'usdc') {
      const contracts = {
        // USDC addresses
        'usdc': {
          // Testnet addresses
          'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
          'base-sepolia': '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
          'polygon-mumbai': '0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747',
          'arbitrum-sepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
          
          // Production addresses
          'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          'polygon': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          'arbitrum': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
        }
      };
      
      const currencyContracts = contracts[currency.toLowerCase()];
      if (!currencyContracts) {
        throw new Error(`Currency "${currency}" is not supported or not configured`);
      }
      
      const contractAddress = currencyContracts[chain.toLowerCase()];
      if (contractAddress === undefined) {
        throw new Error(`Chain "${chain}" is not supported for currency "${currency}"`);
      }
      
      return contractAddress;
    },
    

    
    // Validation methods
    isSupportedCurrency(currency) {
      return this.supportedCurrencies.includes(currency.toLowerCase());
    },
    
    isSupportedNetwork(network) {
      return this.supportedNetworks.includes(network.toLowerCase());
    }
  }
};

// Validate required config
const requiredConfig = [
  'crossmint.apiKey',
  'crossmint.walletAddress',
  'crossmint.walletLocator'
];

requiredConfig.forEach(path => {
  const value = path.split('.').reduce((obj, key) => obj?.[key], config);
  if (!value) {
    console.error(`Missing required configuration: ${path}`);
    process.exit(1);
  }
});

// Validate custom middleware networks
const allSupportedNetworks = [
  'ethereum-sepolia', 'base-sepolia', 'polygon-mumbai', 'arbitrum-sepolia',
  'ethereum', 'polygon', 'base', 'arbitrum'
];

config.x402.customMiddlewareNetworks.forEach(network => {
  if (!allSupportedNetworks.includes(network)) {
    console.error(`❌ Unsupported network in CUSTOM_MIDDLEWARE_NETWORKS: "${network}"`);
    console.error(`Supported networks: ${allSupportedNetworks.join(', ')}`);
    process.exit(1);
  }
});

// Validate custom middleware currencies
const allSupportedCurrencies = ['usdc', 'eth', 'usdt'];

config.x402.customMiddlewareCurrencies.forEach(currency => {
  if (!allSupportedCurrencies.includes(currency)) {
    console.error(`❌ Unsupported currency in CUSTOM_MIDDLEWARE_CURRENCIES: "${currency}"`);
    console.error(`Supported currencies: ${allSupportedCurrencies.join(', ')}`);
    process.exit(1);
  }
});

// Log configuration summary
console.log('🔧 x402 Configuration Summary:');
console.log(`   Networks: ${config.x402.supportedNetworks.join(', ')}`);
console.log(`   Currencies: ${config.x402.supportedCurrencies.join(', ')}`);
console.log('');

module.exports = config; 