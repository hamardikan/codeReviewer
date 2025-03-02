/**
 * Environment variable utilities
 */

/**
 * Get the Redis TTL from environment, with fallback
 * @returns TTL in seconds
 */
export function getRedisKeyTTL(): number {
    const ttlFromEnv = process.env.REDIS_KEY_TTL;
    if (ttlFromEnv) {
      const parsed = parseInt(ttlFromEnv, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    
    // Default TTL: 5 minutes (300 seconds)
    return 300;
  }
  
  /**
   * Validate that required environment variables are set
   * @returns Object with validation status and error message
   */
  export function validateEnvironment(): { valid: boolean; error?: string } {
    const requiredVars = [
      { name: 'GEMINI_API_KEY', description: 'Gemini API key for code reviews' },
      { name: 'REDIS_URL', description: 'Redis connection URL' }
    ];
    
    for (const variable of requiredVars) {
      if (!process.env[variable.name]) {
        return { 
          valid: false, 
          error: `Missing required environment variable: ${variable.name} - ${variable.description}` 
        };
      }
    }
    
    return { valid: true };
  }