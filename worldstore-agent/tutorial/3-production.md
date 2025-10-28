# Production Deployment Guide

**Transform your development setup into a production-ready crypto-commerce platform.** This guide covers security, scalability, monitoring, and compliance considerations.

For basic deployment, see [Quick Deployment Guide](./2-deployment.md) first.

## Security & Key Management

### Environment Variable Security

**Critical: Never commit secrets to version control**

```bash
# Production secrets that must be secured
ANTHROPIC_API_KEY=sk-ant-...
WALLET_KEY=0x...
ENCRYPTION_KEY=...
CROSSMINT_API_KEY=...
```

**Recommended secrets management:**
- **Railway/Vercel**: Environment variables in dashboard
- **AWS**: Parameter Store or Secrets Manager
- **Kubernetes**: Sealed secrets or external-secrets-operator
- **Docker**: Use secrets mounting, not environment variables

### Wallet Security Options

**Option 1: Crossmint Smart Wallets (Recommended)**

For production deployments, consider Crossmint Smart Wallets instead of managing private keys:

**Benefits:**
- **No private key management** - Crossmint handles wallet security
- **Built-in gasless transactions** - Users don't need ETH for gas
- **Multi-chain support** - Works across all networks
- **Email-based wallets** - Users create wallets with just email
- **Enterprise-grade security** - Professional custody

