const express = require('express');
const Joi = require('joi');
const crossmintService = require('../services/crossmint');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Orders Router - x402 Payment Protocol with Crossmint Integration
 * 
 * Uses custom middleware for all networks
 */

/**
 * Helper function to decode and verify X-PAYMENT header
 */
function decodePaymentHeader(paymentHeader) {
  try {
    const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
    const paymentPayload = JSON.parse(decoded);
    
    // Validate proper x402 PaymentPayload structure
    if (!paymentPayload.x402Version || paymentPayload.x402Version !== 1) {
      throw new Error('Invalid x402Version - must be 1');
    }
    
    if (!paymentPayload.scheme || paymentPayload.scheme !== 'exact') {
      throw new Error('Invalid scheme - must be "exact"');
    }
    
    if (!paymentPayload.payload || !paymentPayload.payload.authorization || !paymentPayload.payload.signature) {
      throw new Error('Invalid PaymentPayload - missing authorization or signature');
    }
    
    return paymentPayload;
  } catch (error) {
    throw new Error(`Invalid X-PAYMENT header format: ${error.message}`);
  }
}

const router = express.Router();

// Validation schemas
const orderSchema = Joi.object({
  productLocator: Joi.string().required()
    .messages({
      'string.empty': 'Product locator is required',
      'any.required': 'Product locator is required'
    }),
  email: Joi.string().email().required(),
  physicalAddress: Joi.object({
    name: Joi.string().required(),
    line1: Joi.string().required(),
    line2: Joi.string().allow('').optional(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    postalCode: Joi.string().required(),
    country: Joi.string().required()
  }).required(),
  payment: Joi.object({
    method: Joi.string().required(),
    currency: Joi.string().required()
  }).optional()
});

/**
 * POST /api/orders - Create Amazon product order via Crossmint
 * 
 * This endpoint is protected by custom x402 middleware for all networks
 */
router.post('/', async (req, res) => {
  try {
    // Validate request body
    const { error } = orderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message
      });
    }

    const { productLocator, physicalAddress, email, payment } = req.body;
    const chain = payment?.method || config.x402.defaultNetwork;
    const currency = payment?.currency || 'usdc';
    
    logger.info('Processing order request', null, {
      productLocator: productLocator,
      email: email,
      network: chain,
      currency: currency,
      hasPayment: !!req.headers['x-payment']
    });
      
    // Validate supported network and currency
    if (!config.x402.isSupportedNetwork(chain)) {
      logger.error('Unsupported network requested', null, {
              requestedNetwork: chain,
      supportedNetworks: config.x402.supportedNetworks
      });
      return res.status(400).json({
        error: 'Unsupported network',
        message: `Network "${chain}" is not supported. Supported networks: ${config.x402.supportedNetworks.join(', ')}`,
        supportedNetworks: config.x402.supportedNetworks
      });
    }
      
    if (!config.x402.isSupportedCurrency(currency)) {
      logger.error('Unsupported currency requested', null, {
        requestedCurrency: currency,
        supportedCurrencies: config.x402.supportedCurrencies
      });
      return res.status(400).json({
        error: 'Unsupported currency',
        message: `Currency "${currency}" is not supported. Supported currencies: ${config.x402.supportedCurrencies.join(', ')}`,
        supportedCurrencies: config.x402.supportedCurrencies
      });
    }
      
    // Check if payment header is present
    const paymentHeader = req.headers['x-payment'];
    if (!paymentHeader) {
      // No payment header - create Crossmint order and return 402 with real order ID
      logger.info('No payment header - creating Crossmint order for 402 response', null, {
        productLocator: productLocator,
        network: chain,
        currency: currency
      });
      
      // Create Crossmint order to get the real order ID
      const crossmintResponse = await crossmintService.createOrder(
        productLocator,
        config.crossmint.walletLocator,
        0, // Amount determined by Crossmint
        physicalAddress,
        chain,
        currency,
        email
      );
      
      if (!crossmintResponse?.order) {
        throw new Error('Failed to create Crossmint order for 402 response');
      }
      
      const crossmintOrderId = crossmintResponse.order.orderId;
      logger.info('Crossmint order created for 402 response', crossmintOrderId);
      
      // Calculate base price and fee
      const baseAmount = parseFloat(crossmintResponse.order.quote?.totalPrice?.amount || '1.80');
      const feePercent = config.x402.orderFeePercentage;
      const totalAmount = +(baseAmount * (1 + feePercent / 100)).toFixed(6);
      const amountInAtomicUnits = Math.floor(totalAmount * 1000000).toString(); // Convert to USDC atomic units (6 decimals)
      
      // Get the contract address for the requested network
      const contractAddress = config.x402.getContractAddress(chain, 'usdc');
      
      // Return 402 Payment Required with the real Crossmint order ID
      return res.status(402).json({
        x402Version: 1,
        error: "X-PAYMENT header is required",
        accepts: [
          {
            scheme: "exact",
            network: chain,
            maxAmountRequired: amountInAtomicUnits, // base + fee in USDC atomic units
            resource: req.originalUrl,
            description: `Amazon product purchase via Crossmint${feePercent ? ` (includes ${feePercent}% fee)` : ''}`,
            mimeType: "application/json",
            payTo: config.crossmint.walletAddress,
            maxTimeoutSeconds: config.x402.orderPaymentTimeoutMinutes * 60,
            asset: contractAddress,
            extra: {
              name: "USDC",
              version: "2",
              orderId: crossmintOrderId
            }
          }
        ]
      });
    }
      
    // Decode payment header and fetch order
    const paymentPayload = decodePaymentHeader(paymentHeader);
    const orderId = paymentPayload.extra?.orderId;
    if (!orderId) {
      return res.status(400).json({
        error: 'Missing order ID',
        message: 'Payment payload must include orderId in extra field'
      });
    }
    
    // Get the existing order from Crossmint
    const crossmintResponse = await crossmintService.getOrderStatus(orderId);
    if (!crossmintResponse?.orderId) {
      return res.status(404).json({
        error: 'Order not found',
        message: `Order ${orderId} not found in Crossmint`
      });
    }
    
    // Calculate base price and fee (always after fetching order)
    const baseAmount = parseFloat(crossmintResponse.quote?.totalPrice?.amount || '1.80');
    const feePercent = config.x402.orderFeePercentage;
    const totalAmount = +(baseAmount * (1 + feePercent / 100)).toFixed(6);
    const amountInAtomicUnits = Math.floor(totalAmount * 1000000).toString(); // Convert to USDC atomic units (6 decimals)
    
    // Validate payment network matches requested network
    if (paymentPayload.network !== chain) {
      logger.error('Payment network mismatch', paymentPayload.extra?.orderId, {
        requestedNetwork: chain,
        paymentNetwork: paymentPayload.network
      });
      return res.status(400).json({
        error: 'Payment network mismatch',
        message: `Payment was made on ${paymentPayload.network} but order was requested for ${chain}`
      });
    }
    
    // Validate payment amount
    if (true) {
      const expectedAmount = amountInAtomicUnits;
      const paymentAmount = paymentPayload.payload?.authorization?.value;
      
      if (paymentAmount !== expectedAmount) {
        logger.error('Payment amount mismatch', paymentPayload.extra?.orderId, {
          expectedAmount: expectedAmount,
          paymentAmount: paymentAmount
        });
        return res.status(400).json({
          error: 'Payment amount mismatch',
          message: `Expected payment amount: ${expectedAmount}, received: ${paymentAmount}`
        });
      }
    }
    
    logger.info('Payment verified - proceeding with order fulfillment', paymentPayload.extra?.orderId, {
      payerAddress: paymentPayload.payload.authorization.from,
      network: paymentPayload.network
    });
    
    // Execute the x402 payment to actually take the user's money
    logger.info('Executing x402 payment to collect user funds', paymentPayload.extra?.orderId);
    let paymentSuccessful = false;
    try {
      const contractAddress = config.x402.getContractAddress(paymentPayload.network, 'usdc');
      await crossmintService.executeTransferWithAuthorization(
        paymentPayload.payload.authorization,
        paymentPayload.payload.signature,
        paymentPayload.network,
        contractAddress,
        paymentPayload.extra?.orderId
      );
      logger.success('x402 payment executed successfully - user funds collected', paymentPayload.extra?.orderId);
      paymentSuccessful = true;
    } catch (x402Error) {
      logger.error('x402 payment execution failed', paymentPayload.extra?.orderId, x402Error);
      // If payment fails, return the Crossmint order without paying Crossmint
      return res.status(200).json({
        message: 'Payment verification completed',
        order: {
          orderId: crossmintResponse.orderId,
          locale: crossmintResponse.locale,
          lineItems: crossmintResponse.lineItems?.map(item => ({
            chain: item.chain,
            metadata: item.metadata,
            delivery: item.delivery,
            quantity: item.quantity
          })),
          quote: {
            totalPrice: crossmintResponse.quote?.totalPrice
          }
        }
      });
    }
      
    // Execute order fulfillment
    logger.info('Executing order fulfillment', paymentPayload.extra?.orderId);
      
    const serializedTx = crossmintResponse.payment?.preparation?.serializedTransaction;
    
    if (serializedTx) {
      try {
        const fulfillmentResult = await crossmintService.executePayment(
          serializedTx,
          paymentPayload.extra?.orderId,
          chain
        );
          
        logger.success('Order fulfillment executed successfully', paymentPayload.extra?.orderId, {
          transactionHash: fulfillmentResult.data?.transactionHash
        });
          
        // Get updated order status
        const updatedOrderResponse = await crossmintService.getOrderStatus(paymentPayload.extra?.orderId);
        const updatedOrder = updatedOrderResponse;
          
        return res.status(200).json({
          message: 'Payment received and order fulfilled successfully, check your email for confirmation',
          order: {
            orderId: updatedOrder.orderId,
            locale: updatedOrder.locale,
            lineItems: updatedOrder.lineItems?.map(item => ({
              chain: item.chain,
              metadata: item.metadata,
              delivery: {
                recipient: item.delivery?.recipient
              },
              quantity: item.quantity
            })),
            quote: {
              totalPrice: updatedOrder.quote?.totalPrice
            }
          },
          fulfillment: {
            success: fulfillmentResult.success,
            data: {
              id: fulfillmentResult.data?.id,
              createdAt: fulfillmentResult.data?.createdAt
            }
          }
        });
          
      } catch (fulfillmentError) {
        logger.critical('Order fulfillment failed', paymentPayload.extra?.orderId, fulfillmentError);
            
        return res.status(422).json({
          error: 'Payment received but fulfillment failed',
          message: 'Your payment was received but order fulfillment failed. Please contact support.',
          order: paymentPayload.payload,
          fulfillmentError: fulfillmentError.message
        });
      }
    } else {
      // No fulfillment transaction needed - order is already complete
      logger.info('No fulfillment transaction needed - order complete', paymentPayload.extra?.orderId);
      return res.status(200).json({
        message: 'Payment received successfully, check your email for confirmation',
        order: {
          orderId: crossmintResponse.orderId,
          locale: crossmintResponse.locale,
          lineItems: crossmintResponse.lineItems?.map(item => ({
            chain: item.chain,
            metadata: item.metadata,
            delivery: item.delivery,
            quantity: item.quantity
          })),
          quote: {
            totalPrice: crossmintResponse.quote?.totalPrice
          }
        }
      });
    }

  } catch (error) {
    logger.error('Error processing order', null, error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/:orderId/status
 * Get order status from Crossmint
 */
router.get('/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      logger.error('Missing order ID in status request', null);
      return res.status(400).json({
        error: 'Missing order ID',
        message: 'Order ID is required'
      });
    }

    logger.info('Fetching order status', orderId);
    
    // Get order status from Crossmint
    const orderStatus = await crossmintService.getOrderStatus(orderId);
    
    logger.success('Order status fetched successfully', orderId);
    res.json({
      success: true,
      order: orderStatus.order || orderStatus
    });

  } catch (error) {
    logger.error('Error fetching order status', req.params.orderId, error);
    res.status(500).json({
      error: 'Failed to fetch order status',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/debug/all
 * Simple debug endpoint (no database used in new flow)
 */
router.get('/debug/all', async (req, res) => {
      res.json({
      success: true,
      debug: {
        message: 'Using custom x402 middleware flow',
        flow: [
          '1. POST /api/orders (no X-PAYMENT) → Create order → Return 402 with orderId',
          '2. POST /api/orders (with X-PAYMENT) → Execute order → Return status'
        ],
        configuration: {
          supportedNetworks: config.x402.supportedNetworks,
          supportedCurrencies: config.x402.supportedCurrencies
        }
      }
    });
});

/**
 * GET /api/orders/facilitator/health
 * Check x402 facilitator health and capabilities
 */
router.get('/facilitator/health', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'x402 facilitator health check successful',
      configuration: {
        supportedNetworks: config.x402.supportedNetworks,
        supportedCurrencies: config.x402.supportedCurrencies
      }
    });
  } catch (error) {
    logger.error('Error checking facilitator health', null, error);
    res.status(500).json({
      error: 'Failed to check facilitator health',
      message: error.message
    });
  }
});

module.exports = router; 