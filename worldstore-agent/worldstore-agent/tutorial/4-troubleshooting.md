# Troubleshooting Guide

**Debug and resolve common issues with your Worldstore Agent.** This guide covers the most frequent problems and their solutions, organized by component.

For basic setup, see [Deployment Guide](./2-deployment.md). For production issues, see [Production Guide](./3-production.md).

## Quick Diagnostics

**Run these commands first to identify the problem area:**

```bash
# Check service health
curl http://localhost:3000/health

# Check agent logs
cd agent && pnpm logs

# Check Redis connection
redis-cli ping

# Verify environment variables
cd agent && node -e "console.log('ANTHROPIC_API_KEY:', !!process.env.ANTHROPIC_API_KEY)"
```

## [XMTP](https://docs.xmtp.org/) Agent Issues

### Agent Won't Start

**Symptom:** Agent fails to initialize with wallet or [XMTP](https://docs.xmtp.org/) errors

**Diagnostic commands:**
```bash
# Check wallet key format
node -e "console.log('Wallet key length:', process.env.WALLET_KEY?.length)"
# Should be 66 (including 0x prefix)

# Validate encryption key
node -e "console.log('Encryption key length:', process.env.ENCRYPTION_KEY?.length)"
# Should be 64 (32 bytes in hex)

# Test XMTP network connectivity
curl -X POST https://dev.xmtp.network/health
```

**Common causes and fixes:**

**Invalid wallet key format:**
```bash
# Regenerate keys
cd agent && pnpm gen:keys

# Copy the new values to .env file
WALLET_KEY=0x... # 64 hex characters + 0x prefix
ENCRYPTION_KEY=... # 64 hex characters
```

**Wrong XMTP environment:**
```bash
# Use dev environment for testing
XMTP_ENV=dev

# For production, switch to production
XMTP_ENV=production
```

**Network connectivity issues:**
```bash
# Check firewall settings
sudo ufw status

# Test network connectivity
ping dev.xmtp.network
```

### Agent Responds Slowly

**Symptom:** Long delays between user messages and agent responses

**Diagnostic steps:**
```bash
# Check Anthropic API latency
cd agent && node -e "
const start = Date.now();
fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'hi' }]
  })
}).then(() => console.log('Anthropic latency:', Date.now() - start, 'ms'));
"

# Check Redis response time
redis-cli --latency-history -i 1
```

**Solutions:**

**Optimize conversation context:**
```javascript
// Trim conversation history in code
const MAX_CONTEXT_LENGTH = 4000; // tokens
const trimContext = (context) => {
  // Keep last N messages only
  return context.slice(-10);
};
```

**Use Redis connection pooling:**
```javascript
// Configure Redis pool in production
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3,
  lazyConnect: true
});
```

### Message Processing Errors

**Symptom:** Agent receives messages but doesn't process them correctly

**Check message format:**
```bash
# Enable debug logging
DEBUG=xmtp:* node index.js

# Check message decoding
# Look for "Message decoded successfully" in logs
```

**Common fixes:**

**Codec issues:**
```javascript
// Ensure proper codec registration
import { Client } from '@xmtp/xmtp-js';
import { QuickActionCodec } from '@xmtp/quick-action-codec';

client.registerCodec(new QuickActionCodec());
```

**Memory issues:**
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 index.js
```

## Redis Connection Issues

### Connection Failures

**Symptom:** User profiles not saving, conversation state lost

**Diagnostic commands:**
```bash
# Test Redis connectivity
redis-cli ping
# Should return: PONG

# Check Redis logs
redis-cli monitor
# Watch for connection attempts

# Test from Node.js
node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
redis.ping().then(console.log).catch(console.error);
"
```

**Common solutions:**

**Fix Redis URL format:**
```bash
# Local Redis
REDIS_URL=redis://localhost:6379

# Remote Redis with auth
REDIS_URL=redis://username:password@host:port

# SSL connection
REDIS_URL=rediss://username:password@host:port
```

**Docker Redis issues:**
```bash
# Check if Redis container is running
docker ps | grep redis

# Restart Redis container
docker restart worldstore-redis

# Check Redis container logs
docker logs worldstore-redis
```

**Memory issues:**
```bash
# Check Redis memory usage
redis-cli info memory

# Set memory limit if needed
redis-cli config set maxmemory 1gb
redis-cli config set maxmemory-policy allkeys-lru
```

### Redis Performance Issues

**Symptom:** Slow Redis responses, timeouts

**Diagnostic commands:**
```bash
# Monitor Redis performance
redis-cli --latency
redis-cli --latency-history

# Check slow queries
redis-cli slowlog get 10
```

**Solutions:**

**Optimize Redis configuration:**
```bash
# Increase timeout values
redis-cli config set timeout 300

# Optimize for memory
redis-cli config set save ""  # Disable persistence for cache-only use
```

**Connection pooling:**
```javascript
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  connectTimeout: 10000,
  lazyConnect: true,
  maxRetriesPerRequest: 3
});
```

## Payment Server Issues

### 402 Payment Required Errors

**Symptom:** Orders fail with "Payment Required" but no payment details

**Diagnostic commands:**
```bash
# Test Crossmint connectivity
curl -H "X-API-Key: $CROSSMINT_API_KEY" \
  https://staging.crossmint.com/api/v1-alpha2/wallets/$CROSSMINT_WALLET_LOCATOR

