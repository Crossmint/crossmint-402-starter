# Redis Setup Guide for XMTP Agent

## Overview

The XMTP Agent now uses Redis for high-performance data storage with automatic fallback to filesystem storage. This guide covers Redis setup, configuration, and migration.

## Benefits of Redis Integration

- **🚀 Performance**: In-memory operations are 10-100x faster than filesystem
- **🔒 Atomic Operations**: Prevents race conditions in order updates
- **🔍 Advanced Queries**: JSON document search and filtering
- **⏰ TTL Support**: Automatic cleanup of temporary data
- **📊 Analytics**: Built-in user activity tracking
- **📈 Scalability**: Horizontal scaling capabilities

## Quick Start

### 1. Install Redis

**macOS (Homebrew):**

```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-**server**
```

**Docker:\*\*\*\***

```bash
docker run -d --name redis -p 6379:6379 redis:latest
```

### 2. Configure Environment

Add to your `.env` file:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=           # Optional
REDIS_DB=0               # Default database
```

### 3. Run the Agent

The agent will automatically:

1. Connect to Redis
2. Migrate existing filesystem data
3. Create search indexes
4. Start processing messages

```bash
pnpm run dev
```

## Manual Migration

If you need to manually control the migration process:

```bash
# Migrate all filesystem data to Redis
pnpm run migrate

# Rollback to filesystem (if needed)
pnpm run migrate:rollback
```

## Redis Data Structure

### User Profiles

```
Key: user:{inboxId}
Type: JSON Document
Example: user:0x123abc...
```

### XMTP Client Data

```
Key: xmtp:{env}-{address}:{dataKey}
Type: String/JSON
TTL: Varies by data type
```

### Conversation Cache

```
Key: conversation:{inboxId}
Type: JSON
TTL: 1 hour
```

### Activity Tracking

```
Key: activity:{inboxId}:{date}
Type: Hash
TTL: 7 days
```

## Search Indexes

The agent automatically creates the following indexes:

### User Profiles Index

```
Index: idx:users
Fields:
- inboxId (TEXT)
- email (TEXT)
- name (TEXT)
- city (TEXT)
- state (TEXT)
- complete (TAG)
- walletAddress (TEXT)
```

### Orders Index

```
Index: idx:orders
Fields:
- orderId (TEXT)
- userId (TEXT)
- timestamp (NUMERIC)
- status (TAG)
- price (NUMERIC)
```

## Monitoring and Maintenance

### Check Redis Health

```bash
redis-cli ping
# Should return: PONG
```

### View User Profiles

```bash
redis-cli JSON.GET user:0x123abc...
```

### Search Users by City

```bash
redis-cli FT.SEARCH idx:users "@city:Seattle"
```

### Monitor Activity

```bash
redis-cli HGETALL activity:0x123abc...:2024-01-15
```

## Production Configuration

### Redis Configuration (`redis.conf`)

```
# Memory optimization
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Security
requirepass your_secure_password
```

### Environment Variables

```bash
# Production Redis
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_password
REDIS_DB=0

# SSL Support (if needed)
REDIS_TLS=true
```

## Troubleshooting

### Redis Connection Failed

1. Check if Redis is running: `redis-cli ping`
2. Verify connection details in `.env`
3. Check firewall settings
4. The agent will fallback to filesystem storage

### Migration Issues

```bash
# Check migration logs
tail -f logs/migration.log

# Manual verification
pnpm run migrate:verify

# Rollback if needed
pnpm run migrate:rollback
```

### Performance Issues

```bash
# Monitor Redis performance
redis-cli --latency-history
redis-cli info memory
redis-cli info stats
```

## Fallback Behavior

If Redis is unavailable, the agent automatically:

1. Logs the connection failure
2. Creates filesystem directories
3. Uses JSON file storage
4. Maintains full functionality

## Advanced Features

### Custom Queries

```javascript
// Search users by completion status
const completeUsers = await redisClient.searchUsers("@complete:true");

// Find orders by price range
const expensiveOrders = await redis.call(
  "FT.SEARCH",
  "idx:orders",
  "@price:[1000 +inf]"
);

// Activity analytics
const userActivity = await redisClient
  .getClient()
  .hgetall("activity:user123:2024-01-15");
```

### Conversation State Caching

```javascript
// Cache conversation state for 1 hour
await redisClient.cacheConversationState(inboxId, conversationData, 3600);

// Retrieve cached state
const cachedState = await redisClient.getCachedConversationState(inboxId);
```

## Migration from Filesystem

The migration process:

1. **Scans** `.data/user-profiles/` for JSON files
2. **Validates** profile structure
3. **Migrates** to Redis JSON documents
4. **Creates** backup files with `.backup-{timestamp}` suffix
5. **Verifies** data integrity
6. **Removes** original files if successful

Migration is **safe and reversible** - original data is always backed up.

## Support

For issues with Redis integration:

1. Check the logs for connection errors
2. Verify Redis is running and accessible
3. Try the manual migration commands
4. The agent will fallback to filesystem storage automatically
