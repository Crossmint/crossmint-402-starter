import Redis from "ioredis";
import { logger } from "../helpers/logger";
import { UserProfile } from "lib/types";
import { validateEnvironment } from "../helpers/client";

const { REDIS_URL } = validateEnvironment(["REDIS_URL"]);

class RedisClient {
  private client: Redis;
  private isConnected = false;

  constructor() {
    this.client = new Redis(`${REDIS_URL}?family=0`);

    this.client.on("connect", () => {
      logger.info("Redis connected successfully");
      this.isConnected = true;
    });

    this.client.on("error", (error) => {
      logger.error("Redis connection error:", error);
      this.isConnected = false;
    });

    this.client.on("ready", () => {
      logger.info("Redis ready for operations");
    });
  }

  async connect(): Promise<void> {
    if (this.client.status === "ready" || this.client.status === "connecting") {
      return;
    }

    try {
      await this.client.connect();
    } catch (error) {
      if (error.message?.includes("already connecting/connected")) {
        return;
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this.isConnected = false;
  }

  // User Profile Operations
  async saveUserProfile(profile: UserProfile): Promise<void> {
    const key = `user:${profile.inboxId}`;
    await this.client.set(key, JSON.stringify(profile));
    logger.info(`Saved user profile: ${profile.inboxId}`);
  }

  async loadUserProfile(inboxId: string): Promise<UserProfile | null> {
    const key = `user:${inboxId}`;
    const result = await this.client.get(key);

    if (!result) return null;

    try {
      return JSON.parse(result);
    } catch (error) {
      logger.error(`Failed to parse user profile for ${inboxId}:`, error);
      return null;
    }
  }

  async appendUserOrder(inboxId: string, order: any): Promise<void> {
    const profile = await this.loadUserProfile(inboxId);

    if (!profile) {
      logger.warn(`No profile found for ${inboxId}, cannot append order`);
      return;
    }

    // Ensure orderHistory exists
    if (!profile.orderHistory) {
      profile.orderHistory = [];
    }

    profile.orderHistory.push(order);
    await this.saveUserProfile(profile);

    logger.info(`Added order to user ${inboxId}: ${order.id}`);
  }

  async getUserOrderHistory(inboxId: string): Promise<any[]> {
    const profile = await this.loadUserProfile(inboxId);
    return profile?.orderHistory || [];
  }

  // XMTP Database Operations
  async saveXMTpData(key: string, data: any, ttl?: number): Promise<void> {
    const redisKey = `xmtp:${key}`;

    const value = typeof data === "object" ? JSON.stringify(data) : data;

    if (ttl) {
      await this.client.setex(redisKey, ttl, value);
    } else {
      await this.client.set(redisKey, value);
    }

    logger.debug(`Saved XMTP data: ${redisKey}`);
  }

  async loadXMTpData(key: string): Promise<any> {
    const redisKey = `xmtp:${key}`;
    const result = await this.client.get(redisKey);

    if (!result) return null;

    try {
      return JSON.parse(result);
    } catch {
      // Return as string if not valid JSON
      return result;
    }
  }

  async deleteXMTpData(key: string): Promise<void> {
    const redisKey = `xmtp:${key}`;
    await this.client.del(redisKey);
    logger.debug(`Deleted XMTP data: ${redisKey}`);
  }

  // Conversation state caching
  async cacheConversationState(
    inboxId: string,
    state: any,
    ttl = 3600
  ): Promise<void> {
    const key = `conversation:${inboxId}`;
    await this.client.setex(key, ttl, JSON.stringify(state));
  }

  async getCachedConversationState(inboxId: string): Promise<any> {
    const key = `conversation:${inboxId}`;
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Analytics and monitoring
  async trackUserActivity(inboxId: string, action: string): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const key = `activity:${inboxId}:${date}`;
    await this.client.hincrby(key, action, 1);
    await this.client.expire(key, 86400 * 7); // 7 days retention
  }

  // Simple search operations (without RedisSearch)
  async searchUsers(query: string): Promise<UserProfile[]> {
    try {
      // Simple pattern-based search using SCAN
      const keys = await this.client.keys("user:*");
      const users: UserProfile[] = [];

      for (const key of keys) {
        const profile = await this.loadUserProfile(key.replace("user:", ""));
        if (profile && this.matchesQuery(profile, query)) {
          users.push(profile);
        }
      }

      return users.slice(0, 50); // Limit results
    } catch (error) {
      logger.warn("User search failed:", error.message);
      return [];
    }
  }

  private matchesQuery(profile: UserProfile, query: string): boolean {
    const searchText = query.toLowerCase();
    const fields = [
      profile.email,
      profile.name,
      profile.inboxId,
      profile.shippingAddress?.city,
      profile.shippingAddress?.state,
      profile.walletAddress,
    ].filter(Boolean);

    return fields.some((field) =>
      field?.toString().toLowerCase().includes(searchText)
    );
  }

  // Get all user profiles (for admin/debugging)
  async getAllUsers(): Promise<UserProfile[]> {
    const keys = await this.client.keys("user:*");
    const users: UserProfile[] = [];

    for (const key of keys) {
      const profile = await this.loadUserProfile(key.replace("user:", ""));
      if (profile) {
        users.push(profile);
      }
    }

    return users;
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  // Get Redis client for advanced operations
  getClient(): Redis {
    return this.client;
  }
}

// Singleton instance
export const redisClient = new RedisClient();

// Helper functions for backward compatibility
export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  await redisClient.connect();
  return redisClient.saveUserProfile(profile);
};

export const loadUserProfile = async (
  inboxId: string
): Promise<UserProfile | null> => {
  await redisClient.connect();
  return redisClient.loadUserProfile(inboxId);
};

export const saveUserOrderId = async ({
  profile,
  order,
}: {
  profile: UserProfile;
  order: any;
}): Promise<void> => {
  await redisClient.connect();
  return redisClient.appendUserOrder(profile.inboxId, order);
};

export const loadUserOrders = async (inboxId: string): Promise<any[]> => {
  await redisClient.connect();
  return redisClient.getUserOrderHistory(inboxId);
};
