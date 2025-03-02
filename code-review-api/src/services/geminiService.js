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
 */
async function* streamResponse(prompt) {
  try {
    logger.info('Calling Gemini API (streaming mode)');
    logger.debug(`Prompt length: ${prompt.length} characters`);
    
    const startTime = Date.now();
    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    logger.info(`Gemini API stream initialized in ${Date.now() - startTime}ms`);
    
    let chunkCount = 0;
    let totalCharsReceived = 0;
    
    // Yield chunks as they arrive
    for await (const chunk of result.stream) {
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
  } catch (error) {
    logger.error('Error streaming from Gemini API:', error);
    if (error.response) {
      logger.error(`Gemini API error response: ${JSON.stringify(error.response)}`);
    }
    throw error;
  }
}

/**
 * Generate a non-streaming response from the Gemini API
 * Returns the complete response text
 */
async function generateContent(prompt) {
  try {
    logger.info('Calling Gemini API (non-streaming mode)');
    logger.debug(`Prompt length: ${prompt.length} characters`);
    
    const startTime = Date.now();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    const responseText = result.response.text();
    const duration = Date.now() - startTime;
    
    logger.info(`Gemini API response received in ${duration}ms, ${responseText.length} chars`);
    
    return responseText;
  } catch (error) {
    logger.error('Error generating content from Gemini API:', error);
    if (error.response) {
      logger.error(`Gemini API error response: ${JSON.stringify(error.response)}`);
    }
    if (error.message) {
      logger.error(`Error message: ${error.message}`);
    }
    throw error;
  }
}

module.exports = {
  streamResponse,
  generateContent
};