# Check server logs for detailed errors
cd server && pnpm logs | grep ERROR
```

**Common Crossmint configuration issues:**

**Wrong environment:**
```bash
# Ensure environment matches your API key
CROSSMINT_ENVIRONMENT=staging  # or production
```

**Invalid wallet locator:**
```bash
# Correct format examples
CROSSMINT_WALLET_LOCATOR=email:your-email@domain.com:polygon
CROSSMINT_WALLET_LOCATOR=wallet:0x1234...abcd
```

**API key permissions:**
- Check Crossmint dashboard for API key permissions
- Ensure key has access to wallet operations
- Verify key is not expired or rate-limited

### Payment Signature Validation Failures

**Symptom:** Valid payments rejected with signature errors

**Debug signature generation:**
```javascript
// Add logging to payment signature generation
console.log('Domain:', domain);
console.log('Authorization:', authorization);
console.log('Signature:', signature);

// Verify signature components
const { v, r, s } = splitSignature(signature);
console.log('v:', v, 'r:', r, 's:', s);
```

**Common fixes:**

**EIP-3009 signature format:**
```javascript
// Ensure proper v-value normalization
let { v, r, s } = splitSignature(signature);
if (v < 27) v += 27; // Normalize v value for USDC
```

**Check domain parameters:**
```javascript
// Verify USDC contract domain
const domain = {
  name: "USDC",
  version: "2", // Important: must match contract
  chainId: 84532, // Base Sepolia
  verifyingContract: paymentRequirements.asset
};
```

### Network-Specific Payment Issues

**Symptom:** Payments work on some networks but not others

**Debug network configuration:**
```bash
# Check USDC contract addresses
cd server && node -e "
const config = require('./src/config');
console.log('Ethereum Sepolia USDC:', config.x402.getContractAddress('ethereum-sepolia'));
console.log('Base Sepolia USDC:', config.x402.getContractAddress('base-sepolia'));
console.log('Polygon Mumbai USDC:', config.x402.getContractAddress('polygon-mumbai'));
"
```

**Verify user balances:**
```javascript
// Check user has USDC on the correct network
const checkBalance = async (userAddress, network) => {
  const balance = await getUSDCBalance(userAddress, network);
  console.log(`${network} USDC balance:`, balance);
};
```

**Common network issues:**

**Wrong contract addresses:**
```javascript
// Verify contract addresses match actual USDC deployments
const contracts = {
  'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'polygon-mumbai': '0x9999f7fea5938fd3b1e26a12c3f2fb024e194f97'
};
```

**RPC endpoint issues:**
```bash
# Test RPC connectivity
curl -X POST https://ethereum-sepolia.publicnode.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## API Integration Issues

### Anthropic API Problems

**Symptom:** AI responses fail or return errors

**Check API key and usage:**
```bash
# Test API key validity
curl -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' \
  https://api.anthropic.com/v1/messages
```

**Common issues:**

**Rate limiting:**
```bash
# Check for rate limit headers in response
# Implement exponential backoff
const retry = async (fn, retries = 3) => {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 429 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
      return retry(fn, retries - 1);
    }
    throw error;
  }
};
```

**Token limits:**
```javascript
// Optimize prompts to reduce token usage
const optimizePrompt = (prompt) => {
  // Remove unnecessary words
  // Use shorter examples
  // Compress context
  return prompt.replace(/\s+/g, ' ').trim();
};
```

### SerpAPI Integration Issues

**Symptom:** Product search returns no results or errors

**Test SerpAPI connectivity:**
```bash
# Test API key
curl "https://serpapi.com/search.json?engine=google_shopping&q=laptop&api_key=$SERPAPI_API_KEY"
```

**Common fixes:**

**Search query optimization:**
```javascript
// Improve search queries for better results
const optimizeSearchQuery = (userQuery) => {
  // Add "amazon" to query for better results
  return `${userQuery} site:amazon.com`;
};
```

**Handle API limits:**
```javascript
// Implement caching for search results
const searchCache = new Map();
const cachedSearch = async (query) => {
  if (searchCache.has(query)) {
    return searchCache.get(query);
  }
  const result = await serpapi.search(query);
  searchCache.set(query, result);
  return result;
};
```

## Performance Issues

### Slow Message Processing

**Symptoms:**
- Long delays between user messages and responses
- Timeouts in conversation flow
- High CPU usage

