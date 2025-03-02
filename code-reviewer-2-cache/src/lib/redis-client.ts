import { createClient, RedisClientType } from 'redis';
import { getRedisKeyTTL, validateEnvironment } from './env-utils';

/**
 * Singleton Redis client for managing connections
 */
export class RedisClient {
  private static instance: RedisClient | null = null;
  private client: RedisClientType | null = null;
  
  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}
  
  /**
   * Get the singleton instance of the RedisClient
   * @returns The RedisClient instance
   */
  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }
  
  /**
   * Get the Redis client instance, initializing if needed
   * @returns Promise resolving to the Redis client
   */
  public async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      // Validate environment
      const envCheck = validateEnvironment();
      if (!envCheck.valid) {
        throw new Error(envCheck.error);
      }
      
      const redisUrl = process.env.REDIS_URL;
      
      if (!redisUrl) {
        throw new Error("REDIS_URL is not defined in environment variables");
      }
      
      this.client = createClient({
        url: redisUrl,
      });
      
      // Handle connection events
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });
      
      this.client.on('connect', () => {
        console.log('Redis Client Connected');
      });
      
      // Connect to Redis
      await this.client.connect();
    }
    
    return this.client;
  }
  
  /**
   * Close the Redis connection
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }
}

/**
 * Get the Redis client instance
 * @returns Promise resolving to the Redis client
 */
export async function getRedisClient(): Promise<RedisClientType> {
  const redisClient = RedisClient.getInstance();
  return redisClient.getClient();
}

/**
 * Get the TTL for Redis keys
 * @returns TTL in seconds
 */
export function getRedisTTL(): number {
  return getRedisKeyTTL();
}