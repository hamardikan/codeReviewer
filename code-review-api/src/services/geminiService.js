'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/env');
const logger = require('../utils/logger');

// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const model = genAI.getGenerativeModel({
  model: config.gemini.model,
  generationConfig: config.gemini.generationConfig
});

/**
 * Stream a response from the Gemini API for a given prompt
 * Returns an async generator yielding chunks of the response
 * Enhanced with error handling and retries
 */
async function* streamResponse(prompt) {
  const maxRetries = 2;
  let retryCount = 0;
  let lastError = null;
  
  while (retryCount <= maxRetries) {
    try {
      logger.info(`Calling Gemini API (streaming mode)${retryCount > 0 ? ` - Retry ${retryCount}` : ''}`);
      logger.debug(`Prompt length: ${prompt.length} characters`);
      
      const startTime = Date.now();
      const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Ensuring we use generationConfig properly
        generationConfig: {
          ...config.gemini.generationConfig,
          // Ensure we're really using the high token limit we configured
          maxOutputTokens: Math.max(config.gemini.generationConfig.maxOutputTokens, 100000)
        }
      });
      
      logger.info(`Gemini API stream initialized in ${Date.now() - startTime}ms`);
      
      let chunkCount = 0;
      let totalCharsReceived = 0;
      let lastChunkTime = Date.now();
      
      // Yield chunks as they arrive
      for await (const chunk of result.stream) {
        // Reset last chunk time
        lastChunkTime = Date.now();
        
        const text = chunk.text();
        if (text) {
          chunkCount++;
          totalCharsReceived += text.length;
          
          if (chunkCount % 10 === 0) {
            logger.debug(`Received ${chunkCount} chunks so far (${totalCharsReceived} total chars)`);
          }
          
          yield text;
        }
      }
      
      logger.info(`Gemini stream completed: ${chunkCount} chunks, ${totalCharsReceived} chars, took ${Date.now() - startTime}ms`);
      
      // If we got here without errors, exit the retry loop
      return;
    } catch (error) {
      lastError = error;
      retryCount++;
      
      logger.error(`Error streaming from Gemini API (attempt ${retryCount}/${maxRetries + 1}):`, error);
      
      if (error.response) {
        logger.error(`Gemini API error response: ${JSON.stringify(error.response)}`);
      }
      
      if (retryCount <= maxRetries) {
        // Exponential backoff: 2^retryCount * 1000ms (2s, 4s, 8s, etc.)
        const backoffTime = Math.pow(2, retryCount) * 1000;
        logger.info(`Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } else {
        // Out of retries, propagate the error
        throw error;
      }
    }
  }
}

/**
 * Generate a non-streaming response from the Gemini API
 * Returns the complete response text
 * Enhanced with error handling and retries
 */
async function generateContent(prompt) {
  const maxRetries = 2;
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    try {
      logger.info(`Calling Gemini API (non-streaming mode)${retryCount > 0 ? ` - Retry ${retryCount}` : ''}`);
      logger.debug(`Prompt length: ${prompt.length} characters`);
      
      const startTime = Date.now();
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Ensuring we use generationConfig properly
        generationConfig: {
          ...config.gemini.generationConfig,
          // Ensure we're really using the high token limit we configured
          maxOutputTokens: Math.max(config.gemini.generationConfig.maxOutputTokens, 100000)
        }
      });
      
      const responseText = result.response.text();
      const duration = Date.now() - startTime;
      
      logger.info(`Gemini API response received in ${duration}ms, ${responseText.length} chars`);
      
      return responseText;
    } catch (error) {
      retryCount++;
      
      logger.error(`Error generating content from Gemini API (attempt ${retryCount}/${maxRetries + 1}):`, error);
      
      if (error.response) {
        logger.error(`Gemini API error response: ${JSON.stringify(error.response)}`);
      }
      if (error.message) {
        logger.error(`Error message: ${error.message}`);
      }
      
      if (retryCount <= maxRetries) {
        // Exponential backoff: 2^retryCount * 1000ms (2s, 4s, 8s, etc.)
        const backoffTime = Math.pow(2, retryCount) * 1000;
        logger.info(`Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } else {
        // Out of retries, propagate the error
        throw error;
      }
    }
  }
}

module.exports = {
  streamResponse,
  generateContent
};