**Diagnostic steps:**
```bash
# Profile Node.js performance
node --prof index.js
# Run some operations, then:
node --prof-process isolate-*.log > profile.txt

# Monitor memory usage
node --inspect index.js
# Open chrome://inspect in browser
```

**Optimization strategies:**

**Implement caching:**
```javascript
// Cache expensive operations
const productCache = new LRU({ max: 1000, ttl: 3600000 }); // 1 hour
const conversationCache = new LRU({ max: 500, ttl: 1800000 }); // 30 minutes
```

**Use connection pooling:**
```javascript
// Reuse HTTP connections
const https = require('https');
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50
});
```

### Memory Leaks

**Symptoms:**
- Gradually increasing memory usage
- Application crashes with out-of-memory errors
- Slow performance over time

**Debug memory issues:**
```bash
# Monitor memory usage
node --inspect --max-old-space-size=4096 index.js

# Use heap snapshots in Chrome DevTools
# Look for objects that aren't being garbage collected
```

**Common memory leak sources:**

**Event listeners:**
```javascript
// Ensure proper cleanup
process.on('SIGINT', () => {
  // Clean up resources
  redis.disconnect();
  xmtpClient.close();
  process.exit(0);
});
```

**Circular references:**
```javascript
// Avoid circular references in user state
const createUserState = (user) => {
  return {
    ...user,
    // Don't store back-references
    orders: user.orders.map(order => ({ id: order.id, status: order.status }))
  };
};
```

## Environment-Specific Issues

### Development vs Production

**Docker environment differences:**
```bash
# Check environment variables in container
docker exec worldstore-agent env | grep -E "(REDIS|ANTHROPIC|CROSSMINT)"

# Compare development and production configs
diff development.env production.env
```

**Network connectivity:**
```bash
# Test from inside container
docker exec worldstore-agent curl http://localhost:3000/health
docker exec worldstore-agent redis-cli -h redis ping
```

### Deployment Issues

**Common deployment problems:**

**Missing environment variables:**
```bash
# Verify all required variables are set
required_vars=("ANTHROPIC_API_KEY" "CROSSMINT_API_KEY" "SERPAPI_API_KEY" "REDIS_URL")
for var in "${required_vars[@]}"; do
  if [[ -z "${!var}" ]]; then
    echo "Missing: $var"
  fi
done
```

**Port conflicts:**
```bash
# Check if ports are available
netstat -tlnp | grep :3000
lsof -i :3000
```

**File permissions:**
```bash
# Fix permission issues
chmod +x scripts/*.sh
chown -R node:node /app
```

## Emergency Procedures

### Service Recovery

**Quick restart procedure:**
```bash
# Stop all services
docker-compose down

# Clean up containers and networks
docker system prune -f

# Restart with fresh containers
docker-compose up -d

# Verify health
curl http://localhost:3000/health
```

### Data Recovery

**Redis data backup:**
```bash
# Create backup
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb backup-$(date +%Y%m%d).rdb

# Restore from backup
redis-cli FLUSHALL
redis-cli SHUTDOWN NOSAVE
cp backup-20240120.rdb /var/lib/redis/dump.rdb
redis-server
```

### Rollback Procedures

**Quick rollback to previous version:**
```bash
# Tag current version before deploying
git tag -a v1.0.1 -m "Pre-deployment backup"

# Rollback if needed
git checkout v1.0.0
docker-compose down
docker-compose up -d --build
```

## Getting Help

### Log Collection

**Gather diagnostic information:**
```bash
#!/bin/bash
# Create diagnostic bundle
mkdir diagnostics
cd diagnostics

# System info
uname -a > system-info.txt
docker --version >> system-info.txt
node --version >> system-info.txt

# Service logs
docker logs worldstore-agent > agent.log 2>&1
docker logs worldstore-server > server.log 2>&1
docker logs worldstore-redis > redis.log 2>&1

# Configuration (scrub secrets)
env | grep -E "(WORLDSTORE|XMTP|REDIS)" | sed 's/=.*/=***/' > env-vars.txt

# Create archive
tar -czf ../diagnostics-$(date +%Y%m%d-%H%M).tar.gz .
cd ..
rm -rf diagnostics
```

### Support Channels

**Before contacting support:**
1. Check this troubleshooting guide
2. Search existing GitHub issues
3. Collect diagnostic information above

**Support resources:**
- **Documentation**: [Crossmint Docs](https://docs.crossmint.com)
- **Community**: [Telegram](https://t.me/crossmintdevs)
- **Issues**: [GitHub Repository Issues]
- **Email**: For sensitive issues, contact support directly

**When reporting issues, include:**
- Operating system and versions
- Complete error messages
- Steps to reproduce
- Diagnostic bundle (with secrets removed)
- Expected vs actual behavior

---

**Still having issues?** Check the [Extension Guide](./5-extensions.md) for advanced configuration options, or refer to the [Production Guide](./3-production.md) for production-specific troubleshooting.