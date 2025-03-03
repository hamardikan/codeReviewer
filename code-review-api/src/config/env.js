'use strict';

require('dotenv').config();

const config = {
  // Server configuration
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Storage configuration
  storagePath: process.env.STORAGE_PATH || './storage/reviews',
  reviewTtlMinutes: parseInt(process.env.REVIEW_TTL_MINUTES || '60', 10),
  
  // Gemini API configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    generationConfig: {
      // Increased token limit to ensure complete responses
      maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS || '131072', 10), // Doubled from 65536
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      topP: parseFloat(process.env.TOP_P || '0.95'),
      topK: parseInt(process.env.TOP_K || '64', 10)
    }
  }
};

// Validate required configuration
function validateConfig() {
  const requiredVars = [
    { name: 'gemini.apiKey', value: config.gemini.apiKey, description: 'Gemini API key' }
  ];
  
  for (const variable of requiredVars) {
    if (!variable.value) {
      throw new Error(`Missing required environment variable: ${variable.name} - ${variable.description}`);
    }
  }
}

// Only validate in production to allow easier development
if (config.nodeEnv === 'production') {
  validateConfig();
}

module.exports = config;