**Learn more:** [Crossmint Smart Wallets Overview](https://docs.crossmint.com/wallets/overview)

**Option 2: Self-Managed Deterministic Wallets (Current)**

If continuing with deterministic wallets:
- Generate master private key offline using hardware wallet
- Use hardware security modules (HSM) for production keys
- Implement key rotation for XMTP encryption keys
- Monitor wallet balances with automated alerts
- Regular security audits of wallet generation code

### API Security

**Rate limiting:**
```javascript
// Implement per-user rate limits
const rateLimiter = {
  anthropic: '100 requests/hour per user',
  serpapi: '50 searches/hour per user',
  crossmint: '200 orders/day per user'
};
```

**Input validation:**
```javascript
// Sanitize all user inputs
const validateOrderInput = (input) => {
  // Prevent prompt injection attacks
  // Validate shipping addresses
  // Check for suspicious patterns
};
```

## XMTP Instance Management

### Single Client Architecture

The Worldstore Agent uses a **single [XMTP](https://docs.xmtp.org/) client** approach optimized for most production scenarios:

**Architecture benefits:**
- **Simple deployment**: One client handles all user conversations
- **Cost effective**: Minimal infrastructure requirements 
- **Consistent state**: Shared conversation context through Redis
- **Proven scalability**: Handles hundreds of concurrent users per instance

**When this works best:**
- Message volume < 1000/minute
- Users primarily in single geographic region
- Standard reliability requirements

### Production Deployment Considerations

**Critical requirements for platforms like Railway:**

```bash
# Essential environment variables
RAILWAY_VOLUME_MOUNT_PATH=/app/data  # Persistent storage path
XMTP_ENV=production                  # Use production XMTP network
ENCRYPTION_KEY=your-32-byte-hex-key  # Database encryption (keep consistent)
```

**Volume persistence (Required):**
- **Railway**: Configure volume in dashboard, mount to `/app/data`
- **Database path**: XMTP client stores conversation history in SQLite
- **Backup strategy**: Regular database backups before deployments
- **Migration handling**: Database persists across container restarts

**Memory management:**
- **Memory usage**: ~200-400MB typical, monitor for growth
- **Conversation caching**: Automatic cleanup of idle conversations
- **Garbage collection**: Enable with `--expose-gc` flag if needed

### Rate Limits & Performance

**[XMTP](https://docs.xmtp.org/) network limits per client (5-minute windows):**
- **Read operations**: 20,000 requests (conversation sync, message history)
- **Write operations**: 3,000 messages (sending responses)
- **Rate limit buffer**: Agent implements 90% thresholds for safety

**Installation limits:**
- **Maximum installations**: 10 per [XMTP](https://docs.xmtp.org/) client
- **Monitoring required**: Track installation count in health checks
- **Auto-cleanup**: Revoke old installations before hitting limit

**Performance optimization:**
```javascript
// Message processing optimization
const processingOptions = {
  batchSize: 10,           // Process messages in batches
  concurrentUsers: 50,     // Max concurrent conversations
  cacheExpiry: 1800000,    // 30-minute conversation cache
  rateLimitBuffer: 0.9     // Use 90% of XMTP limits
};
```

### Health Monitoring

**Essential health checks:**
```bash
# Check XMTP connectivity
curl http://localhost:3000/health

# Expected response includes:
{
  "xmtp": {
    "connected": true,
    "installations": 3,
    "conversations": 45
  }
}
```

**Critical alerts to configure:**
- XMTP connection failures
- Installation count approaching 10
- Memory usage > 80%
- Message processing delays > 30 seconds

### Scaling Strategies

**Vertical scaling (Recommended):**
- Increase memory allocation (512MB-1GB)
- Use faster CPU for message processing
- Optimize Redis connection pooling

**When to consider horizontal scaling:**
- Message volume consistently > 1000/minute
- Need geographic distribution
- Require active-passive failover

**Horizontal scaling complexity:**
```javascript
// If scaling horizontally, consider:
const scalingChallenges = {
  walletManagement: 'Each instance needs unique XMTP wallet',
  messageRouting: 'Route users consistently to same instance', 
  stateSharding: 'Split user state across instances',
  deploymentComplexity: 'Coordinate multiple XMTP clients'
};
```

### Troubleshooting Common Issues

**Database corruption:**
```bash
# Check database integrity
sqlite3 /app/data/production-agent.db3 "PRAGMA integrity_check;"

# Recovery: Restore from backup or reset (loses conversation history)
```

**Installation limit exceeded:**
```bash
# Check current installations
curl http://localhost:3000/health | jq '.xmtp.installations'

# Manual cleanup via agent scripts
pnpm run revoke-installations
```

**Memory growth:**
```bash
# Monitor memory usage
ps aux | grep node
# If growing steadily, restart instance (investigation needed)
```

**For comprehensive XMTP deployment guidance, see [XMTP Production Deployment Guide](../docs/XMTP_PRODUCTION_DEPLOYMENT.md)**

## Scalability Architecture

### Database Strategy

**Current: Redis-only**
```bash
# Production Redis configuration
REDIS_URL=rediss://username:password@redis-cluster:6380
REDIS_CLUSTER_NODES=redis1:6379,redis2:6379,redis3:6379
```

**Recommended: Hybrid approach**
```javascript
// PostgreSQL for persistent data
const persistentData = {
  userProfiles: 'PostgreSQL',
  orderHistory: 'PostgreSQL',
  paymentRecords: 'PostgreSQL'
};

// Redis for ephemeral data
const ephemeralData = {
  conversationState: 'Redis',
  sessionData: 'Redis',
  rateLimitCounters: 'Redis'
};
```

### Service Scaling

**XMTP Agent scaling:**
- Run multiple instances with shared Redis state
- Use message queues for order processing
- Implement circuit breakers for external APIs

**Payment Server scaling:**
- Stateless design allows horizontal scaling
- Use load balancer with health checks
- Implement request deduplication

**Infrastructure:**
```yaml
# Docker Compose production example
version: '3.8'
services:
  agent:
    replicas: 3
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
  
  server:
    replicas: 2
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.3'
```

### Performance Optimization

**Agent performance:**
```javascript
// Implement conversation context caching
const contextCache = new Map();

// Use connection pooling for Redis
const redisPool = {
  min: 2,
  max: 10,
  acquireTimeoutMillis: 30000
};

// Batch XMTP message processing
const processBatch = async (messages) => {
  return Promise.allSettled(
    messages.map(msg => processMessage(msg))
  );
};
```

**Payment server optimization:**
```javascript
// Cache Crossmint responses
const orderStatusCache = new LRU({
  max: 1000,
  ttl: 60000 // 1 minute
});

// Request deduplication
const dedupeRequests = new Map();
```

## Monitoring & Observability

### Essential Metrics

**Business metrics:**
```javascript
const businessMetrics = {
  // Revenue tracking
  ordersPerMinute: 'histogram',
  averageOrderValue: 'gauge',
  conversionRate: 'ratio', // messages to orders
  
  // User behavior
  userRetentionRate: 'gauge',
  repeatPurchaseRate: 'ratio',
  averageSessionLength: 'histogram'
};
```

**Technical metrics:**
```javascript
const technicalMetrics = {
  // Performance
  xmtpMessageLatency: 'histogram',
  redisResponseTime: 'histogram',
  anthropicAPILatency: 'histogram',
  
  // Reliability
  paymentSuccessRate: 'gauge',
  errorRateByService: 'counter',
  uptime: 'gauge'
};
```

**Infrastructure metrics:**
```javascript
const infrastructureMetrics = {
  // Resources
  cpuUtilization: 'gauge',
  memoryUsage: 'gauge',
  diskSpace: 'gauge',
  
  // Network
  networkLatency: 'histogram',
  bandwidthUsage: 'counter'
};
```

### Logging Strategy

**Structured logging with correlation IDs:**
```javascript
// Every request gets a correlation ID
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  )
});

logger.info('Order processing started', {
  userInboxId: 'user123',
  orderId: 'CM_789abc',
  orderValue: 179.00,
  paymentNetwork: 'base',
  correlationId: 'req_abc123'
});
```

**Log levels and retention:**
```javascript
const logConfig = {
  levels: {
    error: 30, // days retention
    warn: 14,
    info: 7,
    debug: 1
  },
  production: 'info', // minimum level
  development: 'debug'
};
```

### Alerting Rules

**Critical alerts (immediate response):**
- Payment processing failures > 5% in 5 minutes
- XMTP connection down > 2 minutes
- Redis memory usage > 90%
- Any service completely down

**Warning alerts (response within 1 hour):**
- High API error rates
- Unusual user behavior patterns
- Approaching rate limits
- Slow response times

## Compliance & Legal

### Financial Regulations

**Transaction monitoring:**
```javascript
const complianceChecks = {
  // Monitor for suspicious patterns
  highValueOrders: amount => amount > 10000, // $10k USDC
  rapidOrders: orders => orders.length > 10 && orders.timespan < 3600,
  multipleAddresses: user => user.shippingAddresses.length > 5
};
```

**Audit trails:**
```javascript
const auditLog = {
  // Log all financial transactions
  payment: {
    userId: 'string',
    amount: 'number',
    currency: 'string',
    timestamp: 'ISO string',
    network: 'string',
    transactionHash: 'string'
  }
};
```

**KYC/AML procedures:**
- Implement identity verification for orders > $1000
- Report suspicious transaction patterns
- Maintain customer due diligence records
- Consider money transmission licensing requirements

### Data Privacy

**GDPR/CCPA compliance:**
```javascript
const dataPrivacy = {
  // Data subject rights
  export: async (userId) => {
    // Export all user data
  },
  
  delete: async (userId) => {
    // Delete all user data
    // Maintain audit trail as required
  },
  
  rectify: async (userId, updates) => {
    // Update incorrect data
  }
};
```

**Data encryption:**
```javascript
// Encrypt sensitive data at rest
const encryption = {
  userProfiles: 'AES-256-GCM',
  conversationHistory: 'AES-256-GCM',
  paymentData: 'Field-level encryption'
};
```

### Platform Policies

**Amazon Terms of Service:**
- Ensure compliance with Amazon's API terms
- Monitor for prohibited items and categories
- Handle returns/refunds per platform policies
- Implement age verification for restricted products

**Regular audits:**
- Security penetration testing quarterly
- Compliance reviews semi-annually
- Code audits for financial handling
- Third-party security assessments

## Deployment Strategies

### Blue-Green Deployment

```bash
# Zero-downtime deployment strategy
# Deploy to green environment
docker-compose -f docker-compose.green.yml up -d

# Run health checks
./scripts/health-check.sh green

# Switch traffic to green
./scripts/switch-traffic.sh green

# Keep blue environment for rollback
```

### Monitoring Deployment Health

```javascript
// Health check endpoints
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      redis: await checkRedis(),
      anthropic: await checkAnthropic(),
      crossmint: await checkCrossmint()
    }
  };
  
  res.json(health);
});
```

### Rollback Procedures

```bash
# Quick rollback script
#!/bin/bash
echo "Rolling back to previous version..."
docker-compose -f docker-compose.blue.yml up -d
./scripts/switch-traffic.sh blue
echo "Rollback complete"
```

## Infrastructure Examples

### AWS Production Setup

```yaml
# CloudFormation template snippet
Resources:
  XMTPAgentCluster:
    Type: AWS::ECS::Cluster
    
  PaymentServerCluster:
    Type: AWS::ECS::Cluster
    
  RedisCluster:
    Type: AWS::ElastiCache::ReplicationGroup
    Properties:
      NumCacheClusters: 3
      CacheNodeType: cache.r6g.large
```

### Kubernetes Production Setup

```yaml
# Kubernetes manifests
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worldstore-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: worldstore-agent
  template:
    metadata:
      labels:
        app: worldstore-agent
    spec:
      containers:
      - name: agent
        image: worldstore/agent:latest
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## Cost Optimization

**API costs:**
```javascript
const costOptimization = {
  // Cache expensive operations
  anthropic: 'Cache common responses',
  serpapi: 'Cache product searches for 1 hour',
  crossmint: 'Cache order status for 5 minutes',
  
  // Optimize usage
  prompts: 'Use shorter, focused prompts',
  context: 'Trim conversation context',
  batch: 'Batch similar operations'
};
```

**Infrastructure costs:**
- Use spot instances for non-critical workloads
- Auto-scale based on demand
- Optimize database queries and indexing
- Implement efficient caching strategies

---

**Next Steps:**
- Set up monitoring and alerting
- Implement security best practices
- Test disaster recovery procedures
- Plan for compliance requirements

For troubleshooting production issues, see [Troubleshooting Guide](./4-troubleshooting.md).