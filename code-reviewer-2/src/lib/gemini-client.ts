import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';

/**
 * Configuration for Gemini API generations
 */
const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 65536,
};

/**
 * Class to handle interactions with the Gemini API
 */
export class GeminiClient {
  private model: GenerativeModel;
  private static instance: GeminiClient | null = null;

  /**
   * Creates a new GeminiClient instance
   * @param apiKey - Gemini API key
   */
  private constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: DEFAULT_GENERATION_CONFIG,
    });
  }

  /**
   * Gets a singleton instance of the GeminiClient
   * @returns GeminiClient instance
   */
  public static getInstance(): GeminiClient {
    if (!GeminiClient.instance) {
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in environment variables");
      }
      
      GeminiClient.instance = new GeminiClient(apiKey);
    }
    
    return GeminiClient.instance;
  }

  /**
   * Streams a response from the Gemini API for a given prompt
   * @param prompt - The prompt to send to Gemini
   * @returns An async generator yielding chunks of the response
   */
  public async *streamResponse(prompt: string): AsyncGenerator<string> {
    try {
      const result = await this.model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      // Yield chunks as they arrive
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      console.error('Error streaming from Gemini API:', error);
      throw error;
    }
  }

  /**
   * Generates a non-streaming response from the Gemini API
   * @param prompt - The prompt to send to Gemini
   * @returns The complete response text
   */
  public async generateContent(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      
      return result.response.text();
    } catch (error) {
      console.error('Error generating content from Gemini API:', error);
      throw error;
    }
  }
}

/**
 * Factory function to get the GeminiClient instance
 * @returns The GeminiClient singleton instance
 */
export function getGeminiClient(): GeminiClient {
  return GeminiClient.getInstance();
}