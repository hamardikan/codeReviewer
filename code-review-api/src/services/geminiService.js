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
    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    // Yield chunks as they arrive
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    logger.error('Error streaming from Gemini API:', error);
    throw error;
  }
}

/**
 * Generate a non-streaming response from the Gemini API
 * Returns the complete response text
 */
async function generateContent(prompt) {
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    return result.response.text();
  } catch (error) {
    logger.error('Error generating content from Gemini API:', error);
    throw error;
  }
}

module.exports = {
  streamResponse,
  generateContent
};