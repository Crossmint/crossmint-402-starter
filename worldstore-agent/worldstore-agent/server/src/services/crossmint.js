const axios = require('axios');
const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * CrossmintService - Crossmint Worldstore API Integration
 * 
 * Handles order creation, payment processing, and refund management.
 * Supports both EVM MPC and Smart wallet types with automatic detection.
 */
class CrossmintService {
  constructor() {
    this.apiKey = config.crossmint.apiKey;
    this.baseUrl = config.crossmint.baseUrl;
    this.walletAddress = config.crossmint.walletAddress.toLowerCase();
    this.walletLocator = config.crossmint.walletLocator;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Determine if wallet is EVM MPC or Smart Wallet
   * EVM MPC wallets use 'call' (singular), Smart wallets use 'calls' (plural)
   * @returns {boolean} true if EVM MPC wallet (use 'call'), false if Smart wallet (use 'calls')
   */
  isEvmMpcWallet() {
    // EVM MPC wallet locators typically have format like "evm-mpc-wallet:..." 
    // or contain "mpc" in the identifier
    // Smart wallet locators typically have different formats
    
    // Check if walletLocator indicates MPC wallet
    if (this.walletLocator.includes('mpc') || this.walletLocator.includes('evm-mpc')) {
      return true;
    }
    

    
    return false;
  }





  /**
   * Create an order with Crossmint Worldstore
   * @param {string} productLocator - Product locator (e.g., 'amazon:B08N5WRWNW', 'amazon:https://www.amazon.com/dp/B01DFKC2SO', 'shopify:https://www.gymshark.com/products/gymshark-arrival-5-shorts-black-ss22:39786362601674')
   * @param {string} payerAddress - User's wallet address (can be temp for initial order)
   * @param {number} totalAmount - Total amount in USDC (not used, Crossmint determines pricing)
   * @param {Object} physicalAddress - Required shipping address
   * @param {string} chain - Blockchain chain (e.g., 'ethereum-sepolia', 'base-sepolia')
   * @param {string} currency - Payment currency (e.g., 'usdc', 'eth')
   * @param {string} email - Recipient email address
   * @returns {Object} Order response from Crossmint
   */
  async createOrder(productLocator, payerAddress, totalAmount, physicalAddress, chain = null, currency = null, email = null) {
    // Use provided chain/currency or fall back to config
    const finalChain = chain || 'ethereum-sepolia'; // Default fallback
    const finalCurrency = currency || 'usdc'; // Default fallback

    // Validate chain and currency
    if (!finalChain) {
      throw new Error('Chain not provided in request and X402_CHAIN environment variable not set');
    }
    if (!finalCurrency) {
      throw new Error('Currency not provided in request and X402_CURRENCY environment variable not set');
    }

    // Validate required fields
    if (!physicalAddress) {
      throw new Error('Physical address is required');
    }
    if (!email) {
      throw new Error('Email address is required');
    }

    logger.info(`Creating Crossmint order for product: ${productLocator}`, null, {
      chain: finalChain,
      currency: finalCurrency,
      payerAddress: payerAddress.toLowerCase(),
      email: email,
      shippingAddress: `${physicalAddress.name}, ${physicalAddress.city}, ${physicalAddress.country}`
    });

    const orderData = {
      recipient: {
        email: email,
        physicalAddress: physicalAddress
      },
      payment: {
        method: finalChain,
        currency: finalCurrency,
        payerAddress: config.crossmint.walletAddress
      },
      lineItems: [
        {
          productLocator: productLocator
        }
      ]
    };

    try {
      const response = await this.client.post('/api/2022-06-09/orders', orderData);
      
      logger.success(`Crossmint order created successfully`, null, {
        orderId: response.data?.order?.orderId,
        status: response.status
      });
      
      return response.data;
    } catch (error) {
      logger.error('Crossmint order creation failed', null, error);
      
      // Handle specific Crossmint API errors
      if (error.response?.status === 400) {
        throw new Error(`Invalid request: ${error.response.data?.message || 'Bad request'}`);
      } else if (error.response?.status === 401) {
        throw new Error('Authentication failed: Check your Crossmint API key');
      } else if (error.response?.status === 403) {
        throw new Error('Access denied: Insufficient permissions for this operation');
      } else if (error.response?.status === 404) {
        throw new Error('Resource not found: Invalid endpoint or resource');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded: Too many requests');
      } else if (error.response?.status >= 500) {
        throw new Error('Crossmint service error: Please try again later');
      } else {
        throw new Error(`Failed to create Crossmint order: ${error.response?.data?.message || error.message}`);
      }
    }
  }

  /**
   * Get order status by ID
   * @param {string} orderId - Crossmint order ID
   * @returns {Object} Order status from Crossmint
   */
  async getOrderStatus(orderId) {
    try {
      const response = await this.client.get(`/api/2022-06-09/orders/${orderId}`);
      
      logger.debug(`Crossmint order status response`, orderId, {
        fullResponse: response.data,
        status: response.status,
        headers: response.headers
      });
      
      logger.debug(`Order status retrieved`, orderId, {
        status: response.data?.order?.payment?.status,
        phase: response.data?.order?.phase
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get order status', orderId, error);
      
      if (error.response?.status === 404) {
        throw new Error(`Order not found: ${orderId}`);
      } else if (error.response?.status === 401) {
        throw new Error('Authentication failed: Check your Crossmint API key');
      } else {
        throw new Error(`Failed to get order status: ${error.response?.data?.message || error.message}`);
      }
    }
  }



  /**
   * Execute the payment transaction through Crossmint wallet using REST API
   * @param {string} serializedTransaction - The transaction from the order quote
   * @param {string} orderId - The order ID to use as idempotency key
   * @param {string} chain - The blockchain chain for this order
   * @returns {Object} Transaction response
   */
  async executePayment(serializedTransaction, orderId, chain) {
    try {
      const executeChain = chain || 'ethereum-sepolia'; // Default fallback
      const isEvmMpc = this.isEvmMpcWallet();
      
      logger.info(`Executing outbound transaction`, orderId, {
        walletType: isEvmMpc ? 'EVM MPC' : 'Smart Wallet',
        chain: executeChain,
        txLength: serializedTransaction.length
      });

      // For EVM MPC wallets, we need to decode the serialized transaction to get 'to' and 'data'
      // For Smart wallets, we can use the serialized transaction directly
      let call;
      
      if (isEvmMpc) {
        try {
          const rawTx = serializedTransaction.startsWith('0x') ? serializedTransaction : '0x' + serializedTransaction;
          const tx = ethers.Transaction.from(rawTx);
          
          call = {
            to: tx.to,
            data: tx.data
          };
          
          logger.debug('Decoded serialized transaction for EVM MPC', orderId, {
            to: tx.to,
            dataLength: tx.data.length
          });
        } catch (decodeError) {
          logger.error('Failed to decode serialized transaction for EVM MPC', orderId, decodeError);
          throw new Error(`Failed to decode transaction for EVM MPC wallet: ${decodeError.message}`);
        }
      } else {
        // Smart wallets use the serialized transaction directly
        call = {
          transaction: serializedTransaction
        };
      }
      
      const transactionData = {
        params: {
          chain: executeChain,
          ...(isEvmMpc ? { call: call } : { calls: [call] })
        }
      };

      logger.debug('Transaction data prepared', orderId, {
        walletType: isEvmMpc ? 'EVM MPC' : 'Smart Wallet',
        callStructure: isEvmMpc ? 'call' : 'calls',
        callFormat: isEvmMpc ? 'to+data' : 'transaction',
        toAddress: isEvmMpc ? call.to : 'N/A'
      });

      const response = await this.client.post(
        `/api/2022-06-09/wallets/${this.walletLocator}/transactions`,
        transactionData,
        {
          headers: {
            'x-idempotency-key': orderId
          }
        }
      );

      logger.debug(`Crossmint outbound transaction response`, orderId, {
        fullResponse: response.data,
        status: response.status,
        headers: response.headers
      });

      logger.success(`Transaction executed successfully`, orderId, {
        transactionHash: response.data?.transactionHash,
        status: response.data?.status
      });
      
      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      logger.error('Payment execution failed', orderId, error);
      
      // Handle specific transaction execution errors
      if (error.response?.status === 400) {
        throw new Error(`Invalid transaction: ${error.response.data?.message || 'Bad request'}`);
      } else if (error.response?.status === 409) {
        throw new Error('Transaction already exists (idempotency)');
      } else if (error.response?.status === 422) {
        throw new Error(`Transaction failed: ${error.response.data?.message || 'Execution reverted'}`);
      } else {
        throw new Error(`Payment execution failed: ${error.response?.data?.message || error.message}`);
      }
    }
  }



  /**
   * Execute EIP-3009 transferWithAuthorization to pull money from user's wallet
   * Note: Memos are not supported for EIP-3009 transfers because they use ABI-encoded function calls
   * @param {Object} authorization - The signed authorization from the user
   * @param {string} signature - The user's signature
   * @param {string} network - Network (ethereum-sepolia, etc.)
   * @param {string} contractAddress - Contract address (null for native tokens like ETH)
   * @param {string} orderId - Order ID for idempotency
   * @returns {Object} Transaction result
   */
  async executeTransferWithAuthorization(authorization, signature, network, contractAddress, orderId) {
    try {
      logger.info(`Executing EIP-3009 transferWithAuthorization`, orderId, {
        amount: authorization.value,
        from: authorization.from,
        to: authorization.to,
        network: network
      });
      
      // Parse signature components correctly for USDC 
      const cleanSig = signature.startsWith('0x') ? signature.slice(2) : signature;
      const r = '0x' + cleanSig.slice(0, 64);
      const s = '0x' + cleanSig.slice(64, 128);
      let v = parseInt(cleanSig.slice(128, 130), 16);
      
      // Ensure v is in the correct format for USDC (27 or 28, not chain-adjusted)
      if (v >= 27) {
        // Already in correct format
      } else if (v === 0 || v === 1) {
        v = v + 27; // Convert to 27/28 format
      } else {
        // Chain-adjusted format, convert back to 27/28
        v = ((v - 35) % 2) + 27;
      }
      
      // Check if this is a native token (like ETH) that doesn't need EIP-3009
      if (!contractAddress) {
        logger.info(`Native token transfer detected (no contract needed)`, orderId, {
          amount: authorization.value,
          from: authorization.from,
          to: authorization.to
        });
        
        // For native tokens, we would need a different approach
        // For now, throw an error as native token support is not fully implemented
        throw new Error('Native token transfers (ETH) are not yet supported. Please use USDC.');
      }
      
      // Build transferWithAuthorization call data for ERC20 tokens
      const iface = new ethers.Interface([
        "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)"
      ]);
      
      const callData = iface.encodeFunctionData("transferWithAuthorization", [
        authorization.from,
        authorization.to,
        ethers.toBigInt(authorization.value),
        ethers.toBigInt(authorization.validAfter || 0),
        ethers.toBigInt(authorization.validBefore),
        authorization.nonce,
        v,
        r,
        s
      ]);
      
      // Execute via Crossmint transaction API
      const isEvmMpc = this.isEvmMpcWallet();
      
      const call = isEvmMpc ? {
        to: contractAddress,
        data: callData
      } : {
        to: contractAddress,
        value: "0",
        data: callData
      };
      
      const transactionData = {
        params: {
          chain: network,
          ...(isEvmMpc ? { call: call } : { calls: [call] })
        }
      };
      
      const response = await this.client.post(
        `/api/2022-06-09/wallets/${this.walletLocator}/transactions`,
        transactionData,
        {
          headers: {
            'x-idempotency-key': `${orderId}-inbound`
          }
        }
      );
      
      logger.debug(`Crossmint transfer response`, orderId, {
        fullResponse: response.data,
        status: response.status,
        headers: response.headers
      });
      
      logger.success(`EIP-3009 transfer executed successfully`, orderId, {
        transactionHash: response.data.transactionHash,
        amountTransferred: authorization.value
      });
      
      return {
        success: true,
        transactionHash: response.data.transactionHash,
        data: response.data,
        amountTransferred: authorization.value,
        from: authorization.from,
        to: authorization.to
      };
      
    } catch (error) {
      logger.error('EIP-3009 transfer execution failed', orderId, error);
      
      // Handle specific EIP-3009 errors
      if (error.response?.status === 422) {
        throw new Error(`EIP-3009 execution reverted: ${error.response.data?.message || 'Authorization may be invalid or expired'}`);
      } else if (error.response?.status === 409) {
        throw new Error('EIP-3009 transfer already executed (idempotency)');
      } else {
        throw new Error(`Transfer execution failed: ${error.response?.data?.message || error.message}`);
      }
    }
  }


}

module.exports = new CrossmintService(); 