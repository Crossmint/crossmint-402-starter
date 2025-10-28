import * as fs from "fs";
import { redisClient } from "services/redis";
import { logger } from "@helpers/logger";
import { USER_STORAGE_DIR } from "@helpers/constants";

/**
 * Initialize Redis connection with fallback to filesystem storage
 * Creates necessary directories if Redis connection fails
 */
export async function initializeRedis(): Promise<void> {
  logger.info("Initializing Redis connection...");

  try {
    await redisClient.connect();
    const isConnected = await redisClient.ping();

    if (!isConnected) {
      throw new Error("Redis connection failed");
    }

    logger.success("Redis connected successfully");
  } catch (error) {
    logger.error("Redis initialization failed:", error);
    logger.warn("Falling back to filesystem storage");

    // Fallback: create directories for filesystem storage
    [USER_STORAGE_DIR].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
}
