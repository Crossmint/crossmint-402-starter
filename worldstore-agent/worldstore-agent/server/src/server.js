const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const orderRoutes = require('./routes/orders');
const logger = require('./utils/logger');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.server.nodeEnv === 'production' ? false : '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, null, {
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.server.nodeEnv
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'x402 + Crossmint API',
    version: '1.0.0',
    description: 'API that combines x402 payment protocol with Crossmint Worldstore for crypto-powered Amazon purchases',
    documentation: {
      endpoints: {
        'POST /api/orders': {
          description: 'Create an order for an Amazon product using x402 payment protocol',
          flow: [
            '1. First call without payment returns 402 Payment Required',
            '2. Include X-PAYMENT header with payment details and retry',
            '3. Order is created via Crossmint and order details are returned'
          ],
          body: {
            asin: 'string (required) - Amazon ASIN (10-character alphanumeric)',
            email: 'string (required) - Recipient email address',
            physicalAddress: 'object (required) - Shipping address with name, line1, line2, city, state, postalCode, country',
            payment: 'object (optional) - Payment settings with method (chain) and currency'
          },
          headers: {
            'X-PAYMENT': 'string (optional) - Base64-encoded payment data for x402 protocol'
          }
        },
        'GET /api/orders/:orderId/status': {
          description: 'Get order status from Crossmint',
          parameters: {
            orderId: 'string (required) - Crossmint order ID'
          }
        },
        'GET /api/orders/debug/all': {
          description: 'Get all orders and sessions from local database (debug endpoint)',
          parameters: {}
        }
      },
      protocol: 'x402',
      integration: 'Crossmint Worldstore',
      supportedNetworks: config.x402.supportedNetworks,
      supportedCurrencies: config.x402.supportedCurrencies
    }
  });
});

// x402 payment middleware
app.use('/api/orders', (req, res, next) => {
  // Only handle POST requests
  if (req.method !== 'POST') {
    return next();
  }
  
  // Get the requested network from the request body
  const requestedNetwork = req.body?.payment?.method || config.x402.defaultNetwork;
  
  // Validate the requested network is supported
  if (!config.x402.isSupportedNetwork(requestedNetwork)) {
    return res.status(400).json({
      error: 'Unsupported network',
      message: `Network "${requestedNetwork}" is not supported. Supported networks: ${config.x402.supportedNetworks.join(', ')}`,
      supportedNetworks: config.x402.supportedNetworks
    });
  }
  
  // Use custom middleware for all networks
  logger.info(`Using custom x402 middleware for ${requestedNetwork}`);
  
  // Check if payment header is present
  const paymentHeader = req.headers['x-payment'];
  
  if (!paymentHeader) {
    // No payment header - we need to create the Crossmint order first to get the real order ID
    // This will be handled by the orders route which will create the order and return 402
    return next();
  }
  
  // Payment header is present - continue to the next middleware
  next();
});

// API routes
app.use('/api/orders', orderRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    availableEndpoints: [
      'GET /health',
      'GET /api',
      'POST /api/orders',
      'GET /api/orders/:orderId/status',
      'GET /api/orders/debug/all'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Global error handler', null, error);
  
  res.status(error.status || 500).json({
    error: error.name || 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
    ...(config.server.nodeEnv === 'development' && { stack: error.stack })
  });
});

// Start server
const PORT = config.server.port;
const server = app.listen(PORT, () => {
  logger.success('x402 + Crossmint API Server started', null, {
    port: PORT,
    environment: config.server.nodeEnv,
    crossmintWalletAddress: config.crossmint.walletAddress,
    crossmintWalletLocator: config.crossmint.walletLocator,
    supportedNetworks: config.x402.supportedNetworks,
    supportedCurrencies: config.x402.supportedCurrencies
  });
  
  console.log(`\n🚀 x402 + Crossmint API Server started`);
  console.log(`📍 Running on: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${config.server.nodeEnv}`);
  console.log(`🔗 Networks: ${config.x402.supportedNetworks.join(', ')}`);
  console.log(`💎 Currencies: ${config.x402.supportedCurrencies.join(', ')}`);
  console.log(`🏦 Crossmint Wallet Address: ${config.crossmint.walletAddress}`);
  console.log(`🔗 Crossmint Wallet Locator: ${config.crossmint.walletLocator}`);
  console.log(`\n📖 API Documentation: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

module.exports = app; 